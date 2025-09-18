-- Create extensions required for UUID generation and vector support
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

-- Analyses table for storing flexible analysis payloads and optional vector embeddings
CREATE TABLE IF NOT EXISTS public.analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text,
  job_title text,
  input_payload jsonb,
  analysis jsonb,
  ai_analysis text,
  -- Embedding column using pgvector; dimension chosen as 1536 (OpenAI-style) — adjust if using a different model
  embedding vector(1536),
  embedding_json jsonb,
  created_at timestamptz DEFAULT now()
);

-- Optional index for vector similarity search (ivfflat) — requires significant RAM for indexing; tune `lists` as needed
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = 'idx_analyses_embedding'
  ) THEN
    EXECUTE 'CREATE INDEX idx_analyses_embedding ON public.analyses USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)';
  END IF;
END$$; 