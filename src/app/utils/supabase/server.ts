
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import fs from 'fs'
import path from 'path'
declare function require(moduleName: string): unknown

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const createClient = (_cookieStore: ReturnType<typeof cookies>) => {
  // Previously we used an auth-helper that wired cookies into the client.
  // For now create a plain Supabase client server-side to satisfy build/runtime needs.
  return createSupabaseClient(supabaseUrl!, supabaseKey!);
};

// New: create an admin/service-role client for server-side operations (best-effort).
// Uses SUPABASE_SERVICE_ROLE_KEY when present; falls back to anon key and logs a warning.
export const createAdminClient = () => {
  const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseKey;
  if (!adminKey) {
    throw new Error('Missing Supabase key for server-side operations')
  }

  return createSupabaseClient(supabaseUrl!, adminKey!);
}

// Migration runner: applies any .sql files in supabase_migrations in lexical order.
const MIGRATIONS_DIR = path.join(process.cwd(), 'supabase_migrations')
const DB_URL = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || null
let migrationsApplied = false

// Use runtime require for 'pg' — disable strict TS/ESLint checks for this dynamic section
/* eslint-disable @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any */
async function createPgPool(connectionString: string) {
  try {
    // Dynamically require to avoid build-time dependency on 'pg' in environments where it's not installed.
    // For fail-fast behavior we throw if the module isn't present while a DB URL is configured.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Pg: any = require('pg')
    if (!Pg || !Pg.Pool) throw new Error('pg module not available')
    const Pool = Pg.Pool as any
    return new Pool({ connectionString })
  } catch (e) {
    // If a DB URL is configured, fail-fast by rethrowing the error. Otherwise, return null.
    if (DB_URL) {
      throw e
    }
    try { fs.appendFileSync(path.join(process.cwd(), 'application.log'), JSON.stringify({ timestamp: new Date().toISOString(), level: 'INFO', component: 'migrations', message: 'pg module not available; skipping DB pool creation' }) + '\n') } catch {}
    return null
  }
}
/* eslint-enable @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any */

async function runMigrationsIfNeeded() {
  if (migrationsApplied) return
  if (!DB_URL) {
    // Nothing to do without a DB URL
    return
  }

  const pool = await createPgPool(DB_URL)
  if (!pool) return
  let client
  try {
    client = await pool.connect()
    // Acquire advisory lock to avoid concurrent runners
    const MIGRATION_LOCK_KEY = 9876543210
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY])
    // Ensure migration table exists
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (id SERIAL PRIMARY KEY, filename TEXT UNIQUE NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())')

    if (!fs.existsSync(MIGRATIONS_DIR)) {
      migrationsApplied = true
      return
    }

    const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort()
    for (const file of files) {
      const { rows } = await client.query('SELECT 1 FROM schema_migrations WHERE filename = $1', [file])
      if (rows.length > 0) continue

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
      try {
        await client.query('BEGIN')
        await client.query(sql)
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file])
        await client.query('COMMIT')
        try { fs.appendFileSync(path.join(process.cwd(), 'application.log'), JSON.stringify({ timestamp: new Date().toISOString(), level: 'INFO', component: 'migrations', message: 'Applied migration', filename: file }) + '\n') } catch {}
      } catch (e) {
        await client.query('ROLLBACK')
        try { fs.appendFileSync(path.join(process.cwd(), 'application.log'), JSON.stringify({ timestamp: new Date().toISOString(), level: 'ERROR', component: 'migrations', message: 'Migration failed', filename: file, error: String(e) }) + '\n') } catch {}
        throw e
      }
    }

    migrationsApplied = true
    // Release advisory lock
    try { await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]) } catch (e) { /* best-effort */ }
  } finally {
    try { client?.release() } catch {}
    try { await pool.end() } catch {}
  }
}

// Attempt to run migrations on module initialization (cold start) — fail-fast.
if (DB_URL) {
  // Top-level await to ensure migrations are applied before the app starts. This will throw on error.
  await (async () => {
    try {
      await runMigrationsIfNeeded()
    } catch (e) {
      // Log and rethrow to fail startup
      try { fs.appendFileSync(path.join(process.cwd(), 'application.log'), JSON.stringify({ timestamp: new Date().toISOString(), level: 'ERROR', component: 'migrations', message: 'Init migration runner failed (fail-fast)', error: String(e) }) + '\n') } catch {}
      throw e
    }
  })()
}

// Insert an analysis record with optional embedding vector. Returns inserted rows on success (select()).
export async function insertAnalysisRecord(payload: Record<string, unknown>, embedding?: number[]) {
  const client = createAdminClient()
  const baseRow: Record<string, unknown> = { ...payload }

  // If no embedding provided, perform a straight insert
  if (!embedding || !Array.isArray(embedding)) {
    const { data, error } = await client.from('analyses').insert([baseRow]).select()
    if (error) throw error
    return data
  }

  // Try inserting into the native vector column first; on failure, fall back to embedding_json
  try {
    const { data, error } = await client.from('analyses').insert([{ ...baseRow, embedding }]).select()
    if (error) throw error
    return data
  } catch (err) {
    // Attempt fallback into embedding_json
    const { data, error } = await client.from('analyses').insert([{ ...baseRow, embedding_json: embedding }]).select()
    if (error) throw error
    return data
  }
}
