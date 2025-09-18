-- 003_add_summary_columns.sql
-- Add server-generated short summaries to the analyses table for UI truncation and search

BEGIN;

ALTER TABLE IF EXISTS public.analyses
  ADD COLUMN IF NOT EXISTS company_profile_summary TEXT,
  ADD COLUMN IF NOT EXISTS job_description_summary TEXT,
  ADD COLUMN IF NOT EXISTS resume_summary TEXT;

COMMIT; 