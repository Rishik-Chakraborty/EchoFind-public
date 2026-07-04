import os
import re
import time
import hashlib
from fastapi import FastAPI, UploadFile, File, Form, BackgroundTasks, HTTPException, Depends, Request, Security
from fastapi.responses import JSONResponse
from fastapi.security import APIKeyHeader
from sqlalchemy.orm import Session
from sqlalchemy import text
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from typing import List
from collections import defaultdict
import numpy as np
from .db import get_db
from .schemas import UploadResponse, ChunkUploadResponse, CompleteUploadResponse, SearchRequest, SearchResult
from .core.indexer import process_upload
from .core.embedder import ClapEmbedder

# ---------------------------------------------------------------------------
# Security configuration
# ---------------------------------------------------------------------------
MAX_UPLOAD_SIZE_MB = int(os.getenv("MAX_UPLOAD_SIZE_MB", "50"))
MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024
MAX_CONCURRENT_JOBS = int(os.getenv("MAX_CONCURRENT_JOBS", "3"))
MAX_SEARCH_TEXT_LENGTH = int(os.getenv("MAX_SEARCH_TEXT_LENGTH", "500"))
API_KEY = os.getenv("ECHOFIND_API_KEY", "")  # Set in production!

ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "https://echo-find.vercel.app",
    "https://echofind.vercel.app",
    # Add your actual deployed frontend URL(s) here
]
# Allow overriding via env for flexibility
_extra_origins = os.getenv("ALLOWED_ORIGINS", "")
if _extra_origins:
    ALLOWED_ORIGINS.extend([o.strip() for o in _extra_origins.split(",") if o.strip()])

# Allowed audio file extensions
ALLOWED_EXTENSIONS = {".mp3", ".wav", ".flac", ".ogg", ".m4a", ".webm", ".mp4", ".aac", ".wma"}

# Rate limiter using X-User-Id header from Next.js proxy, falling back to IP
def get_user_or_ip(request: Request):
    user_id = request.headers.get("X-User-Id")
    if user_id:
        return user_id
    return get_remote_address(request)

limiter = Limiter(key_func=get_user_or_ip)

app = FastAPI()
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ---------------------------------------------------------------------------
# API key authentication
# ---------------------------------------------------------------------------
_api_key_header = APIKeyHeader(name="Authorization", auto_error=False)

async def verify_api_key(request: Request, api_key: str = Security(_api_key_header)):
    """Verify API key if ECHOFIND_API_KEY is set. Skip for /health."""
    if not API_KEY:
        # No API key configured — allow all requests (dev mode)
        return
    if not api_key:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    # Support "Bearer <key>" format
    token = api_key.replace("Bearer ", "").strip()
    if not hashlib.sha256(token.encode()).hexdigest() == hashlib.sha256(API_KEY.encode()).hexdigest():
        raise HTTPException(status_code=401, detail="Invalid API key")

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _sanitize_filename(filename: str) -> str:
    """Remove path components and dangerous characters from a filename."""
    # Strip any directory components
    filename = os.path.basename(filename)
    # Remove anything that isn't alphanumeric, dash, underscore, dot, or space
    filename = re.sub(r'[^\w\s\-.]', '_', filename)
    # Collapse multiple underscores/dots
    filename = re.sub(r'[_]{2,}', '_', filename)
    filename = re.sub(r'[.]{2,}', '.', filename)
    # Ensure it's not empty
    if not filename or filename.startswith('.'):
        filename = f"upload_{int(time.time())}.audio"
    return filename

def _check_file_extension(filename: str):
    """Validate that the file has an allowed audio extension."""
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type '{ext}' not allowed. Accepted: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
        )

def _check_concurrent_jobs(db: Session):
    """Reject uploads if too many jobs are already running."""
    active = db.execute(
        text("SELECT COUNT(*) FROM audio_jobs WHERE status IN ('queued', 'processing')")
    ).scalar()
    if active >= MAX_CONCURRENT_JOBS:
        raise HTTPException(
            status_code=429,
            detail=f"Too many active jobs ({active}/{MAX_CONCURRENT_JOBS}). Please wait for current jobs to complete."
        )

@app.on_event("startup")
def startup_event():
    import logging
    from .db import SessionLocal

    # ---------------------------------------------------------------------------
    # Zombie job recovery: any job left in 'queued' or 'processing' from a
    # previous crashed/restarted server run will never complete. Mark them all
    # as 'failed' immediately so they don't permanently consume concurrent job
    # slots and block new uploads.
    # ---------------------------------------------------------------------------
    logging.info("Recovering zombie jobs from previous server run...")
    db = SessionLocal()
    try:
        result = db.execute(text("""
            UPDATE audio_jobs
            SET status = 'failed', updated_at = now()
            WHERE status IN ('queued', 'processing')
            RETURNING id
        """))
        recovered = result.fetchall()
        db.commit()
        if recovered:
            ids = [str(r[0]) for r in recovered]
            logging.warning(f"Marked {len(ids)} zombie job(s) as failed: {', '.join(ids)}")
        else:
            logging.info("No zombie jobs found.")
    except Exception as e:
        db.rollback()
        logging.error(f"Error during zombie job recovery: {e}")
    finally:
        db.close()

    logging.info("Ensuring database tables exist...")
    db = SessionLocal()
    try:
        db.execute(text("""
            CREATE EXTENSION IF NOT EXISTS pg_trgm;
            CREATE TABLE IF NOT EXISTS audio_transcripts (
                id SERIAL PRIMARY KEY,
                file_id INTEGER REFERENCES audio_files(id) ON DELETE CASCADE,
                start_time FLOAT NOT NULL,
                end_time FLOAT NOT NULL,
                text TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_audio_transcripts_file_id ON audio_transcripts(file_id);
            CREATE INDEX IF NOT EXISTS idx_audio_transcripts_text_trgm
                ON audio_transcripts USING gin (text gin_trgm_ops);
            CREATE INDEX IF NOT EXISTS idx_audio_transcripts_text_fts
                ON audio_transcripts USING gin (to_tsvector('english', text));
            ALTER TABLE audio_jobs ADD COLUMN IF NOT EXISTS progress FLOAT DEFAULT 0.0;
        """))
        db.commit()
        logging.info("Database tables verified.")
    except Exception as e:
        db.rollback()
        logging.error(f"Error ensuring database tables exist: {e}")
    finally:
        db.close()

    logging.info("Initializing CLAP embedder model...")
    ClapEmbedder()
    logging.info("CLAP embedder initialized.")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/api/v1/upload", response_model=UploadResponse)
@limiter.limit("5/minute")
async def upload_audio(
    request: Request,
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db),
    _auth: None = Depends(verify_api_key),
):
    # Validate filename and extension
    safe_name = _sanitize_filename(file.filename or "unknown.audio")
    _check_file_extension(safe_name)

    # Check concurrent job limit
    _check_concurrent_jobs(db)

    # Read content with size limit enforcement
    content = await file.read()
    if len(content) > MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({len(content) / 1024 / 1024:.1f} MB). Maximum is {MAX_UPLOAD_SIZE_MB} MB."
        )

    upload_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "uploads"))
    os.makedirs(upload_dir, exist_ok=True)
    file_path = os.path.join(upload_dir, safe_name)

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

@app.post("/api/v1/upload/chunk", response_model=ChunkUploadResponse)
@limiter.limit("60/minute")
async def upload_chunk(
    request: Request,
    file: UploadFile = File(...),
    upload_id: str = Form(...),
    chunk_index: int = Form(...),
    _auth: None = Depends(verify_api_key),
):
    upload_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "uploads", "chunks", upload_id))
    os.makedirs(upload_dir, exist_ok=True)
    
    content = await file.read()
    chunk_path = os.path.join(upload_dir, f"chunk_{chunk_index}")
    with open(chunk_path, "wb") as f:
        f.write(content)
        
    return {"status": "ok", "message": f"Chunk {chunk_index} received"}

@app.post("/api/v1/upload/complete", response_model=CompleteUploadResponse)
@limiter.limit("5/minute")
async def upload_complete(
    request: Request,
    upload_id: str = Form(...),
    filename: str = Form(...),
    total_chunks: int = Form(...),
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db),
    _auth: None = Depends(verify_api_key),
):
    # Check concurrent job limit
    _check_concurrent_jobs(db)
    
    safe_name = _sanitize_filename(filename or "unknown.audio")
    _check_file_extension(safe_name)
    
    chunk_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "uploads", "chunks", upload_id))
    if not os.path.exists(chunk_dir):
        raise HTTPException(status_code=400, detail="Upload ID not found")
        
    upload_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "uploads"))
    os.makedirs(upload_dir, exist_ok=True)
    file_path = os.path.join(upload_dir, f"{upload_id}_{safe_name}")
    
    # Reassemble chunks
    with open(file_path, "wb") as outfile:
        for i in range(total_chunks):
            chunk_path = os.path.join(chunk_dir, f"chunk_{i}")
            if not os.path.exists(chunk_path):
                raise HTTPException(status_code=400, detail=f"Missing chunk {i}")
            with open(chunk_path, "rb") as infile:
                outfile.write(infile.read())
            os.remove(chunk_path)
            
    os.rmdir(chunk_dir)

    result = db.execute(
        text("INSERT INTO audio_jobs (file_url, status) VALUES (:file_url, 'queued') RETURNING id"),
        {"file_url": file_path},
    )
    job_id = result.fetchone()[0]
    db.commit()

    background_tasks.add_task(process_upload, job_id=job_id, file_path=file_path)
    return {"job_id": job_id, "status": "queued"}


@app.get("/api/v1/jobs/{job_id}")
@limiter.limit("60/minute")
def get_job_status(request: Request, job_id: int, db: Session = Depends(get_db), _auth: None = Depends(verify_api_key)):
    """Poll job indexing status with progress percentage."""
    row = db.execute(
        text("SELECT id, status, COALESCE(progress, 0.0) FROM audio_jobs WHERE id = :job_id"),
        {"job_id": job_id},
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Job not found")
    
    file_id = None
    if row[1] == 'completed':
        file_row = db.execute(
            text("SELECT id FROM audio_files WHERE job_id = :job_id"),
            {"job_id": job_id}
        ).fetchone()
        if file_row:
            file_id = file_row[0]
            
    return {"job_id": row[0], "status": row[1], "progress": row[2], "file_id": file_id}


@app.get("/api/v1/audio/{file_id}")
@limiter.limit("30/minute")
def get_audio_file(request: Request, file_id: int, db: Session = Depends(get_db), _auth: None = Depends(verify_api_key)):
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
    "onset": 1.0,
    "1s":    0.97,
    "2s":    0.95,
}

# Hard floor thresholds per resolution. Even with adaptive thresholds we
# never accept candidates worse than these values.
_FLOOR_THRESHOLDS = {
    "onset": 0.92,
    "1s":    0.86,
    "2s":    0.84,
}


def _temporal_rerank(raw: list, gap_s: float = 1.0) -> List[SearchResult]:
    """Merge overlapping/adjacent chunks into contiguous acoustic events,
    apply cross-resolution fusion, and boost their score.
    """
    if not raw:
        return []

    # Keep speech chunks separate to bypass complex fusion, but merge acoustic ones
    speech_chunks = [c for c in raw if c.resolution_type == "speech"]
    acoustic_chunks = [c for c in raw if c.resolution_type != "speech"]

    results = list(speech_chunks)

    if not acoustic_chunks:
        return sorted(results, key=lambda r: r.score)

    scores = [r.score for r in acoustic_chunks]
    min_score = min(scores)
    max_score = max(scores)
    score_range = max_score - min_score if max_score > min_score else 1.0

    sorted_chunks = sorted(acoustic_chunks, key=lambda r: r.start_time)

    events = []
    current_chunks = [sorted_chunks[0]]

    for chunk in sorted_chunks[1:]:
        max_end = max(c.end_time for c in current_chunks)
        gap = chunk.start_time - max_end
        if gap <= gap_s:
            current_chunks.append(chunk)
        else:
            events.append(current_chunks)
            current_chunks = [chunk]
    events.append(current_chunks)

    def res_duration(r: str) -> float:
        if r == "onset": return 0.5
        if r == "1s": return 1.0
        if r == "2s": return 2.0
        return 1.0

    import numpy as np
    
    for chunks in events:
        file_id = chunks[0].file_id
        filename = chunks[0].filename
        start_time = min(c.start_time for c in chunks)
        end_time = max(c.end_time for c in chunks)
        
        resolutions = set(c.resolution_type for c in chunks)
        
        best_chunk_score = min(c.score for c in chunks)
        
        # Localization
        close_chunks = [c for c in chunks if c.score <= best_chunk_score + 0.05]
        best_local_chunk = min(close_chunks, key=lambda c: res_duration(c.resolution_type))
        seek_time = best_local_chunk.start_time

        # Scoring: cross-resolution fusion
        if len(resolutions) > 1:
            res_best_scores = {}
            for c in chunks:
                ns = (c.score - min_score) / score_range
                if c.resolution_type not in res_best_scores or ns < res_best_scores[c.resolution_type]:
                    res_best_scores[c.resolution_type] = ns
            
            weighted_scores = []
            for r, ns in res_best_scores.items():
                w = _RESOLUTION_WEIGHTS.get(r, 1.0)
                weighted_scores.append(ns * w)
                
            arr = np.array(weighted_scores)
            arr = np.clip(arr, 1e-9, None)
            fused_score = np.exp(np.mean(np.log(arr)))
            
            resolution_bonus = 0.08 * (len(resolutions) - 1)
            fused_score *= (1.0 - min(resolution_bonus, 0.20))
        else:
            best_ns = (best_chunk_score - min_score) / score_range
            w = _RESOLUTION_WEIGHTS.get(list(resolutions)[0], 1.0)
            fused_score = best_ns * w

        continuity_bonus = min(0.30, 0.04 * (len(chunks) - 1))
        final_score = fused_score * (1.0 - continuity_bonus)

        final_score_original = final_score * score_range + min_score

        results.append(SearchResult(
            file_id=file_id,
            start_time=seek_time,  # Precise localization!
            end_time=end_time,
            resolution_type=best_local_chunk.resolution_type,
            score=round(final_score_original, 6),
            filename=filename,
        ))

    results.sort(key=lambda r: r.score)
    # 3. Non-Maximum Suppression (NMS)
    selected = []
    for chunk in results:
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
    "a {q}",
    "the sound of {q}",
    "{q} audio",
    "{q} noise",
    "{q} sound effect",
    "recording of {q}",
    "audio of {q}",
    "A high quality professional foley recording of {q}",
    "Clear audio of {q}",
    "{q} playing in the foreground",
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

def _extract_speech_target(text: str) -> str:
    """Clean common voice search prefixes to extract the target spoken words."""
    cleaned = text.lower().strip()
    
    prefixes = [
        "sound of a person saying ",
        "sound of someone saying ",
        "sound of a voice saying ",
        "person saying ",
        "someone saying ",
        "voice saying ",
        "person says ",
        "someone says ",
        "voice says ",
        "says ",
        "saying ",
        "speaking ",
        "speaks ",
        "whispering ",
        "whispers ",
    ]
    for p in prefixes:
        if cleaned.startswith(p):
            cleaned = cleaned[len(p):].strip()
            break
            
    return cleaned.strip("\"' ")


@app.post("/api/v1/search")
@limiter.limit("20/minute")
def search(request: Request, search_req: SearchRequest, db: Session = Depends(get_db), _auth: None = Depends(verify_api_key)):
    """Semantic audio search with query ensemble + adaptive thresholds +
    cross-resolution fusion + temporal reranking.

    Steps:
    1. Query the text transcripts for direct spoken matches.
    2. Generate up to 7 query phrasings from the user's text.
    3. Embed all phrasings with CLAP, weight the original query 2x, and
       average → robust query vector.
    4. Retrieve top-1000 candidates from pgvector.
    5. Combine speech transcript matches and acoustic matches.
    6. Temporal rerank and return top-20.
    """
    import numpy as np

    # Validate search text length
    if len(search_req.text) > MAX_SEARCH_TEXT_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Search text too long ({len(search_req.text)} chars). Maximum is {MAX_SEARCH_TEXT_LENGTH}."
        )

    # --- Step 1: Speech-to-Text transcript matching ---
    # Use PostgreSQL full-text search for exact word matching, with trigram
    # similarity fallback for fuzzy/partial matches.
    speech_target = _extract_speech_target(search_req.text)
    speech_results = []
    
    if speech_target:
        # First: full-text search (exact word matching via tsvector/tsquery)
        sql_fts = """
            SELECT t.file_id, t.start_time, t.end_time, t.text, f.filename,
                   ts_rank(to_tsvector('english', t.text), plainto_tsquery('english', :speech_query)) AS rank
            FROM audio_transcripts t
            JOIN audio_files f ON t.file_id = f.id
            WHERE to_tsvector('english', t.text) @@ plainto_tsquery('english', :speech_query)
        """
        if search_req.file_id is not None:
            sql_fts += " AND t.file_id = :file_id"
        sql_fts += " ORDER BY rank DESC LIMIT 200"
            
        speech_rows = db.execute(
            text(sql_fts),
            {
                "speech_query": speech_target,
                "file_id": search_req.file_id
            }
        ).fetchall()
        
        # Fallback: trigram similarity if full-text search returns nothing
        if not speech_rows:
            sql_trgm = """
                SELECT t.file_id, t.start_time, t.end_time, t.text, f.filename,
                       similarity(t.text, :speech_query) AS sim
                FROM audio_transcripts t
                JOIN audio_files f ON t.file_id = f.id
                WHERE similarity(t.text, :speech_query) > 0.3
            """
            if search_req.file_id is not None:
                sql_trgm += " AND t.file_id = :file_id"
            sql_trgm += " ORDER BY sim DESC LIMIT 200"
                
            speech_rows = db.execute(
                text(sql_trgm),
                {
                    "speech_query": speech_target,
                    "file_id": search_req.file_id
                }
            ).fetchall()
        
        for r in speech_rows:
            speech_results.append(SearchResult(
                file_id=r[0],
                start_time=r[1],
                end_time=r[2],
                resolution_type="speech",
                score=0.05,  # Top score to rank above acoustic matches (lower is better)
                filename=r[4],
            ))

    embedder = ClapEmbedder()

    # --- Step 2–3: Query ensemble with weighted averaging ---
    phrases = _build_queries(search_req.text, n=7)
    vecs = []
    for i, p in enumerate(phrases):
        v = embedder.embed_text_query(p)
        # Weight the original query 2x for emphasis
        weight = 2.0 if i == 0 else 1.0
        vecs.append(v * weight)
    vecs = np.stack(vecs)
    mean_vec = vecs.mean(axis=0)
    mean_vec = mean_vec / (np.linalg.norm(mean_vec) + 1e-9)

    # --- Step 4: Retrieve candidates from pgvector ---
    sql_str = """
        SELECT ac.file_id, ac.start_time, ac.end_time, ac.resolution_type,
               (ac.embedding <=> CAST(:query_vec AS vector)) AS score,
               af.filename
        FROM audio_chunks ac
        JOIN audio_files af ON ac.file_id = af.id
    """
    if search_req.file_id is not None:
        sql_str += " WHERE ac.file_id = :file_id"
    sql_str += " ORDER BY score ASC LIMIT 1000;"
    
    sql = text(sql_str)
    params = {"query_vec": str(mean_vec.tolist())}
    if search_req.file_id is not None:
        params["file_id"] = search_req.file_id
        
    rows = db.execute(sql, params).fetchall()

    # --- Step 5: Merge candidates and apply adaptive thresholds ---
    candidates = list(speech_results)
    
    # Compute median score and set adaptive threshold = median + 0.1
    all_scores = [row[4] for row in rows]
    median_score = float(np.median(all_scores)) if all_scores else 0.0
    adaptive_threshold = median_score + 0.1

    for row in rows:
        res_type = row[3]
        score = row[4]
        filename = row[5]
        
        # Use the tighter of: adaptive threshold or per-resolution floor
        effective_threshold = min(adaptive_threshold, _FLOOR_THRESHOLDS.get(res_type, 0.84))
        
        if score < effective_threshold:
            candidates.append(SearchResult(
                file_id=row[0],
                start_time=row[1],
                end_time=row[2],
                resolution_type=res_type,
                score=score,
                filename=filename,
            ))

    if not candidates:
        return []

    # --- Step 6: Temporal rerank and return top-20 ---
    events = _temporal_rerank(candidates)
    return events[:20]

@app.post("/api/v1/search/audio")
@limiter.limit("5/minute")
async def search_audio(request: Request, file: UploadFile = File(...), db: Session = Depends(get_db), _auth: None = Depends(verify_api_key)):
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

    # 4. Adaptive thresholds
    candidates = []
    
    # Compute median score and set adaptive threshold = median + 0.1
    all_scores = [row[4] for row in rows]
    median_score = float(np.median(all_scores)) if all_scores else 0.0
    adaptive_threshold = median_score + 0.1

    for row in rows:
        res_type = row[3]
        score = row[4]
        filename = row[5]
        
        # Use the tighter of: adaptive threshold or per-resolution floor
        effective_threshold = min(adaptive_threshold, _FLOOR_THRESHOLDS.get(res_type, 0.84))
        
        if score < effective_threshold:
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

# Simple in-memory cache for corpus map (expensive PCA+KMeans)
_corpus_map_cache: dict = {"data": None, "timestamp": 0.0}
_CORPUS_MAP_CACHE_TTL = 60  # seconds

@app.get("/api/v1/corpus/map")
@limiter.limit("3/minute")
def get_corpus_map(request: Request, db: Session = Depends(get_db), _auth: None = Depends(verify_api_key)):
    """Fetch all embeddings, run PCA down to 3D, and cluster them."""
    import numpy as np
    import json
    
    # Return cached result if available and fresh
    if _corpus_map_cache["data"] is not None and (time.time() - _corpus_map_cache["timestamp"]) < _CORPUS_MAP_CACHE_TTL:
        return _corpus_map_cache["data"]

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
        result_item = {
            **data[i],
            "x": float(X_3d[i][0]),
            "y": float(X_3d[i][1]),
            "z": float(X_3d[i][2]),
            "cluster": int(labels[i]),
            "is_outlier": bool(distances[i] > threshold)
        }
        results.append(result_item)

    # Cache the result
    _corpus_map_cache["data"] = results
    _corpus_map_cache["timestamp"] = time.time()

    return results

