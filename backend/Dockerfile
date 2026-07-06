# PyTorch 2.1 with CUDA 12.1 + cuDNN 8 — pre-built for T4 NVIDIA GPU
# Using the official PyTorch image avoids having to install the CUDA toolkit
# from scratch and guarantees torch is built against the correct CUDA version.
FROM pytorch/pytorch:2.1.2-cuda12.1-cudnn8-runtime

# Install system dependencies (ffmpeg for librosa/audio decoding, libsndfile for soundfile)
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=Etc/UTC
RUN apt-get update && \
    apt-get install -y --no-install-recommends gcc git libsndfile1 ffmpeg && \
    rm -rf /var/lib/apt/lists/*

# Set up a non-root user for Hugging Face Spaces
RUN useradd -m -u 1000 user
USER user
ENV PATH="/home/user/.local/bin:$PATH"

# ---------------------------------------------------------------------------
# HuggingFace cache configuration — keep model weights in a persistent,
# well-known directory so they survive pip upgrades and so the download
# step below actually populates the cache the runtime will read from.
# ---------------------------------------------------------------------------
ENV HF_HOME=/home/user/.cache/huggingface
ENV TRANSFORMERS_CACHE=/home/user/.cache/huggingface/hub
ENV HF_HUB_DOWNLOAD_TIMEOUT=120

WORKDIR /app

# Copy requirements and install Python deps
COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ---------------------------------------------------------------------------
# Pre-download ML models during the Docker build so that cold starts on
# HF Spaces never need network access to HuggingFace Hub.  This adds
# ~700 MB to the image but eliminates the #1 source of cold-start failures.
# ---------------------------------------------------------------------------
RUN python -c "\
from transformers import ClapModel, AutoProcessor; \
ClapModel.from_pretrained('laion/clap-htsat-fused'); \
AutoProcessor.from_pretrained('laion/clap-htsat-fused'); \
print('CLAP model cached successfully.')"

RUN python -c "\
from faster_whisper import WhisperModel; \
WhisperModel('tiny'); \
print('Whisper model cached successfully.')"

# Copy source code and create uploads dir
COPY --chown=user ./src ./src
RUN mkdir -p /app/uploads && chmod 777 /app/uploads

# Expose port 7860 for Hugging Face Spaces
EXPOSE 7860

# Run the app
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "7860"]
