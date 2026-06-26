-- 02_transcript_search.sql
-- Improve transcript search performance and add progress tracking.

-- Enable trigram extension for fuzzy text matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Add progress column to audio_jobs for frontend progress bars
ALTER TABLE audio_jobs ADD COLUMN IF NOT EXISTS progress FLOAT DEFAULT 0.0;

-- GIN trigram index on transcript text for fast ILIKE / similarity() queries
CREATE INDEX IF NOT EXISTS idx_audio_transcripts_text_trgm
    ON audio_transcripts USING gin (text gin_trgm_ops);

-- Full-text search index for exact word matching via to_tsvector/to_tsquery
CREATE INDEX IF NOT EXISTS idx_audio_transcripts_text_fts
    ON audio_transcripts USING gin (to_tsvector('english', text));

-- Update the resolution_type constraint to include 'speech' type
-- (used by the search endpoint for transcript-based results)
ALTER TABLE audio_chunks DROP CONSTRAINT IF EXISTS audio_chunks_resolution_type_check;
ALTER TABLE audio_chunks ADD CONSTRAINT audio_chunks_resolution_type_check
    CHECK (resolution_type IN ('1s', '2s', 'onset', 'speech'));
