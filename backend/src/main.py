import os
from fastapi import FastAPI, UploadFile, File, BackgroundTasks, HTTPException, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from fastapi.middleware.cors import CORSMiddleware
from typing import List
from collections import defaultdict
import numpy as np
from .db import get_db
from .schemas import UploadResponse, SearchRequest, SearchResult
from .core.indexer import process_upload
from .core.embedder import ClapEmbedder

app = FastAPI()

@app.on_event("startup")
def startup_event():
    import logging
    logging.info("Initializing CLAP embedder model...")
    ClapEmbedder()
    logging.info("CLAP embedder initialized.")

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


@app.get("/api/v1/audio/{file_id}")
def get_audio_file(file_id: int, db: Session = Depends(get_db)):
    """Serve the raw audio file."""
    from fastapi.responses import FileResponse
    row = db.execute(text("""
        SELECT j.file_url 
        FROM audio_files f 
        JOIN audio_jobs j ON f.job_id = j.id 
        WHERE f.id = :file_id
    """), {"file_id": file_id}).fetchone()
    
    if not row:
        raise HTTPException(status_code=404, detail="File not found")
    
    import os
    file_url = row[0]
    if not os.path.exists(file_url):
        raise HTTPException(status_code=404, detail="File physically missing from disk")
        
    return FileResponse(file_url)



# ---------------------------------------------------------------------------
# Resolution confidence weights — longer chunks produce more stable embeddings
# so we give them a slight advantage during scoring.
# ---------------------------------------------------------------------------
_RESOLUTION_WEIGHTS = {
    "1s":    0.97,
    "2s":    0.95,
}






# Absolute thresholds per resolution. If the distance is higher than this,
# the chunk is rejected as a false positive (it doesn't actually match the query).
_ABSOLUTE_THRESHOLDS = {
    "onset": 0.65,
    "1s":    0.68,
    "2s":    0.66,
}


def _temporal_rerank(raw: list) -> List[SearchResult]:
    """Filter out long contextual chunks to enforce pinpoint highlights,
    and apply Non-Maximum Suppression (NMS) to return isolated hits.
    """
    if not raw:
        return []

    # 1. Filter out 5s and 10s chunks. The user only wants precise highlights.
    short_chunks = [c for c in raw if c.resolution_type in ["1s", "2s", "onset"]]

    # 2. Sort by score (lowest distance is best)
    sorted_chunks = sorted(short_chunks, key=lambda r: r.score)

    # 3. Non-Maximum Suppression (NMS)
    selected = []
    for chunk in sorted_chunks:
        overlap = False
        for s in selected:
            start_max = max(chunk.start_time, s.start_time)
            end_min = min(chunk.end_time, s.end_time)
            if end_min > start_max:
                overlap = True
                break
        if not overlap:
            selected.append(chunk)
            if len(selected) >= 20:
                break

    # Re-sort chronologically for the UI
    selected.sort(key=lambda r: r.start_time)
    return selected


# ---------------------------------------------------------------------------
# Query expansion — more diverse phrasings help CLAP's text encoder produce
# discriminative embeddings.
# ---------------------------------------------------------------------------
_QUERY_EXPANSIONS = [
    "This is a sound of {q}",
    "{q}",
    "A recording of {q}",
    "The sound of {q}",
]

def _build_queries(text: str, n: int = 7) -> List[str]:
    """Return up to n query phrasings for ensemble embedding."""
    base = [text]
    for t in _QUERY_EXPANSIONS:
        phrase = t.format(q=text)
        if phrase not in base:
            base.append(phrase)
        if len(base) >= n:
            break
    return base[:n]


@app.post("/api/v1/search")
def search(request: SearchRequest, db: Session = Depends(get_db)):
    """Semantic audio search with query ensemble + adaptive thresholds +
    cross-resolution fusion + temporal reranking.

    Steps:
    1. Generate up to 7 query phrasings from the user's text.
    2. Embed all phrasings with CLAP, weight the original query 2x, and
       average → robust query vector.
    3. Retrieve top-200 candidates from pgvector.
    4. Apply adaptive score thresholds: use the median of the top candidates
       plus a margin, capped by per-resolution floor thresholds.
    5. Temporal rerank with cross-resolution fusion: merge adjacent chunks,
       fuse multi-resolution evidence, apply continuity bonuses.
    6. Return top-20 events sorted by final score.
    """
    import numpy as np

    embedder = ClapEmbedder()

    # --- Step 1–2: Query ensemble with weighted averaging ---
    phrases = _build_queries(request.text, n=7)
    vecs = []
    for i, p in enumerate(phrases):
        v = embedder.embed_text_query(p)
        # Weight the original query 2x for emphasis
        weight = 2.0 if i == 0 else 1.0
        vecs.append(v * weight)
    vecs = np.stack(vecs)
    mean_vec = vecs.mean(axis=0)
    mean_vec = mean_vec / (np.linalg.norm(mean_vec) + 1e-9)

    # --- Step 3: Retrieve candidates ---
    sql = text("""
        SELECT ac.file_id, ac.start_time, ac.end_time, ac.resolution_type,
               (ac.embedding <=> CAST(:query_vec AS vector)) AS score,
               af.filename
        FROM audio_chunks ac
        JOIN audio_files af ON ac.file_id = af.id
        ORDER BY score ASC
        LIMIT 1000;
    """)
    rows = db.execute(sql, {"query_vec": str(mean_vec.tolist())}).fetchall()

    if not rows:
        return []

    # --- Step 4: Absolute thresholds ---
    candidates = []
    for row in rows:
        res_type = row[3]
        score = row[4]
        filename = row[5]
        if score < _ABSOLUTE_THRESHOLDS.get(res_type, 0.75):
            candidates.append(SearchResult(
                file_id=row[0],
                start_time=row[1],
                end_time=row[2],
                resolution_type=res_type,
                score=score,
                filename=filename,
            ))

    # --- Step 5–6: Temporal rerank and return top-20 ---
    events = _temporal_rerank(candidates)
    return events[:20]

@app.post("/api/v1/search/audio")
async def search_audio(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Semantic audio-to-audio search (KNN) with dynamic onboarding."""
    import librosa
    import tempfile
    import os
    import numpy as np

    # 1. Load audio file via librosa
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name
        
    try:
        y, _ = librosa.load(tmp_path, sr=48000, mono=True, dtype=np.float32)
        peak = np.max(np.abs(y))
        if peak > 0:
            y = y / peak
    finally:
        os.remove(tmp_path)

    # 2. Embed audio directly
    embedder = ClapEmbedder()
    embeddings = embedder.embed_audio_batch([y])
    query_vec = embeddings[0]
    
    # 3. Retrieve candidates
    sql = text("""
        SELECT ac.file_id, ac.start_time, ac.end_time, ac.resolution_type,
               (ac.embedding <=> CAST(:query_vec AS vector)) AS score,
               af.filename
        FROM audio_chunks ac
        JOIN audio_files af ON ac.file_id = af.id
        ORDER BY score ASC
        LIMIT 1000;
    """)
    rows = db.execute(sql, {"query_vec": str(query_vec.tolist())}).fetchall()

    if not rows:
        return []

    # 4. Absolute thresholds
    candidates = []
    for row in rows:
        res_type = row[3]
        score = row[4]
        filename = row[5]
        if score < _ABSOLUTE_THRESHOLDS.get(res_type, 0.75):
            candidates.append(SearchResult(
                file_id=row[0],
                start_time=row[1],
                end_time=row[2],
                resolution_type=res_type,
                score=score,
                filename=filename,
            ))

    # 5. Temporal rerank and return
    events = _temporal_rerank(candidates)
    return events[:20]

@app.get("/api/v1/corpus/map")
def get_corpus_map(db: Session = Depends(get_db)):
    """Fetch all embeddings, run PCA down to 3D, and cluster them."""
    import numpy as np
    import json
    
    # Fast import inside endpoint to keep startup fast
    from sklearn.decomposition import PCA
    from sklearn.cluster import KMeans

    # Fetch max 2000 embeddings to prevent browser lag
    sql = text("""
        SELECT id, file_id, start_time, end_time, resolution_type, embedding::text
        FROM audio_chunks
        LIMIT 2000;
    """)
    rows = db.execute(sql).fetchall()

    if not rows:
        return []

    data = []
    embeddings = []
    for row in rows:
        # row[5] is the vector string like '[0.1, 0.2, ...]'
        try:
            vec = json.loads(row[5])
            embeddings.append(vec)
            data.append({
                "id": row[0],
                "file_id": row[1],
                "start_time": row[2],
                "end_time": row[3],
                "resolution_type": row[4],
            })
        except Exception:
            continue

    if not embeddings:
        return []

    X = np.array(embeddings)
    
    # Only run PCA if we have enough points
    if len(X) < 3:
        return []
        
    # PCA to 3D
    pca = PCA(n_components=3)
    X_3d = pca.fit_transform(X)

    # K-Means clustering
    n_clusters = min(5, len(X))
    kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
    labels = kmeans.fit_predict(X_3d)

    # Find outliers (points furthest from their cluster center)
    centers = kmeans.cluster_centers_
    distances = [np.linalg.norm(X_3d[i] - centers[labels[i]]) for i in range(len(X_3d))]
    
    # 95th percentile distance threshold for outliers
    threshold = np.percentile(distances, 95) if len(distances) > 0 else float('inf')

    # Construct response
    results = []
    for i in range(len(data)):
        results.append({
            **data[i],
            "x": float(X_3d[i][0]),
            "y": float(X_3d[i][1]),
            "z": float(X_3d[i][2]),
            "cluster": int(labels[i]),
            "is_outlier": bool(distances[i] > threshold)
        })

    return results

