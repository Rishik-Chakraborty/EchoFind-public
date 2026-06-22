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


# ---------------------------------------------------------------------------
# Resolution confidence weights — longer chunks produce more stable embeddings
# so we give them a slight advantage during scoring.
# ---------------------------------------------------------------------------
_RESOLUTION_WEIGHTS = {
    "250ms": 1.0,
    "1s":    0.97,
    "2s":    0.95,
    "5s":    0.93,
    "10s":   0.90,
}


def cross_resolution_fusion(candidates, window_s=2.0):
    """
    Fusion model: match multi-resolution chunks from different windows
    and weight them by alignment confidence.

    candidates: List[SearchResult]
    window_s: Lookahead window for matching chunks (default: 2s)
    Returns: dict mapping chunk_id -> fused_score (0-1)
    """
    if not candidates:
        return {}



    # Build chunk lookup by start_time
    chunks_at = defaultdict(list)
    for c in candidates:
        chunks_at[c.start_time].append(c)

    chunk_ids = sorted(chunks_at.keys())
    fused = {}

    for start in chunk_ids:
        # Consider window: [start, start + window_s]
        end_limit = start + window_s
        current_candidates = []
        for t in sorted(chunks_at.keys()):
            if t >= start and t < end_limit:
                current_candidates.extend(chunks_at[t])

        if not current_candidates:
            continue

        # Group by resolution_type
        per_res = defaultdict(list)
        for c in current_candidates:
            per_res[c.resolution_type].append(c)

        # Compute fused score
        f_scores = []
        align_weight = 0.0

        for res, res_list in per_res.items():
            if not res_list:
                continue

            scores = [c.score for c in res_list]
            avg_score = np.mean(scores)
            f_scores.append(avg_score)

            # Alignment confidence: more aligned chunks = higher weight
            alignment_ratio = len(res_list) / len(current_candidates)
            if alignment_ratio >= 0.5:
                align_weight += 0.1
            elif alignment_ratio >= 0.3:
                align_weight += 0.05

        if not f_scores:
            continue

        # Weighted geometric mean of resolution scores
        f_scores = np.clip(f_scores, 1e-9, None)
        fused_score = np.exp(np.mean(np.log(f_scores)))

        # Resolution agreement bonus
        num_res = len(f_scores)
        if num_res > 1:
            fused_score *= 0.2  # penalty for not agreeing

        # Apply alignment confidence boost
        fused_score += align_weight

        # Normalize to [0,1]
        fused_score = max(0.0, min(1.0, fused_score))

        # Assign fused score to each candidate
        for c in current_candidates:
            current_id = getattr(c, "chunk_id", "unknown")
            if current_id in fused:
                fused[current_id] = max(fused[current_id], fused_score)
            else:
                fused[current_id] = fused_score

    return fused



# Hard floor thresholds per resolution.  Even with adaptive thresholds we
# never accept candidates worse than these values.
_FLOOR_THRESHOLDS = {
    "250ms": 0.92,
    "1s":    0.86,
    "2s":    0.84,
    "5s":    0.80,
    "10s":   0.75,
}


def _temporal_rerank(raw: list, gap_s: float = 1.0) -> List[SearchResult]:
    """Merge overlapping/adjacent chunks into contiguous acoustic events,
    apply cross-resolution fusion, and boost their score.
    """
    if not raw:
        return []

    scores = [r.score for r in raw]
    min_score = min(scores)
    max_score = max(scores)
    score_range = max_score - min_score if max_score > min_score else 1.0

    sorted_chunks = sorted(raw, key=lambda r: r.start_time)

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
        if r == "250ms": return 0.25
        if r == "1s": return 1.0
        if r == "2s": return 2.0
        if r == "5s": return 5.0
        if r == "10s": return 10.0
        return 10.0

    results = []
    import numpy as np
    
    for chunks in events:
        file_id = chunks[0].file_id
        start_time = min(c.start_time for c in chunks)
        end_time = max(c.end_time for c in chunks)
        
        resolutions = set(c.resolution_type for c in chunks)
        
        # Find the absolute best score in this event
        best_chunk_score = min(c.score for c in chunks)
        
        # Localization: find chunks within a 0.05 distance margin of the best score
        # and pick the one with the shortest duration to use as the Seek timestamp.
        close_chunks = [c for c in chunks if c.score <= best_chunk_score + 0.05]
        best_local_chunk = min(close_chunks, key=lambda c: res_duration(c.resolution_type))
        seek_time = best_local_chunk.start_time

        # Scoring: cross-resolution fusion
        if len(resolutions) > 1:
            # We want the best score per resolution for fusion
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
        ))

    results.sort(key=lambda r: r.score)
    return results


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
        SELECT file_id, start_time, end_time, resolution_type,
               (embedding <=> CAST(:query_vec AS vector)) AS score
        FROM audio_chunks
        ORDER BY score ASC
        LIMIT 200;
    """)
    rows = db.execute(sql, {"query_vec": str(mean_vec.tolist())}).fetchall()

    if not rows:
        return []

    # --- Step 4: Adaptive thresholds ---
    # Compute median score and set adaptive threshold = median + 0.1
    all_scores = [row[4] for row in rows]
    median_score = float(np.median(all_scores))
    adaptive_threshold = median_score + 0.1

    candidates = []
    for row in rows:
        res_type = row[3]
        score = row[4]
        # Use the tighter of: adaptive threshold or per-resolution floor
        effective_threshold = min(adaptive_threshold, _FLOOR_THRESHOLDS.get(res_type, 0.84))
        if score < effective_threshold:
            candidates.append(SearchResult(
                file_id=row[0],
                start_time=row[1],
                end_time=row[2],
                resolution_type=res_type,
                score=score,
            ))

    # --- Step 5–6: Temporal rerank and return top-20 ---
    events = _temporal_rerank(candidates)
    return events[:20]
