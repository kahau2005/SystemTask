from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class UserBase(BaseModel):
    username: str
    full_name: Optional[str] = None

class UserCreate(UserBase):
    password: str

class User(UserBase):
    id: int
    is_admin: bool

    class Config:
        from_attributes = True

class TaskBase(BaseModel):
    title: str
    description: Optional[str] = None
    start_time: datetime
    deadline: datetime

class TaskCreate(TaskBase):
    assignee_ids: List[int]

class Task(TaskBase):
    id: int
    status: str
    assignee_id: int
    creator_id: Optional[int] = None
    
    assignee: Optional[UserBase] = None

    class Config:
        from_attributes = True

class TaskTemplateBase(BaseModel):
    title: str
    description: Optional[str] = None
    cron_expression: str # e.g. "0 9 * * 1" for every Monday at 9AM

class TaskTemplateCreate(TaskTemplateBase):
    pass

class TaskTemplate(TaskTemplateBase):
    id: int
    last_assigned_user_id: Optional[int] = None

    class Config:
        from_attributes = True

class PenaltyLogBase(BaseModel):
    amount: int
    reason: str

class PenaltyLog(PenaltyLogBase):
    id: int
    user_id: int
    task_id: int
    created_at: datetime
    is_paid: bool = False
    
    user: Optional[UserBase] = None

    class Config:
        from_attributes = True

class TaskLogBase(BaseModel):
    action: str
    reason: Optional[str] = None

class TaskLogCreate(BaseModel):
    reason: Optional[str] = None

class TaskLog(TaskLogBase):
    id: int
    task_id: int
    user_id: int
    created_at: datetime
    
    user: Optional[UserBase] = None
    task: Optional[Task] = None

    class Config:
        from_attributes = True

class Notification(BaseModel):
    id: int
    user_id: Optional[int]
    message: str
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None
