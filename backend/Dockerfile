# PyTorch 2.1 with CUDA 12.1 + cuDNN 8 — pre-built for T4 NVIDIA GPU
# Using the official PyTorch image avoids having to install the CUDA toolkit
# from scratch and guarantees torch is built against the correct CUDA version.
FROM pytorch/pytorch:2.1.2-cuda12.1-cudnn8-runtime

# Install system dependencies (ffmpeg for librosa/audio decoding, libsndfile for soundfile)
RUN apt-get update && \
    apt-get install -y --no-install-recommends gcc git libsndfile1 ffmpeg && \
    rm -rf /var/lib/apt/lists/*

# Set up a non-root user for Hugging Face Spaces
RUN useradd -m -u 1000 user
USER user
ENV PATH="/home/user/.local/bin:$PATH"

WORKDIR /app

# Copy requirements and install Python deps
COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code and create uploads dir
COPY --chown=user ./src ./src
RUN mkdir -p /app/uploads && chmod 777 /app/uploads

# Expose port 7860 for Hugging Face Spaces
EXPOSE 7860

# Run the app
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "7860"]
