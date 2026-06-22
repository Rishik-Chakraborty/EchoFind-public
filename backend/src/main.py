import os
from fastapi import FastAPI, UploadFile, File, BackgroundTasks, HTTPException, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from .db import get_db
from .schemas import UploadResponse, SearchRequest, SearchResult
from .core.indexer import process_upload
from .core.embedder import ClapEmbedder
from .core.audio_dsp import AudioFragmenter

app = FastAPI()

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/api/v1/upload", response_model=UploadResponse)
async def upload_audio(file: UploadFile = File(...), background_tasks: BackgroundTasks = None, db: Session = Depends(get_db)):
    # Ensure uploads directory exists
    upload_dir = os.path.abspath(os.path.join(os.getcwd(), "uploads"))
    os.makedirs(upload_dir, exist_ok=True)
    file_path = os.path.join(upload_dir, file.filename)
    # Save file to disk
    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)
    # Insert job row
    insert_job_sql = """
        INSERT INTO audio_jobs (file_url, status) VALUES (:file_url, 'queued') RETURNING id;
    """
    result = db.execute(insert_job_sql, {"file_url": file_path})
    job_id = result.fetchone()[0]
    db.commit()
    # Schedule background processing
    background_tasks.add_task(process_upload, job_id=job_id, file_path=file_path)
    return {"job_id": job_id, "status": "queued"}

@app.post("/api/v1/search")
def search(request: SearchRequest, db: Session = Depends(get_db)):
    # Encode query
    embedder = ClapEmbedder()
    query_vec = embedder.embed_text_query(request.text)
    # Perform pgvector cosine distance search
    sql = """
        SELECT file_id, start_time, end_time, resolution_type,
               (embedding <=> :query_vec) AS score
        FROM audio_chunks
        ORDER BY score ASC
        LIMIT 5;
    """
    rows = db.execute(sql, {"query_vec": query_vec.tolist()}).fetchall()
    results = []
    for row in rows:
        results.append(SearchResult(
            file_id=row[0],
            start_time=row[1],
            end_time=row[2],
            resolution_type=row[3],
            score=row[4]
        ))
    return results
