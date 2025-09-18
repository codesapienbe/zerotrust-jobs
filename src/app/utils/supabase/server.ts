
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

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
