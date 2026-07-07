import os
import io
import time
import logging
import threading
import gc
import numpy as np
from concurrent.futures import ThreadPoolExecutor
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
_batched_pipeline = None
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


def _get_batched_pipeline():
    """Return a BatchedInferencePipeline wrapping the Whisper model.

    Falls back to the raw model if BatchedInferencePipeline is not available
    in the installed faster-whisper version.
    """
    global _batched_pipeline
    if _batched_pipeline is not None:
        return _batched_pipeline

    model = get_whisper_model()
    try:
        from faster_whisper import BatchedInferencePipeline
        _batched_pipeline = BatchedInferencePipeline(model=model)
        logger.info("BatchedInferencePipeline enabled for Whisper.")
    except (ImportError, AttributeError):
        # Older faster-whisper versions don't have BatchedInferencePipeline
        _batched_pipeline = model
        logger.info("BatchedInferencePipeline not available — using standard Whisper model.")
    return _batched_pipeline


def _update_progress(db: Session, job_id: int, progress: float):
    """Update progress on the audio_jobs table."""
    db.execute(
        text("UPDATE audio_jobs SET progress = GREATEST(progress, :progress), updated_at = now() WHERE id = :job_id"),
        {"progress": progress, "job_id": job_id},
    )
    db.commit()


# ---------------------------------------------------------------------------
# In-memory audio decoding via PyAV — eliminates disk I/O for segmentation.
# Falls back to ffmpeg + temp files if PyAV is not installed.
# ---------------------------------------------------------------------------

def _decode_audio_pyav(file_path: str, target_sr: int = 48000):
    """Decode an audio file entirely in memory and yield fixed-size segments.

    Yields (segment_audio_np, segment_sr, offset_seconds) tuples where
    segment_audio_np is a float32 mono numpy array of up to 300 seconds.

    Uses PyAV (a Python binding for FFmpeg's libav* libraries) to decode
    directly into numpy arrays without writing any temporary files.
    """
    import av

    segment_duration_s = 300  # 5 minutes per segment
    segment_samples = segment_duration_s * target_sr

    container = av.open(file_path)
    stream = container.streams.audio[0]

    # Configure the resampler to output mono float32 at target_sr
    resampler = av.AudioResampler(
        format="flt",        # 32-bit float
        layout="mono",
        rate=target_sr,
    )

    buffer = np.array([], dtype=np.float32)
    offset = 0.0

    for frame in container.decode(stream):
        # Resample to target format
        resampled_frames = resampler.resample(frame)
        for rf in resampled_frames:
            arr = rf.to_ndarray().flatten().astype(np.float32)
            buffer = np.concatenate([buffer, arr])

            # Yield complete segments
            while len(buffer) >= segment_samples:
                segment = buffer[:segment_samples]
                buffer = buffer[segment_samples:]
                yield segment, target_sr, offset
                offset += segment_duration_s

    # Flush the resampler
    resampled_frames = resampler.resample(None)
    for rf in resampled_frames:
        arr = rf.to_ndarray().flatten().astype(np.float32)
        buffer = np.concatenate([buffer, arr])

    # Yield any remaining audio
    if len(buffer) > 0:
        yield buffer, target_sr, offset

    container.close()


def _decode_audio_ffmpeg(file_path: str, target_sr: int = 48000):
    """Fallback: decode via ffmpeg subprocess + temp WAV files on disk.

    Same yield signature as _decode_audio_pyav.
    """
    import tempfile
    import subprocess
    import glob
    import soundfile as sf

    segment_time = 300
    with tempfile.TemporaryDirectory() as temp_dir:
        subprocess.run([
            "ffmpeg", "-y", "-i", file_path,
            "-f", "segment", "-segment_time", str(segment_time),
            "-ar", str(target_sr),
            "-c:a", "pcm_s16le",
            f"{temp_dir}/segment_%03d.wav",
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        segments_paths = sorted(glob.glob(os.path.join(temp_dir, "segment_*.wav")))
        offset = 0.0
        for seg_path in segments_paths:
            y, sr = sf.read(seg_path, dtype="float32", always_2d=False)
            if y.ndim > 1:
                y = y.mean(axis=1)
            seg_duration = len(y) / sr
            yield y, sr, offset
            offset += seg_duration


def _decode_audio_segments(file_path: str, target_sr: int = 48000):
    """Decode audio into 300 s segments, preferring in-memory PyAV over ffmpeg.

    Yields (segment_audio_np, segment_sr, offset_seconds) tuples.
    """
    try:
        import av  # noqa: F401
        logger.info("Using PyAV for in-memory audio decoding.")
        yield from _decode_audio_pyav(file_path, target_sr)
    except ImportError:
        logger.info("PyAV not available — falling back to ffmpeg + temp files.")
        yield from _decode_audio_ffmpeg(file_path, target_sr)


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


def _collect_transcription(file_path_or_array, duration: float, time_offset: float) -> list:
    """Run Whisper transcription and return a list of row dicts for bulk insert.

    ``file_path_or_array`` can be either:
    - a str file path (legacy/fallback path)
    - a numpy float32 array (in-memory pipeline)

    Uses BatchedInferencePipeline when available for ~3–5× faster throughput.
    Deliberately avoids any DB interaction so it can run concurrently with
    ``_collect_embeddings`` without SQLAlchemy session conflicts.
    """
    pipeline = _get_batched_pipeline()

    # BatchedInferencePipeline.transcribe() accepts numpy arrays directly
    transcribe_kwargs = dict(word_timestamps=True, vad_filter=True)

    # If the pipeline supports batch_size (BatchedInferencePipeline), use it
    from faster_whisper import BatchedInferencePipeline as _BIP
    if isinstance(pipeline, _BIP):
        transcribe_kwargs["batch_size"] = 16

    segments, _info = pipeline.transcribe(file_path_or_array, **transcribe_kwargs)

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
        # Process audio in 300-second segments.
        #
        # When PyAV is installed, audio is decoded entirely in memory — no temp
        # files hit the disk at all. This eliminates the I/O overhead of writing
        # and re-reading WAV segments, which is significant on HF Spaces where
        # the ephemeral storage is a slow network-attached volume.
        #
        # Falls back to ffmpeg + temp WAV files if PyAV is not available.
        # ---------------------------------------------------------------------------
        embedder = ClapEmbedder()
        fragmenter = AudioFragmenter()

        current_offset = 0.0
        seg_index = 0

        for seg_audio, seg_sr, seg_offset in _decode_audio_segments(file_path):
            seg_duration = len(seg_audio) / seg_sr
            seg_index += 1
            logger.info(
                "Processing segment %d (offset: %.2fs, duration: %.2fs)",
                seg_index, seg_offset, seg_duration,
            )

            # Compute progress range for this segment
            seg_fraction  = seg_duration / (total_duration if total_duration > 0 else 1)
            base_progress = 0.05 + (seg_offset / (total_duration if total_duration > 0 else 1)) * 0.90
            seg_end       = base_progress + seg_fraction * 0.90

            _update_progress(db, job_id, base_progress)

            # 1. Fragment audio into chunks (directly from numpy array — no disk)
            seg_chunks = fragmenter.fragment_from_array(seg_audio, seg_sr)

            # Apply global time offset
            for chunk in seg_chunks:
                chunk["start_time"] += seg_offset
                chunk["end_time"]   += seg_offset

            # -----------------------------------------------------------------
            # 2. CLAP embedding (GPU) and Whisper transcription (CPU) run in
            #    parallel via ThreadPoolExecutor.  Both helpers are pure
            #    collect functions — they never touch the DB, so there are no
            #    SQLAlchemy session conflicts.  Python's GIL is released during
            #    both CUDA kernel launches and ctranslate2 C++ inference, so
            #    true concurrency is achieved.
            #
            #    Whisper now receives the numpy array directly (no temp file).
            # -----------------------------------------------------------------
            with ThreadPoolExecutor(max_workers=2) as executor:
                embed_future      = executor.submit(_collect_embeddings, seg_chunks, embedder)
                transcribe_future = executor.submit(
                    _collect_transcription, seg_audio, seg_duration, seg_offset,
                )

                # Wait for both — propagate the first exception if either fails
                embed_rows      = embed_future.result()
                transcript_rows = transcribe_future.result()

            # 3. Write results to DB (sequential, safe with single session)
            _insert_embeddings(db, file_id, embed_rows)
            _insert_transcription(db, file_id, transcript_rows)

            # Update progress to end of this segment
            _update_progress(db, job_id, seg_end)

            # Free memory before next segment
            del seg_audio, seg_chunks, embed_rows, transcript_rows
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
