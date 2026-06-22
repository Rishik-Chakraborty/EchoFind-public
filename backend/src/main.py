import os
from fastapi import FastAPI, UploadFile, File, BackgroundTasks, HTTPException, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from fastapi.middleware.cors import CORSMiddleware
from typing import List
from .db import get_db
from .schemas import UploadResponse, SearchRequest, SearchResult
from .core.indexer import process_upload
from .core.embedder import ClapEmbedder

app = FastAPI()

# Add CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/api/v1/upload", response_model=UploadResponse)
async def upload_audio(
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db),
):
    upload_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "uploads"))
    os.makedirs(upload_dir, exist_ok=True)
    file_path = os.path.join(upload_dir, file.filename)

    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    result = db.execute(
        text("INSERT INTO audio_jobs (file_url, status) VALUES (:file_url, 'queued') RETURNING id"),
        {"file_url": file_path},
    )
    job_id = result.fetchone()[0]
    db.commit()

    background_tasks.add_task(process_upload, job_id=job_id, file_path=file_path)
    return {"job_id": job_id, "status": "queued"}


@app.get("/api/v1/jobs/{job_id}")
def get_job_status(job_id: int, db: Session = Depends(get_db)):
    """Poll job indexing status."""
    row = db.execute(
        text("SELECT id, status FROM audio_jobs WHERE id = :job_id"),
        {"job_id": job_id},
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"job_id": row[0], "status": row[1]}


def _temporal_rerank(raw: list, gap_s: float = 0.5) -> List[SearchResult]:
    """Merge overlapping/adjacent chunks into contiguous acoustic events and
    boost their score.

    Algorithm:
    1. Sort candidates by start_time.
    2. Merge any two chunks whose gap is <= gap_s into a single event,
       taking the minimum (best) distance score of the group.
    3. Apply a continuity bonus: longer continuous events get a score
       improvement of 3% per extra chunk merged (capped at 25%).
    4. Return results sorted by final score (ascending = better).
    """
    if not raw:
        return []

    # Sort by start_time for merging
    sorted_chunks = sorted(raw, key=lambda r: r.start_time)

    events = []
    current = {
        "file_id": sorted_chunks[0].file_id,
        "start_time": sorted_chunks[0].start_time,
        "end_time": sorted_chunks[0].end_time,
        "resolution_type": sorted_chunks[0].resolution_type,
        "best_score": sorted_chunks[0].score,
        "count": 1,
    }

    for chunk in sorted_chunks[1:]:
        gap = chunk.start_time - current["end_time"]
        if gap <= gap_s:
            # Merge: extend the event window, keep the best (lowest) score
            current["end_time"] = max(current["end_time"], chunk.end_time)
            if chunk.score < current["best_score"]:
                current["best_score"] = chunk.score
                current["resolution_type"] = chunk.resolution_type
            current["count"] += 1
        else:
            events.append(current)
            current = {
                "file_id": chunk.file_id,
                "start_time": chunk.start_time,
                "end_time": chunk.end_time,
                "resolution_type": chunk.resolution_type,
                "best_score": chunk.score,
                "count": 1,
            }
    events.append(current)

    # Apply continuity bonus: each additional merged chunk reduces distance by 3%
    results = []
    for ev in events:
        bonus = min(0.25, 0.03 * (ev["count"] - 1))
        final_score = ev["best_score"] * (1.0 - bonus)
        results.append(SearchResult(
            file_id=ev["file_id"],
            start_time=ev["start_time"],
            end_time=ev["end_time"],
            resolution_type=ev["resolution_type"],
            score=round(final_score, 6),
        ))

    results.sort(key=lambda r: r.score)
    return results


# Semantic expansions: CLAP works better with varied phrasings since it was
# trained on audio-caption pairs, not single keywords.
_QUERY_EXPANSIONS = {
    1: [],   # 1 phrase  = just the original
    2: ["a {q}", "the sound of {q}"],
    3: ["a {q}", "the sound of {q}", "{q} audio"],
    5: ["a {q}", "the sound of {q}", "{q} audio", "recording of {q}", "{q} noise"],
}

def _build_queries(text: str, n: int = 5) -> List[str]:
    """Return up to n query phrasings for ensemble embedding."""
    base = [text]
    templates = _QUERY_EXPANSIONS.get(n, _QUERY_EXPANSIONS[5])
    for t in templates:
        phrase = t.format(q=text)
        if phrase not in base:
            base.append(phrase)
    return base[:n]


@app.post("/api/v1/search")
def search(request: SearchRequest, db: Session = Depends(get_db)):
    """Semantic audio search with query ensemble + temporal reranking.

    Steps:
    1. Generate 5 query phrasings from the user's text.
    2. Embed all phrasings with CLAP and average them → robust query vector.
    3. Retrieve top-80 candidates from pgvector.
    4. Apply per-resolution score thresholds (250ms is looser since short
       clips are noisier embeddings).
    5. Temporal rerank: merge adjacent chunks into events, apply continuity
       bonus.
    6. Return top-15 events sorted by final score.
    """
    import numpy as np

    embedder = ClapEmbedder()

    # --- Query ensemble: average embeddings across multiple phrasings ---
    phrases = _build_queries(request.text, n=5)
    vecs = np.stack([embedder.embed_text_query(p) for p in phrases])
    # L2-normalise the mean so cosine distance stays meaningful
    mean_vec = vecs.mean(axis=0)
    mean_vec = mean_vec / (np.linalg.norm(mean_vec) + 1e-9)

    # --- Retrieve generous candidate pool (200 candidates) ---
    sql = text("""
        SELECT file_id, start_time, end_time, resolution_type,
               (embedding <=> CAST(:query_vec AS vector)) AS score
        FROM audio_chunks
        ORDER BY score ASC
        LIMIT 200;
    """)
    rows = db.execute(sql, {"query_vec": str(mean_vec.tolist())}).fetchall()

    # Per-resolution thresholds — short clips (250ms) produce noisier CLAP
    # embeddings so they get a wider net; longer windows embed more robustly.
    THRESHOLDS = {
        "250ms": 0.88,
        "2s":    0.80,
        "5s":    0.76,
    }
    candidates = [
        SearchResult(
            file_id=row[0],
            start_time=row[1],
            end_time=row[2],
            resolution_type=row[3],
            score=row[4],
        )
        for row in rows
        if row[4] < THRESHOLDS.get(row[3], 0.80)
    ]

    # Temporal rerank and return top-15 events
    events = _temporal_rerank(candidates)
    return events[:15]
