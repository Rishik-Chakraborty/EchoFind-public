import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from sqlalchemy.orm import Session
from sqlalchemy import text
from .audio_dsp import AudioFragmenter
from .embedder import ClapEmbedder
from ..db import SessionLocal

from faster_whisper import WhisperModel

import torch
print("Loading faster-whisper model (tiny)...")
device = "cuda" if torch.cuda.is_available() else "cpu"
compute_type = "float16" if device == "cuda" else "int8"
_WHISPER_MODEL = WhisperModel("tiny", device=device, compute_type=compute_type, cpu_threads=4)
print(f"faster-whisper model loaded on {device} with {compute_type}.")

def get_whisper_model():
    return _WHISPER_MODEL


def _update_progress(db: Session, job_id: int, progress: float):
    """Update progress on the audio_jobs table."""
    db.execute(
        text("UPDATE audio_jobs SET progress = GREATEST(progress, :progress), updated_at = now() WHERE id = :job_id"),
        {"progress": progress, "job_id": job_id},
    )
    db.commit()


def _run_embedding(all_chunks, file_id, embedder, db_session, job_id, progress_start=0.30, progress_end=0.75):
    """Run CLAP batch embedding and insert vectors into DB."""
    batch_size = 8
    insert_sql = text("""
        INSERT INTO audio_chunks (file_id, start_time, end_time, resolution_type, embedding)
        VALUES (:file_id, :start_time, :end_time, :resolution_type, CAST(:embedding AS vector))
    """)
    
    total_chunks = len(all_chunks)
    if total_chunks == 0:
        return
        
    import gc
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
        
        # Free memory explicitly
        del arrays
        del embeddings
        del rows
        gc.collect()

        # Incremental progress: scale from progress_start to progress_end
        progress_val = progress_start + (min(i + batch_size, total_chunks) / total_chunks) * (progress_end - progress_start)
        _update_progress(db_session, job_id, progress_val)


def _run_transcription(file_path, file_id, duration, db_session, job_id, time_offset=0.0, progress_start=0.75, progress_end=0.95):
    """Run Whisper transcription with word-level timestamps and incremental progress updates."""
    model = get_whisper_model()
    segments, info = model.transcribe(file_path, word_timestamps=True, vad_filter=True)
    
    insert_transcript_sql = text("""
        INSERT INTO audio_transcripts (file_id, start_time, end_time, text)
        VALUES (:file_id, :start_time, :end_time, :text)
    """)
    rows = []
    
    # Guard against division by zero
    safe_duration = duration if duration > 0 else 0.001
    total_range = progress_end - progress_start
    
    for segment in segments:
        # Process segment as before
        if getattr(segment, "words", None):
            for word in segment.words:
                text_content = word.word.strip()
                if text_content:
                    rows.append({
                        "file_id": file_id,
                        "start_time": float(word.start) + time_offset,
                        "end_time": float(word.end) + time_offset,
                        "text": text_content,
                    })
        else:
            text_content = segment.text.strip()
            if text_content:
                rows.append({
                    "file_id": file_id,
                    "start_time": float(segment.start) + time_offset,
                    "end_time": float(segment.end) + time_offset,
                    "text": text_content,
                })
        # Update progress incrementally based on segment end time
        progress_val = progress_start + (float(segment.end) / safe_duration) * total_range
        if progress_val > progress_end:
            progress_val = progress_end
        _update_progress(db_session, job_id, progress_val)
        
    # Execute the database insert for the generated transcription rows
    if rows:
        db_session.execute(insert_transcript_sql, rows)
        db_session.commit()
    
    # Ensure final transcription progress reaches progress_end
    _update_progress(db_session, job_id, progress_end)


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
        
        # Determine total duration
        import librosa
        import tempfile
        import subprocess
        import glob
        import gc
        
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
        
        # Split into 5 minute (300s) segments to prevent OOM
        segment_time = 300
        with tempfile.TemporaryDirectory() as temp_dir:
            print(f"Segmenting {file_path} into 300s chunks...")
            subprocess.run([
                "ffmpeg", "-y", "-i", file_path, "-f", "segment", "-segment_time", str(segment_time), 
                "-c:a", "pcm_s16le", f"{temp_dir}/segment_%03d.wav"
            ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            
            segments = sorted(glob.glob(os.path.join(temp_dir, "segment_*.wav")))
            total_segments = len(segments)
            
            embedder = ClapEmbedder()
            
            current_offset = 0.0
            for i, seg_path in enumerate(segments):
                seg_duration = librosa.get_duration(path=seg_path)
                print(f"Processing segment {i+1}/{total_segments} (offset: {current_offset:.2f}s, duration: {seg_duration:.2f}s)")
                
                # Progress ranges for this specific segment
                seg_fraction = seg_duration / (total_duration if total_duration > 0 else 1)
                base_progress = 0.05 + (current_offset / (total_duration if total_duration > 0 else 1)) * 0.90
                
                embed_start = base_progress
                embed_end = base_progress + (seg_fraction * 0.45)
                transcribe_start = embed_end
                transcribe_end = base_progress + (seg_fraction * 0.90)
                
                # 1. Fragment
                fragmenter = AudioFragmenter()
                seg_chunks = fragmenter.fragment(seg_path)
                
                # Offset chunks
                for chunk in seg_chunks:
                    chunk["start_time"] += current_offset
                    chunk["end_time"] += current_offset
                    
                # 2. Embed
                _run_embedding(seg_chunks, file_id, embedder, db, job_id, progress_start=embed_start, progress_end=embed_end)
                
                # 3. Transcribe
                _run_transcription(seg_path, file_id, seg_duration, db, job_id, time_offset=current_offset, progress_start=transcribe_start, progress_end=transcribe_end)
                
                current_offset += seg_duration
                
                # Force GC to free segment memory before next iteration
                del fragmenter
                del seg_chunks
                gc.collect()

        print(f"Total processing time: {time.time() - t_start:.2f} seconds.")

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
