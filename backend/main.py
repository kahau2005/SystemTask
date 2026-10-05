from fastapi import FastAPI, Depends, HTTPException, status, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from passlib.context import CryptContext
from datetime import datetime, timedelta
from jose import JWTError, jwt
import models, schemas, database
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
import asyncio
import json

# Setup DB
models.Base.metadata.create_all(bind=database.engine)

app = FastAPI(title="Roommate Task Manager API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
SECRET_KEY = "super_secret_key_for_roommates_task_manager"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 30 # 30 days for persistent login

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# Websocket Manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            await connection.send_text(message)

manager = ConnectionManager()

# Background Scheduler
scheduler = BackgroundScheduler()

def check_overdue_tasks():
    # Logic to check overdue tasks and create penalty logs
    # In a real app, this runs in a thread, so we need a DB session
    db = database.SessionLocal()
    now = datetime.utcnow()
    # Find overdue tasks
    overdue_tasks = db.query(models.Task).filter(
        models.Task.deadline < now, 
        models.Task.status == 'todo'
    ).all()
    
    for task in overdue_tasks:
        task.status = 'overdue'
        penalty = models.PenaltyLog(user_id=task.assignee_id, task_id=task.id, reason="Quá hạn task", amount=50000)
        db.add(penalty)
        
        # Add to global TaskLogs (Nhật ký công việc)
        task_log = models.TaskLog(task_id=task.id, user_id=None, action="overdue", reason="Hệ thống tự động đánh dấu quá hạn")
        db.add(task_log)
        
        db.commit()
        # Broadcast via websocket - in real implementation needs async handling from sync context
    
    db.close()

def process_template_job(template_id: int):
    db = database.SessionLocal()
    template = db.query(models.TaskTemplate).filter(models.TaskTemplate.id == template_id).first()
    if not template:
        db.close()
        return
        
    # Get all regular users (exclude admin)
    users = db.query(models.User).filter(models.User.is_admin == False).order_by(models.User.id).all()
    if not users:
        db.close()
        return
        
    # Find next user
    next_user = users[0]
    if template.last_assigned_user_id:
        for i, u in enumerate(users):
            if u.id == template.last_assigned_user_id:
                if i + 1 < len(users):
                    next_user = users[i + 1]
                break
                
    # Create the task
    # Set deadline to 24 hours from now for automated tasks
    deadline = datetime.utcnow() + timedelta(days=1)
    new_task = models.Task(
        title=template.title,
        description=template.description,
        deadline=deadline,
        assignee_id=next_user.id
    )
    db.add(new_task)
    
    # Update template
    template.last_assigned_user_id = next_user.id
    db.commit()
    
    # Try to broadcast - in a real app, use a queue or redis for cross-thread async communication
    # For now we'll just let it create silently in DB
    db.close()

scheduler.add_job(check_overdue_tasks, 'interval', minutes=10)

# Load existing templates on startup
def load_templates():
    db = database.SessionLocal()
    templates = db.query(models.TaskTemplate).all()
    for t in templates:
        try:
            if t.cron_expression.startswith("interval:"):
                days = int(t.cron_expression.split(":")[1])
                trigger = IntervalTrigger(days=days)
            else:
                trigger = CronTrigger.from_crontab(t.cron_expression)
            scheduler.add_job(process_template_job, trigger, args=[t.id], id=f"template_{t.id}", replace_existing=True)
        except Exception:
            pass
    db.close()

load_templates()
scheduler.start()


# Helper functions
def get_password_hash(password):
    return pwd_context.hash(password)

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(database.get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = db.query(models.User).filter(models.User.username == username).first()
    if user is None:
        raise credentials_exception
    return user

# Routes
@app.post("/token", response_model=schemas.Token)
def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(database.get_db)):
    user = db.query(models.User).filter(models.User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = create_access_token(data={"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/users/", response_model=schemas.User)
def create_user(user: schemas.UserCreate, db: Session = Depends(database.get_db)):
    db_user = db.query(models.User).filter(models.User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    hashed_password = get_password_hash(user.password)
    db_user = models.User(username=user.username, full_name=user.full_name, hashed_password=hashed_password)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

@app.get("/users/", response_model=list[schemas.User])
def get_users(db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    return db.query(models.User).all()

@app.get("/users/me/", response_model=schemas.User)
def read_users_me(current_user: models.User = Depends(get_current_user)):
    return current_user

@app.get("/tasks/", response_model=list[schemas.Task])
def get_tasks(db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    if current_user.is_admin:
        return db.query(models.Task).order_by(models.Task.start_time.desc()).all()
    return db.query(models.Task).filter(
        (models.Task.assignee_id == current_user.id) | (models.Task.creator_id == current_user.id)
    ).order_by(models.Task.start_time.desc()).all()

@app.post("/tasks/", response_model=list[schemas.Task])
async def create_task(task: schemas.TaskCreate, db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    created_tasks = []
    for assignee_id in task.assignee_ids:
        db_task = models.Task(
            title=task.title,
            description=task.description,
            start_time=task.start_time,
            deadline=task.deadline,
            assignee_id=assignee_id,
            creator_id=current_user.id
        )
        db.add(db_task)
        db.commit() # commit early to get task.id
        db.refresh(db_task)
        
        # Log task creation
        log = models.TaskLog(task_id=db_task.id, user_id=current_user.id, action="created")
        db.add(log)
        
        created_tasks.append(db_task)
    db.commit()
    
    # Notify users and save notification
    msg = f"Task mới: {task.title}"
    for assignee_id in task.assignee_ids:
        db.add(models.Notification(user_id=assignee_id, message=msg))
    db.commit()
    await manager.broadcast(json.dumps({"type": "NEW_TASK", "message": msg}))
    
    return created_tasks

@app.put("/tasks/{task_id}/complete")
async def complete_task(task_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.assignee_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your task")
    
    task.status = "pending_approval"
    log = models.TaskLog(task_id=task.id, user_id=current_user.id, action="completed", reason="Đã báo cáo hoàn thành")
    db.add(log)
    msg = f"Task {task.title} đang chờ duyệt"
    db.add(models.Notification(user_id=None, message=msg)) # global for admins
    db.commit()
    await manager.broadcast(json.dumps({"type": "TASK_UPDATED", "message": msg}))
    return {"message": "Task marked as pending approval"}

@app.put("/tasks/{task_id}/approve")
async def approve_task(task_id: int, payload: schemas.TaskLogCreate, db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if not current_user.is_admin and task.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    task.status = "completed"
    
    log = models.TaskLog(task_id=task.id, user_id=current_user.id, action="approved", reason=payload.reason)
    db.add(log)
    msg = f"Task {task.title} đã được duyệt"
    db.add(models.Notification(user_id=task.assignee_id, message=msg))
    db.commit()
    await manager.broadcast(json.dumps({"type": "TASK_APPROVED", "message": msg}))
    return {"message": "Task approved"}

@app.put("/tasks/{task_id}/reject")
async def reject_task(task_id: int, payload: schemas.TaskLogCreate, db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if not current_user.is_admin and task.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    task.status = "todo"
    
    log = models.TaskLog(task_id=task.id, user_id=current_user.id, action="rejected", reason=payload.reason)
    db.add(log)
    msg = f"Task {task.title} bị từ chối, yêu cầu làm lại"
    db.add(models.Notification(user_id=task.assignee_id, message=msg))
    db.commit()
    await manager.broadcast(json.dumps({"type": "TASK_REJECTED", "message": msg}))
    return {"message": "Task rejected"}

@app.get("/logs/", response_model=list[schemas.TaskLog])
def get_global_logs(db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    return db.query(models.TaskLog).order_by(models.TaskLog.created_at.desc()).limit(50).all()

@app.get("/tasks/{task_id}/logs", response_model=list[schemas.TaskLog])
def get_task_logs(task_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    return db.query(models.TaskLog).filter(models.TaskLog.task_id == task_id).order_by(models.TaskLog.created_at.desc()).all()

@app.get("/notifications/", response_model=list[schemas.Notification])
def get_notifications(db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    return db.query(models.Notification).filter(
        (models.Notification.user_id == current_user.id) | (models.Notification.user_id == None)
    ).order_by(models.Notification.created_at.desc()).limit(20).all()

@app.put("/notifications/{notif_id}/read")
def mark_notification_read(notif_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    notif = db.query(models.Notification).filter(models.Notification.id == notif_id).first()
    if notif:
        notif.is_read = True
        db.commit()
    return {"message": "ok"}

@app.post("/task-templates/", response_model=schemas.TaskTemplate)
def create_task_template(template: schemas.TaskTemplateCreate, db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    db_template = models.TaskTemplate(
        title=template.title,
        description=template.description,
        cron_expression=template.cron_expression
    )
    db.add(db_template)
    db.commit()
    db.refresh(db_template)
    
    # Add to scheduler
    try:
        if db_template.cron_expression.startswith("interval:"):
            days = int(db_template.cron_expression.split(":")[1])
            trigger = IntervalTrigger(days=days)
        else:
            trigger = CronTrigger.from_crontab(db_template.cron_expression)
        scheduler.add_job(process_template_job, trigger, args=[db_template.id], id=f"template_{db_template.id}")
    except Exception as e:
        db.delete(db_template)
        db.commit()
        raise HTTPException(status_code=400, detail="Invalid cron expression")
        
    return db_template

@app.get("/task-templates/", response_model=list[schemas.TaskTemplate])
def get_task_templates(db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not authorized")
    return db.query(models.TaskTemplate).all()

@app.get("/penalties/", response_model=list[schemas.PenaltyLog])
def get_penalties(db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    if current_user.is_admin:
        return db.query(models.PenaltyLog).order_by(models.PenaltyLog.created_at.desc()).all()
    return db.query(models.PenaltyLog).filter(models.PenaltyLog.user_id == current_user.id).order_by(models.PenaltyLog.created_at.desc()).all()

@app.put("/penalties/{penalty_id}/pay", response_model=schemas.PenaltyLog)
def pay_penalty(penalty_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not authorized")
    penalty = db.query(models.PenaltyLog).filter(models.PenaltyLog.id == penalty_id).first()
    if not penalty:
        raise HTTPException(status_code=404, detail="Penalty not found")
    penalty.is_paid = True
    db.commit()
    db.refresh(penalty)
    
    # Optional: Log the payment
    log = models.TaskLog(task_id=penalty.task_id, user_id=None, action="thanh toán", reason=f"Thành viên đã đóng {penalty.amount}đ phạt")
    db.add(log)
    db.commit()
    
    return penalty

@app.get("/stats/")
def get_stats(db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    from sqlalchemy.sql import func
    total_fund = db.query(func.sum(models.PenaltyLog.amount)).filter(models.PenaltyLog.is_paid == True).scalar() or 0
    
    # Get leaderboard (most penalized)
    top_penalties = db.query(
        models.User.username,
        func.sum(models.PenaltyLog.amount).label('total_penalty')
    ).join(models.PenaltyLog).group_by(models.User.id).order_by(func.sum(models.PenaltyLog.amount).desc()).all()
    
    # Format leaderboard
    leaderboard = [{"username": r[0], "amount": r[1]} for r in top_penalties]
    
    return {
        "total_fund": total_fund,
        "leaderboard": leaderboard
    }

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
