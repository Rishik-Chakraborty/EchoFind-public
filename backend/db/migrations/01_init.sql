-- 01_init.sql

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Table to track ingestion jobs
CREATE TABLE IF NOT EXISTS audio_jobs (
    id SERIAL PRIMARY KEY,
    file_url TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Table for uploaded audio file metadata
CREATE TABLE IF NOT EXISTS audio_files (
    id SERIAL PRIMARY KEY,
    job_id INTEGER REFERENCES audio_jobs(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    duration_seconds FLOAT,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Table for audio chunks (vectors)
CREATE TABLE IF NOT EXISTS audio_chunks (
    id SERIAL PRIMARY KEY,
    file_id INTEGER REFERENCES audio_files(id) ON DELETE CASCADE,
    start_time FLOAT NOT NULL,
    end_time FLOAT NOT NULL,
    resolution_type TEXT NOT NULL CHECK (resolution_type IN ('250ms','2s','5s')),
    embedding VECTOR(512) NOT NULL
);

-- HNSW index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS idx_audio_chunks_embedding ON audio_chunks USING hnsw (embedding vector_cosine_ops);
