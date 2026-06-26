import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from sqlalchemy.orm import Session
from sqlalchemy import text
from .audio_dsp import AudioFragmenter
from .embedder import ClapEmbedder
from ..db import SessionLocal

from faster_whisper import WhisperModel

print("Loading faster-whisper model (base, int8)...")
_WHISPER_MODEL = WhisperModel("base", device="cpu", compute_type="int8")
print("faster-whisper model loaded.")

def get_whisper_model():
    return _WHISPER_MODEL


def _update_progress(db: Session, job_id: int, progress: float):
    """Update progress on the audio_jobs table."""
    db.execute(
        text("UPDATE audio_jobs SET progress = :progress, updated_at = now() WHERE id = :job_id"),
        {"progress": progress, "job_id": job_id},
    )
    db.commit()


def _run_embedding(all_chunks, file_id, embedder, db_session, job_id):
    """Run CLAP batch embedding and insert vectors into DB."""
    batch_size = 64
    insert_sql = text("""
        INSERT INTO audio_chunks (file_id, start_time, end_time, resolution_type, embedding)
        VALUES (:file_id, :start_time, :end_time, :resolution_type, CAST(:embedding AS vector))
    """)
    
    total_chunks = len(all_chunks)
    if total_chunks == 0:
        return
        
    for i in range(0, total_chunks, batch_size):
        batch = all_chunks[i : i + batch_size]
        arrays = [c["array"] for c in batch]

        # Embed the batch
        embeddings = embedder.embed_audio_batch(arrays)

        # Bulk insert all chunks in this batch
        rows = []
        for idx, chunk in enumerate(batch):
            embedding_list = embeddings[idx].tolist()
            embedding_str = "[" + ",".join(str(x) for x in embedding_list) + "]"
            rows.append({
                "file_id": file_id,
                "start_time": chunk["start_time"],
                "end_time": chunk["end_time"],
                "resolution_type": chunk["resolution_type"],
                "embedding": embedding_str,
            })
        db_session.execute(insert_sql, rows)
        db_session.commit()
        
        # Incremental progress: scale from 30% to 75%
        progress_val = 0.30 + (min(i + batch_size, total_chunks) / total_chunks) * 0.45
        _update_progress(db_session, job_id, progress_val)


def _run_transcription(file_path, file_id, duration, db_session, job_id):
    """Run Whisper transcription with word-level timestamps and incremental progress updates."""
    model = get_whisper_model()
    segments, info = model.transcribe(file_path, word_timestamps=True)
    # total progress range from 0.75 to 0.95
    total_range = 0.20
    # Placeholder loop removed – processing handled later

    insert_transcript_sql = text("""
        INSERT INTO audio_transcripts (file_id, start_time, end_time, text)
        VALUES (:file_id, :start_time, :end_time, :text)
    """)
    rows = []
    
    # Guard against division by zero
    safe_duration = duration if duration > 0 else 0.001
    # total progress range from 0.75 to 0.95
    total_range = 0.20
    for segment in segments:
        # Process segment as before
        if getattr(segment, "words", None):
            for word in segment.words:
                text_content = word.word.strip()
                if text_content:
                    rows.append({
                        "file_id": file_id,
                        "start_time": float(word.start),
                        "end_time": float(word.end),
                        "text": text_content,
                    })
        else:
            text_content = segment.text.strip()
            if text_content:
                rows.append({
                    "file_id": file_id,
                    "start_time": float(segment.start),
                    "end_time": float(segment.end),
                    "text": text_content,
                })
        # Update progress incrementally based on segment end time
        progress_val = 0.75 + (float(segment.end) / safe_duration) * total_range
        if progress_val > 0.95:
            progress_val = 0.95
        _update_progress(db_session, job_id, progress_val)
    # Ensure final transcription progress reaches 0.95 if no segments were processed
    if not rows:
        _update_progress(db_session, job_id, 0.95)


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

        # Step 1: Fragment audio file
        t_start = time.time()

        fragmenter = AudioFragmenter()
        all_chunks = []
        try:
            all_chunks.extend(fragmenter.fragment(file_path))
        except Exception as e:
            print(f"Warning: Failed to fragment {file_path}: {e}")

        print(f"Audio fragmentation finished in {time.time() - t_start:.2f} seconds.")
        _update_progress(db, job_id, 0.30)

        # Step 2: Register file in audio_files
        filename = os.path.basename(file_path)
        duration = max((c["end_time"] for c in all_chunks), default=0.0)

        res = db.execute(
            text("""
                INSERT INTO audio_files (job_id, filename, duration_seconds)
                VALUES (:job_id, :filename, :duration) RETURNING id
            """),
            {"job_id": job_id, "filename": filename, "duration": duration},
        )
        file_id = res.fetchone()[0]
        db.commit()

        # Step 3: Run embedding sequentially with incremental progress
        embedder = ClapEmbedder()
        print("Starting sequential CLAP embedding generation...")
        t_embed = time.time()
        _run_embedding(all_chunks, file_id, embedder, db, job_id)
        print(f"Embedding finished in {time.time() - t_embed:.2f} seconds.")
        _update_progress(db, job_id, 0.75)

        # Step 4: Run transcription sequentially
        print("Starting Whisper transcription...")
        t_transcribe = time.time()
        _run_transcription(file_path, file_id, duration, db, job_id)
        print(f"Whisper transcription finished in {time.time() - t_transcribe:.2f} seconds.")
        _update_progress(db, job_id, 0.95)

        print(f"Total processing time: {time.time() - t_start:.2f} seconds.")

        _update_progress(db, job_id, 1.0)
        db.execute(
            text("UPDATE audio_jobs SET status = 'completed', updated_at = now() WHERE id = :job_id"),
            {"job_id": job_id},
        )
        db.commit()

    except Exception as e:
        db.rollback()
        try:
            db.execute(
                text("UPDATE audio_jobs SET status = 'failed', updated_at = now() WHERE id = :job_id"),
                {"job_id": job_id},
            )
            db.commit()
        except Exception:
            pass
        raise e
    finally:
        db.close()
