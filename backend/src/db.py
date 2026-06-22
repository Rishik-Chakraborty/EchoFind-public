from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import os

# Load DB URL from .env (already set for Docker)
DATABASE_URL = os.getenv("POSTGRES_URL")

engine = create_engine(DATABASE_URL, echo=False, future=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Dependency for FastAPI
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
