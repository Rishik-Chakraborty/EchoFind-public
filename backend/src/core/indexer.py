import os
import time
from sqlalchemy.orm import Session
from sqlalchemy import text
from .audio_dsp import AudioFragmenter
from .embedder import ClapEmbedder
from ..db import SessionLocal

def process_upload(job_id: int, file_path: str):
    db: Session = SessionLocal()
    try:
        # Update job status to processing
        db.execute(
            text("UPDATE audio_jobs SET status = 'processing', updated_at = now() WHERE id = :job_id"),
            {"job_id": job_id},
        )
        db.commit()

        # Step 1: Fragment audio file
        t_start = time.time()
        
        fragmenter = AudioFragmenter()
        all_chunks = []
        try:
            all_chunks.extend(fragmenter.fragment(file_path))
        except Exception as e:
            print(f"Warning: Failed to fragment {file_path}: {e}")
            
        print(f"Audio fragmentation finished in {time.time() - t_start:.2f} seconds.")

        # Step 3: Register file in audio_files
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

        # Step 4: Embed chunks and save vectors
        t_embed = time.time()
        embedder = ClapEmbedder()

        batch_size = 128
        insert_sql = text("""
            INSERT INTO audio_chunks (file_id, start_time, end_time, resolution_type, embedding)
            VALUES (:file_id, :start_time, :end_time, :resolution_type, CAST(:embedding AS vector))
        """)
        for i in range(0, len(all_chunks), batch_size):
            batch = all_chunks[i : i + batch_size]
            arrays = [c["array"] for c in batch]

            # Embed the batch
            embeddings = embedder.embed_audio_batch(arrays)

            # Bulk insert all chunks in this batch with executemany
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
            db.execute(insert_sql, rows)
            db.commit()  # commit each batch so we don't lose work on failure
            
        print(f"Embedding and DB insertion finished in {time.time() - t_embed:.2f} seconds.")
        print(f"Total processing time: {time.time() - t_start:.2f} seconds.")

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
