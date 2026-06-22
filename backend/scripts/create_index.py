import sys
import os

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "src")))
from db import engine
from sqlalchemy import text

def create_index():
    print("Creating HNSW index on audio_chunks.embedding...")
    with engine.connect() as conn:
        conn.execute(text("CREATE INDEX IF NOT EXISTS audio_chunks_embedding_idx ON audio_chunks USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);"))
        conn.commit()
    print("HNSW index created successfully.")

if __name__ == "__main__":
    create_index()
