import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "src")))

from db import SessionLocal
from sqlalchemy import text

def purge():
    db = SessionLocal()
    try:
        print("Truncating tables...")
        db.execute(text("TRUNCATE TABLE audio_chunks, audio_files, audio_jobs RESTART IDENTITY CASCADE;"))
        db.commit()
        print("Database purged successfully.")
    except Exception as e:
        db.rollback()
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    purge()
