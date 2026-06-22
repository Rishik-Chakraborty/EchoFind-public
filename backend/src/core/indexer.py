import os
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
        fragmenter = AudioFragmenter()
        chunks = fragmenter.fragment(file_path)

        # Step 2: Register file in audio_files
        filename = os.path.basename(file_path)
        duration = max((c["end_time"] for c in chunks), default=0.0)

        res = db.execute(
            text("""
                INSERT INTO audio_files (job_id, filename, duration_seconds)
                VALUES (:job_id, :filename, :duration) RETURNING id
            """),
            {"job_id": job_id, "filename": filename, "duration": duration},
        )
        file_id = res.fetchone()[0]
        db.commit()

        # Step 3: Embed chunks and save vectors
        embedder = ClapEmbedder()

        batch_size = 32
        for i in range(0, len(chunks), batch_size):
            batch = chunks[i : i + batch_size]
            arrays = [c["array"] for c in batch]

            # Embed the batch
            embeddings = embedder.embed_audio_batch(arrays)

            # Insert each chunk with its embedding
            for idx, chunk in enumerate(batch):
                embedding_list = embeddings[idx].tolist()
                # pgvector expects a string like '[0.1,0.2,...]'
                embedding_str = "[" + ",".join(str(x) for x in embedding_list) + "]"
                db.execute(
                    text("""
                        INSERT INTO audio_chunks (file_id, start_time, end_time, resolution_type, embedding)
                        VALUES (:file_id, :start_time, :end_time, :resolution_type, CAST(:embedding AS vector))
                    """),
                    {
                        "file_id": file_id,
                        "start_time": chunk["start_time"],
                        "end_time": chunk["end_time"],
                        "resolution_type": chunk["resolution_type"],
                        "embedding": embedding_str,
                    },
                )
            db.commit()  # commit each batch so we don't lose work on failure

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
