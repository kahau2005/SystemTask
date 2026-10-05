import database
import models
from main import get_password_hash

# Create tables
models.Base.metadata.create_all(bind=database.engine)

# Create admin user pmhau
db = database.SessionLocal()
admin = db.query(models.User).filter(models.User.username == "pmhau").first()
if not admin:
    admin_user = models.User(
        username="pmhau",
        full_name="Hậu",
        hashed_password=get_password_hash("Hau@0123321123"),
        is_admin=True
    )
    db.add(admin_user)
    
db.commit()
db.close()
print("Database initialized with admin pmhau")
