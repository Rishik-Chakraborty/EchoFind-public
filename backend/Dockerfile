FROM python:3.11-slim

# Install system dependencies (ffmpeg is needed for librosa and whisper!)
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
