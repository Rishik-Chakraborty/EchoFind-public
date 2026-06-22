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

        # Step 1: Run Demucs Source Separation
        import subprocess
        upload_dir = os.path.dirname(file_path)
        separated_dir = os.path.join(upload_dir, "separated")
        os.makedirs(separated_dir, exist_ok=True)
        
        try:
            # Run demucs (outputs to separated/htdemucs/filename/*.wav)
            print(f"Running Demucs on {file_path}...")
            subprocess.run(["demucs", "-n", "htdemucs", "--out", separated_dir, file_path], check=True)
        except Exception as e:
            print(f"Warning: Demucs failed: {e}. Proceeding with original audio only.")

        # Gather files to fragment: original + stems
        files_to_fragment = [file_path]
        base_name = os.path.splitext(os.path.basename(file_path))[0]
        stems_dir = os.path.join(separated_dir, "htdemucs", base_name)
        if os.path.exists(stems_dir):
            for stem in ["vocals.wav", "drums.wav", "bass.wav", "other.wav"]:
                stem_path = os.path.join(stems_dir, stem)
                if os.path.exists(stem_path):
                    files_to_fragment.append(stem_path)

        # Step 2: Fragment all gathered audio files
        fragmenter = AudioFragmenter()
        all_chunks = []
        for f in files_to_fragment:
            try:
                all_chunks.extend(fragmenter.fragment(f))
            except Exception as e:
                print(f"Warning: Failed to fragment {f}: {e}")

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

        # Step 3: Embed chunks and save vectors
        embedder = ClapEmbedder()

        batch_size = 32
        for i in range(0, len(all_chunks), batch_size):
            batch = all_chunks[i : i + batch_size]
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
