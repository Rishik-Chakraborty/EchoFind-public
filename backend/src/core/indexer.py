import os
import time
import logging
import threading
import gc
from concurrent.futures import ThreadPoolExecutor, wait, FIRST_EXCEPTION
from sqlalchemy.orm import Session
from sqlalchemy import text
from .audio_dsp import AudioFragmenter
from .embedder import ClapEmbedder
from ..db import SessionLocal

import torch

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# CLAP batch size — 32 utilises GPU throughput far better than the old 8.
# The OOM-halving fallback in ClapEmbedder ensures safety on smaller GPUs.
# ---------------------------------------------------------------------------
_EMBED_BATCH_SIZE = 32

# ---------------------------------------------------------------------------
# Lazy Whisper model singleton — avoids module-level network calls that
# crash the import if HF is unreachable.
# ---------------------------------------------------------------------------
_whisper_model = None
_whisper_lock = threading.Lock()

_MAX_RETRIES = 3
_RETRY_BACKOFF = 15  # seconds


def get_whisper_model():
    """Return the shared faster-whisper model, loading it on first call.

    Uses retry logic identical to ClapEmbedder so that transient HF
    outages during cold start don't crash the server.
    """
    global _whisper_model
    if _whisper_model is not None:
        return _whisper_model

    with _whisper_lock:
        # Double-check after acquiring lock
        if _whisper_model is not None:
            return _whisper_model

        from faster_whisper import WhisperModel

        device = "cuda" if torch.cuda.is_available() else "cpu"
        compute_type = "float16" if device == "cuda" else "int8"

        last_error = None
        for attempt in range(1, _MAX_RETRIES + 1):
            try:
                logger.info(
                    "Loading faster-whisper model (tiny) on %s [attempt %d/%d]...",
                    device, attempt, _MAX_RETRIES,
                )
                model = WhisperModel(
                    "tiny", device=device, compute_type=compute_type, cpu_threads=4
                )
                _whisper_model = model
                logger.info("faster-whisper model loaded on %s with %s.", device, compute_type)
                return _whisper_model
            except (OSError, ConnectionError, TimeoutError, ValueError) as exc:
                last_error = exc
                if attempt < _MAX_RETRIES:
                    wait_s = _RETRY_BACKOFF * attempt
                    logger.warning(
                        "Whisper model load failed (attempt %d/%d): %s — retrying in %ds",
                        attempt, _MAX_RETRIES, exc, wait_s,
                    )
                    time.sleep(wait_s)
                else:
                    logger.error(
                        "Whisper model load failed after %d attempts: %s",
                        _MAX_RETRIES, exc,
                    )

        raise RuntimeError(
            f"Failed to load Whisper model after {_MAX_RETRIES} attempts"
        ) from last_error


def _update_progress(db: Session, job_id: int, progress: float):
    """Update progress on the audio_jobs table."""
    db.execute(
        text("UPDATE audio_jobs SET progress = GREATEST(progress, :progress), updated_at = now() WHERE id = :job_id"),
        {"progress": progress, "job_id": job_id},
    )
    db.commit()


# ---------------------------------------------------------------------------
# Collect-only helpers (no DB writes — safe to call from background threads)
# ---------------------------------------------------------------------------

def _collect_embeddings(all_chunks, embedder) -> list:
    """Run CLAP embedding and return a list of row dicts ready for bulk insert.

    Deliberately avoids any DB interaction so it can run concurrently with
    ``_collect_transcription`` without SQLAlchemy session conflicts.
    """
    rows = []
    for i in range(0, len(all_chunks), _EMBED_BATCH_SIZE):
        batch = all_chunks[i : i + _EMBED_BATCH_SIZE]
        arrays = [c["array"] for c in batch]

        # embed_audio_batch has built-in OOM fallback
        embeddings = embedder.embed_audio_batch(arrays)

        for idx, chunk in enumerate(batch):
            embedding_list = embeddings[idx].tolist()
            embedding_str = "[" + ",".join(str(x) for x in embedding_list) + "]"
            rows.append({
                "start_time":      chunk["start_time"],
                "end_time":        chunk["end_time"],
                "resolution_type": chunk["resolution_type"],
                "embedding":       embedding_str,
            })

        del arrays, embeddings
        gc.collect()

    return rows


def _collect_transcription(file_path: str, duration: float, time_offset: float) -> list:
    """Run Whisper transcription and return a list of row dicts ready for bulk insert.

    Deliberately avoids any DB interaction so it can run concurrently with
    ``_collect_embeddings`` without SQLAlchemy session conflicts.
    """
    model = get_whisper_model()
    segments, _info = model.transcribe(file_path, word_timestamps=True, vad_filter=True)

    rows = []
    for segment in segments:
        if getattr(segment, "words", None):
            for word in segment.words:
                text_content = word.word.strip()
                if text_content:
                    rows.append({
                        "start_time": float(word.start) + time_offset,
                        "end_time":   float(word.end)   + time_offset,
                        "text":       text_content,
                    })
        else:
            text_content = segment.text.strip()
            if text_content:
                rows.append({
                    "start_time": float(segment.start) + time_offset,
                    "end_time":   float(segment.end)   + time_offset,
                    "text":       text_content,
                })
    return rows


def _insert_embeddings(db: Session, file_id: int, rows: list):
    """Bulk-insert pre-computed embedding rows into audio_chunks."""
    if not rows:
        return
    insert_sql = text("""
        INSERT INTO audio_chunks (file_id, start_time, end_time, resolution_type, embedding)
        VALUES (:file_id, :start_time, :end_time, :resolution_type, CAST(:embedding AS vector))
    """)
    db.execute(insert_sql, [{"file_id": file_id, **r} for r in rows])
    db.commit()


def _insert_transcription(db: Session, file_id: int, rows: list):
    """Bulk-insert pre-computed transcript rows into audio_transcripts."""
    if not rows:
        return
    insert_sql = text("""
        INSERT INTO audio_transcripts (file_id, start_time, end_time, text)
        VALUES (:file_id, :start_time, :end_time, :text)
    """)
    db.execute(insert_sql, [{"file_id": file_id, **r} for r in rows])
    db.commit()


def process_upload(job_id: int, file_path: str):
    db: Session = SessionLocal()
    try:
        # Update job status to processing and set initial progress
        db.execute(
            text("UPDATE audio_jobs SET status = 'processing', updated_at = now() WHERE id = :job_id"),
            {"job_id": job_id},
        )
        db.commit()
        _update_progress(db, job_id, 0.0)

        t_start = time.time()

        import librosa
        import tempfile
        import subprocess
        import glob

        total_duration = librosa.get_duration(path=file_path)
        filename = os.path.basename(file_path)

        # Register file in audio_files
        res = db.execute(
            text("""
                INSERT INTO audio_files (job_id, filename, duration_seconds)
                VALUES (:job_id, :filename, :duration) RETURNING id
            """),
            {"job_id": job_id, "filename": filename, "duration": total_duration},
        )
        file_id = res.fetchone()[0]
        db.commit()

        _update_progress(db, job_id, 0.05)

        # ---------------------------------------------------------------------------
        # Split into 5-minute (300 s) segments to prevent OOM.
        # We force -ar 48000 so the output WAVs are already at the sample rate that
        # AudioFragmenter expects, enabling soundfile's fast native read path.
        # ---------------------------------------------------------------------------
        segment_time = 300
        with tempfile.TemporaryDirectory() as temp_dir:
            logger.info("Segmenting %s into 300s chunks at 48kHz...", file_path)
            subprocess.run([
                "ffmpeg", "-y", "-i", file_path,
                "-f", "segment", "-segment_time", str(segment_time),
                "-ar", "48000",        # ← force 48 kHz to match AudioFragmenter
                "-c:a", "pcm_s16le",
                f"{temp_dir}/segment_%03d.wav",
            ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

            segments_paths = sorted(glob.glob(os.path.join(temp_dir, "segment_*.wav")))
            total_segments = len(segments_paths)

            embedder = ClapEmbedder()

            current_offset = 0.0
            for i, seg_path in enumerate(segments_paths):
                seg_duration = librosa.get_duration(path=seg_path)
                logger.info(
                    "Processing segment %d/%d (offset: %.2fs, duration: %.2fs)",
                    i + 1, total_segments, current_offset, seg_duration,
                )

                # Compute progress range for this segment
                seg_fraction  = seg_duration / (total_duration if total_duration > 0 else 1)
                base_progress = 0.05 + (current_offset / (total_duration if total_duration > 0 else 1)) * 0.90
                seg_end       = base_progress + seg_fraction * 0.90

                _update_progress(db, job_id, base_progress)

                # 1. Fragment audio into chunks
                fragmenter = AudioFragmenter()
                seg_chunks = fragmenter.fragment(seg_path)

                # Apply global time offset
                for chunk in seg_chunks:
                    chunk["start_time"] += current_offset
                    chunk["end_time"]   += current_offset

                # -----------------------------------------------------------------
                # 2. CLAP embedding (GPU) and Whisper transcription (CPU) run in
                #    parallel via ThreadPoolExecutor.  Both helpers are pure
                #    collect functions — they never touch the DB, so there are no
                #    SQLAlchemy session conflicts.  Python's GIL is released during
                #    both CUDA kernel launches and ctranslate2 C++ inference, so
                #    true concurrency is achieved.
                # -----------------------------------------------------------------
                with ThreadPoolExecutor(max_workers=2) as executor:
                    embed_future      = executor.submit(_collect_embeddings, seg_chunks, embedder)
                    transcribe_future = executor.submit(_collect_transcription, seg_path, seg_duration, current_offset)

                    # Wait for both — propagate the first exception if either fails
                    embed_rows      = embed_future.result()
                    transcript_rows = transcribe_future.result()

                # 3. Write results to DB (sequential, safe with single session)
                _insert_embeddings(db, file_id, embed_rows)
                _insert_transcription(db, file_id, transcript_rows)

                current_offset += seg_duration

                # Update progress to end of this segment
                _update_progress(db, job_id, seg_end)

                # Free memory before next segment
                del fragmenter, seg_chunks, embed_rows, transcript_rows
                gc.collect()

        logger.info("Total processing time: %.2f seconds.", time.time() - t_start)

        _update_progress(db, job_id, 1.0)
        db.execute(
            text("UPDATE audio_jobs SET status = 'completed', updated_at = now() WHERE id = :job_id"),
            {"job_id": job_id},
        )
        db.commit()

    except Exception as e:
        db.rollback()
        import traceback
        err_msg = traceback.format_exc()
        try:
            db.execute(
                text("UPDATE audio_jobs SET status = 'failed', updated_at = now() WHERE id = :job_id"),
                {"job_id": job_id},
            )
            db.execute(
                text("INSERT INTO audio_jobs_errors (job_id, error) VALUES (:job_id, :error)"),
                {"job_id": job_id, "error": err_msg},
            )
            db.commit()
        except Exception:
            pass
        raise e
    finally:
        db.close()
