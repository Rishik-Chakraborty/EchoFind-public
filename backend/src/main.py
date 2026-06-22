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
}

# Hard floor thresholds per resolution.  Even with adaptive thresholds we
# never accept candidates worse than these values.
_FLOOR_THRESHOLDS = {
    "250ms": 0.92,
    "1s":    0.86,
    "2s":    0.84,
    "5s":    0.80,
}


def _temporal_rerank(raw: list, gap_s: float = 1.0) -> List[SearchResult]:
    """Merge overlapping/adjacent chunks into contiguous acoustic events,
    apply cross-resolution fusion, and boost their score.

    Algorithm:
    1. Normalise scores to [0, 1] range so reranking logic is scale-invariant.
    2. Sort candidates by start_time.
    3. Merge any two chunks whose gap is <= gap_s into a single event.
    4. Cross-resolution fusion: when an event contains matches from multiple
       resolutions, compute a weighted geometric mean of their scores — if
       both fine-grained and coarse-grained chunks agree, confidence rises.
    5. Apply a continuity bonus: longer events get 4% per extra chunk
       (capped at 30%).
    6. Return results sorted by final score (ascending = better).
    """
    if not raw:
        return []

    # --- Step 1: Normalise scores to [0, 1] ---
    scores = [r.score for r in raw]
    min_score = min(scores)
    max_score = max(scores)
    score_range = max_score - min_score if max_score > min_score else 1.0

    sorted_chunks = sorted(raw, key=lambda r: r.start_time)

    # --- Step 2–3: Merge adjacent chunks ---
    events = []
    current = {
        "file_id": sorted_chunks[0].file_id,
        "start_time": sorted_chunks[0].start_time,
        "end_time": sorted_chunks[0].end_time,
        "resolutions": {sorted_chunks[0].resolution_type},
        "scores": [(sorted_chunks[0].score - min_score) / score_range],
        "res_types": [sorted_chunks[0].resolution_type],
        "best_score": (sorted_chunks[0].score - min_score) / score_range,
        "best_resolution": sorted_chunks[0].resolution_type,
        "count": 1,
    }

    for chunk in sorted_chunks[1:]:
        gap = chunk.start_time - current["end_time"]
        norm_score = (chunk.score - min_score) / score_range
        if gap <= gap_s:
            current["end_time"] = max(current["end_time"], chunk.end_time)
            current["resolutions"].add(chunk.resolution_type)
            current["scores"].append(norm_score)
            current["res_types"].append(chunk.resolution_type)
            if norm_score < current["best_score"]:
                current["best_score"] = norm_score
                current["best_resolution"] = chunk.resolution_type
            current["count"] += 1
        else:
            events.append(current)
            current = {
                "file_id": chunk.file_id,
                "start_time": chunk.start_time,
                "end_time": chunk.end_time,
                "resolutions": {chunk.resolution_type},
                "scores": [norm_score],
                "res_types": [chunk.resolution_type],
                "best_score": norm_score,
                "best_resolution": chunk.resolution_type,
                "count": 1,
            }
    events.append(current)

    # --- Step 4–5: Cross-resolution fusion + continuity bonus ---
    results = []
    for ev in events:
        # Cross-resolution fusion: if multiple resolutions agree, compute
        # weighted geometric mean — this rewards convergent evidence.
        import numpy as np

        if len(ev["resolutions"]) > 1:
            weighted_scores = []
            for s, r in zip(ev["scores"], ev["res_types"]):
                w = _RESOLUTION_WEIGHTS.get(r, 1.0)
                weighted_scores.append(s * w)
            # Geometric mean of weighted scores
            arr = np.array(weighted_scores)
            arr = np.clip(arr, 1e-9, None)  # avoid log(0)
            fused_score = np.exp(np.mean(np.log(arr)))
            # Multi-resolution agreement bonus: 8% per extra resolution
            resolution_bonus = 0.08 * (len(ev["resolutions"]) - 1)
            fused_score *= (1.0 - min(resolution_bonus, 0.20))
        else:
            w = _RESOLUTION_WEIGHTS.get(ev["best_resolution"], 1.0)
            fused_score = ev["best_score"] * w

        # Continuity bonus: 4% per extra merged chunk, capped at 30%
        continuity_bonus = min(0.30, 0.04 * (ev["count"] - 1))
        final_score = fused_score * (1.0 - continuity_bonus)

        # Map back to original score scale for interpretability
        final_score_original = final_score * score_range + min_score

        results.append(SearchResult(
            file_id=ev["file_id"],
            start_time=ev["start_time"],
            end_time=ev["end_time"],
            resolution_type=ev["best_resolution"],
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
