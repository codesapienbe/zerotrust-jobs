-- Usage logs for authenticated retrievals
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.analyses_access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_fingerprint text NOT NULL,
  ip_fingerprint text,
  user_agent text,
  endpoint text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analyses_access_logs_api_key_created_at ON public.analyses_access_logs (api_key_fingerprint, created_at); 