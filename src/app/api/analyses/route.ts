import { NextRequest, NextResponse } from 'next/server'
import Groq from 'groq-sdk'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { createAdminClient } from '../../utils/supabase/server'

const LOG_FILE = path.join(process.cwd(), 'application.log')
function logEvent(level: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG', component: string, message: string, meta: Record<string, unknown> = {}) {
  try {
    const log = { timestamp: new Date().toISOString(), level, component, message, ...meta }
    fs.appendFileSync(LOG_FILE, JSON.stringify(log) + '\n')
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to write application.log', err)
  }
}

function anonymizeText(text: string | null | undefined): string {
  if (!text) return ''
  try {
    let s = String(text)
    s = s.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/g, '[REDACTED_EMAIL]')
    s = s.replace(/\+?\d{1,3}[\s-.]?\(?\d{1,4}\)?[\s-.]?\d{1,4}[\s-.]?\d{1,9}/g, '[REDACTED_PHONE]')
    s = s.replace(/\b\d{12,19}\b/g, '[REDACTED_NUMBER]')
    s = s.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED_SSN]')
    s = s.replace(/\b\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\b/g, '[REDACTED_DATE]')
    s = s.replace(/\b[A-Z][a-z]{1,}\s[A-Z][a-z]{1,}\b/g, '[REDACTED_NAME]')
    return s.substring(0, 2000)
  } catch {
    return ''
  }
}

function anonymizeAny(value: unknown): unknown {
  if (value == null) return value
  if (typeof value === 'string') return anonymizeText(value)
  if (Array.isArray(value)) return value.map(anonymizeAny)
  if (typeof value === 'object') {
    const obj: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (/resume|cv|ssn|social|phone|email|dob|date_of_birth/i.test(k)) {
        obj[k] = typeof v === 'string' ? `${anonymizeText(v as string).substring(0, 200)} (redacted)` : '[REDACTED]'
        continue
      }
      obj[k] = anonymizeAny(v)
    }
    return obj
  }
  return value
}

function dot(a: number[], b: number[]) {
  let s = 0
  for (let i = 0; i < a.length && i < b.length; i++) s += a[i] * b[i]
  return s
}
function magnitude(a: number[]) {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * a[i]
  return Math.sqrt(s)
}
function cosine(a: number[], b: number[]) {
  const magA = magnitude(a)
  const magB = magnitude(b)
  if (magA === 0 || magB === 0) return 0
  return dot(a, b) / (magA * magB)
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const page = Math.max(1, Number(url.searchParams.get('page') || '1'))
    const perPage = Math.min(100, Math.max(1, Number(url.searchParams.get('per_page') || '10')))
    const query = url.searchParams.get('q') || ''
    const k = Math.max(1, Number(url.searchParams.get('k') || String(perPage)))

    logEvent('INFO', 'GET /api/analyses', 'Listing requested', { page, perPage, hasQuery: !!query })

    const client = createAdminClient()

    // If no vector query, perform simple paginated query ordered by created_at
    if (!query) {
      const { data, error, count } = await client.from('analyses').select('id,company_name,job_title,analysis,ai_analysis,company_profile_summary,job_description_summary,resume_summary,created_at', { count: 'exact' }).order('created_at', { ascending: false }).range((page - 1) * perPage, page * perPage - 1)
      if (error) {
        logEvent('ERROR', 'GET /api/analyses', 'Supabase list failed', { error: String(error) })
        return NextResponse.json({ error: 'Failed to fetch analyses' }, { status: 500 })
      }

      // Anonymize returned rows and prefer short summaries instead of full content
      const items = (data || []).map((r: Record<string, unknown>) => ({
        id: r.id,
        company_name: anonymizeText(String(r.company_name || '')),
        job_title: anonymizeText(String(r.job_title || '')),
        analysis: anonymizeAny(r.analysis),
        ai_analysis: anonymizeText(String(r.ai_analysis || '')),
        company_profile_summary: anonymizeText(String(r.company_profile_summary || '')),
        job_description_summary: anonymizeText(String(r.job_description_summary || '')),
        resume_summary: anonymizeText(String(r.resume_summary || '')),
        created_at: r.created_at
      }))

      return NextResponse.json({ items, page, per_page: perPage, total: count ?? items.length })
    }

    // Vector search flow: try to get embedding for query using Groq SDK
    let queryEmbedding: number[] | undefined
    try {
      if (!process.env.GROQ_API_KEY) {
        logEvent('INFO', 'GET /api/analyses', 'GROQ_API_KEY not provided; skipping embeddings')
      } else {
        const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
        const groqEmb = groq as unknown as {
          embeddings?: {
            create?: (opts: { model: string; input: string }) => Promise<{ data?: { embedding?: number[] }[] }>
          }
        }
        if (groqEmb?.embeddings && typeof groqEmb.embeddings.create === 'function') {
          const embResp = await groqEmb.embeddings.create({ model: 'text-embedding-3-small', input: query })
          queryEmbedding = embResp?.data?.[0]?.embedding
        } else {
          logEvent('INFO', 'GET /api/analyses', 'Groq embeddings not available on SDK; skipping embeddings')
        }
      }
    } catch (e) {
      logEvent('WARN', 'GET /api/analyses', 'Embedding generation failed', { error: String(e) })
    }

    if (!queryEmbedding) {
      // No embedding available; fallback to text match using ilike on job_title/company_name and pagination
      const match = `%${query.replace(/%/g, '\\%')}%`
      const { data, error, count } = await client.from('analyses').select('id,company_name,job_title,analysis,ai_analysis,company_profile_summary,job_description_summary,resume_summary,created_at', { count: 'exact' }).or(`company_name.ilike.${match},job_title.ilike.${match}`).order('created_at', { ascending: false }).range((page - 1) * perPage, page * perPage - 1)
      if (error) {
        logEvent('ERROR', 'GET /api/analyses', 'Supabase search failed', { error: String(error) })
        return NextResponse.json({ error: 'Failed to search analyses' }, { status: 500 })
      }
      const items = (data || []).map((r: Record<string, unknown>) => ({
        id: r.id,
        company_name: anonymizeText(String(r.company_name || '')),
        job_title: anonymizeText(String(r.job_title || '')),
        analysis: anonymizeAny(r.analysis),
        ai_analysis: anonymizeText(String(r.ai_analysis || '')),
        company_profile_summary: anonymizeText(String(r.company_profile_summary || '')),
        job_description_summary: anonymizeText(String(r.job_description_summary || '')),
        resume_summary: anonymizeText(String(r.resume_summary || '')),
        created_at: r.created_at
      }))
      return NextResponse.json({ items, page, per_page: perPage, total: count ?? items.length })
    }

    // We have a query embedding — fetch a window of candidate rows that have embeddings (vector or embedding_json)
    // Limiting to a reasonable window to avoid large memory scans; tune `candidateLimit` as needed.
    const candidateLimit = 1000
    const { data: rawCandidates, error: candErr } = await client.from('analyses').select('id,company_name,job_title,analysis,ai_analysis,company_profile_summary,job_description_summary,resume_summary,created_at,embedding,embedding_json').order('created_at', { ascending: false }).limit(candidateLimit)
    if (candErr) {
      logEvent('ERROR', 'GET /api/analyses', 'Failed to fetch candidate rows for vector search', { error: String(candErr) })
      return NextResponse.json({ error: 'Vector search failed' }, { status: 500 })
    }

    type Candidate = { row: Record<string, unknown>; vec?: number[] }

    const candidates: Candidate[] = (rawCandidates || []).map((r: Record<string, unknown>): Candidate => {
      // Normalize embedding from either column
      let vec: number[] | undefined
      if (r.embedding && Array.isArray(r.embedding)) vec = r.embedding as number[]
      else if (r.embedding && typeof r.embedding === 'string') {
        try { vec = JSON.parse(r.embedding as string) as number[] } catch { vec = undefined }
      } else if (r.embedding_json) {
        try { vec = (r.embedding_json as unknown) as number[] } catch { vec = undefined }
      }
      return { row: r, vec }
    }).filter((c: Candidate) => Array.isArray(c.vec) && (c.vec as number[]).length > 0)

    // Compute similarities
    const scored: { row: Record<string, unknown>; score: number }[] = candidates.map((c: Candidate) => ({
      row: c.row,
      score: cosine(queryEmbedding as number[], c.vec as number[])
    }))

    // Sort descending by score
    scored.sort((a: { row: Record<string, unknown>; score: number }, b: { row: Record<string, unknown>; score: number }) => b.score - a.score)

    const start = (page - 1) * perPage
    const sliced = scored.slice(start, start + perPage)

    const items = sliced.map((s: { row: Record<string, unknown>; score: number }) => ({
      id: s.row.id,
      company_name: anonymizeText(String(s.row.company_name || '')),
      job_title: anonymizeText(String(s.row.job_title || '')),
      analysis: anonymizeAny(s.row.analysis),
      ai_analysis: anonymizeText(String(s.row.ai_analysis || '')),
      company_profile_summary: anonymizeText(String(s.row.company_profile_summary || '')),
      job_description_summary: anonymizeText(String(s.row.job_description_summary || '')),
      resume_summary: anonymizeText(String(s.row.resume_summary || '')),
      created_at: s.row.created_at,
      score: s.score
    }))

    // We cannot reliably report total without an expensive count across the table for vector search; provide an estimate
    const total_estimate = Math.min(candidateLimit, (items.length > 0 ? candidateLimit : 0))

    return NextResponse.json({ items, page, per_page: perPage, total_estimate })
  } catch (error) {
    logEvent('ERROR', 'GET /api/analyses', 'Handler error', { error: String(error) })
    return NextResponse.json({ error: 'Failed to list analyses' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    // Authentication: require API key in header or bearer token
    const headerKey = request.headers.get('x-analyses-api-key') || ''
    const authHeader = request.headers.get('authorization') || ''
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    const providedKey = headerKey || bearer

    const expectedKey = process.env.ANALYSES_API_KEY || ''
    if (!expectedKey) {
      logEvent('ERROR', 'POST /api/analyses', 'Server misconfiguration: ANALYSES_API_KEY not set')
      return NextResponse.json({ error: 'Server not configured for authenticated retrievals' }, { status: 500 })
    }

    if (!providedKey || providedKey !== expectedKey) {
      logEvent('WARN', 'POST /api/analyses', 'Unauthorized retrieval attempt', { ip: request.headers.get('x-forwarded-for') || null })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Rate-limiting and usage logging
    try {
      const client = createAdminClient()

      const fingerprint = (input: string) => crypto.createHash('sha256').update(input).digest('hex')
      const apiKeyFingerprint = fingerprint(providedKey)
      const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
      const ipFingerprint = ip !== 'unknown' ? fingerprint(String(ip)) : null
      const userAgent = request.headers.get('user-agent') || null

      // Rate limit parameters (env-configurable)
      const windowMs = Number(process.env.ANALYSES_RATE_LIMIT_WINDOW_MS || '60000')
      const maxRequests = Number(process.env.ANALYSES_RATE_LIMIT || '60')
      const since = new Date(Date.now() - windowMs).toISOString()

      // Count recent requests for this API key fingerprint
      const { count, error: countError } = await client.from('analyses_access_logs').select('id', { count: 'exact' }).eq('api_key_fingerprint', apiKeyFingerprint).gte('created_at', since)
      if (countError) {
        logEvent('WARN', 'POST /api/analyses', 'Failed to read access logs for rate limiting', { error: String(countError) })
      } else if ((count || 0) >= maxRequests) {
        logEvent('WARN', 'POST /api/analyses', 'Rate limit exceeded', { apiKeyFingerprint, windowMs, maxRequests })
        return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
      }

      // Insert access log (best-effort)
      try {
        await client.from('analyses_access_logs').insert([{ api_key_fingerprint: apiKeyFingerprint, ip_fingerprint: ipFingerprint, user_agent: userAgent, endpoint: 'POST /api/analyses' }])
      } catch (logErr) {
        logEvent('WARN', 'POST /api/analyses', 'Failed to insert access log', { error: String(logErr) })
      }
    } catch (e) {
      logEvent('WARN', 'POST /api/analyses', 'Rate limit check failed (allowing request)', { error: String(e) })
    }

    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const query = typeof body.q === 'string' ? body.q : ''
    const page = Math.max(1, Number(body.page || 1))
    const perPage = Math.min(100, Math.max(1, Number(body.per_page || body.perPage || 10)))
    const k = Math.max(1, Number(body.k || perPage))

    logEvent('INFO', 'POST /api/analyses', 'Authenticated listing requested', { page, perPage, hasQuery: !!query })

    const client = createAdminClient()

    if (!query) {
      const { data, error, count } = await client.from('analyses').select('id,company_name,job_title,analysis,ai_analysis,company_profile_summary,job_description_summary,resume_summary,created_at', { count: 'exact' }).order('created_at', { ascending: false }).range((page - 1) * perPage, page * perPage - 1)
      if (error) {
        logEvent('ERROR', 'POST /api/analyses', 'Supabase list failed', { error: String(error) })
        return NextResponse.json({ error: 'Failed to fetch analyses' }, { status: 500 })
      }

      const items = (data || []).map((r: Record<string, unknown>) => ({
        id: r.id,
        company_name: anonymizeText(String(r.company_name || '')),
        job_title: anonymizeText(String(r.job_title || '')),
        analysis: anonymizeAny(r.analysis),
        ai_analysis: anonymizeText(String(r.ai_analysis || '')),
        company_profile_summary: anonymizeText(String(r.company_profile_summary || '')),
        job_description_summary: anonymizeText(String(r.job_description_summary || '')),
        resume_summary: anonymizeText(String(r.resume_summary || '')),
        created_at: r.created_at
      }))

      return NextResponse.json({ items, page, per_page: perPage, total: count ?? items.length })
    }

    // Embedding path (authenticated)
    let queryEmbedding: number[] | undefined
    try {
      if (!process.env.GROQ_API_KEY) {
        logEvent('INFO', 'POST /api/analyses', 'GROQ_API_KEY not provided; skipping embeddings')
      } else {
        const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
        const groqEmb = groq as unknown as {
          embeddings?: {
            create?: (opts: { model: string; input: string }) => Promise<{ data?: { embedding?: number[] }[] }>
          }
        }
        if (groqEmb?.embeddings && typeof groqEmb.embeddings.create === 'function') {
          const embResp = await groqEmb.embeddings.create({ model: 'text-embedding-3-small', input: query })
          queryEmbedding = embResp?.data?.[0]?.embedding
        } else {
          logEvent('INFO', 'POST /api/analyses', 'Groq embeddings not available on SDK; skipping embeddings')
        }
      }
    } catch (e) {
      logEvent('WARN', 'POST /api/analyses', 'Embedding generation failed', { error: String(e) })
    }

    if (!queryEmbedding) {
      const match = `%${String(query).replace(/%/g, '\\%')}%`
      const { data, error, count } = await client.from('analyses').select('id,company_name,job_title,analysis,ai_analysis,company_profile_summary,job_description_summary,resume_summary,created_at', { count: 'exact' }).or(`company_name.ilike.${match},job_title.ilike.${match}`).order('created_at', { ascending: false }).range((page - 1) * perPage, page * perPage - 1)
      if (error) {
        logEvent('ERROR', 'POST /api/analyses', 'Supabase search failed', { error: String(error) })
        return NextResponse.json({ error: 'Failed to search analyses' }, { status: 500 })
      }
      const items = (data || []).map((r: Record<string, unknown>) => ({
        id: r.id,
        company_name: anonymizeText(String(r.company_name || '')),
        job_title: anonymizeText(String(r.job_title || '')),
        analysis: anonymizeAny(r.analysis),
        ai_analysis: anonymizeText(String(r.ai_analysis || '')),
        company_profile_summary: anonymizeText(String(r.company_profile_summary || '')),
        job_description_summary: anonymizeText(String(r.job_description_summary || '')),
        resume_summary: anonymizeText(String(r.resume_summary || '')),
        created_at: r.created_at
      }))
      return NextResponse.json({ items, page, per_page: perPage, total: count ?? items.length })
    }

    const candidateLimit = 1000
    const { data: rawCandidates, error: candErr } = await client.from('analyses').select('id,company_name,job_title,analysis,ai_analysis,company_profile_summary,job_description_summary,resume_summary,created_at,embedding,embedding_json').order('created_at', { ascending: false }).limit(candidateLimit)
    if (candErr) {
      logEvent('ERROR', 'POST /api/analyses', 'Failed to fetch candidate rows for vector search', { error: String(candErr) })
      return NextResponse.json({ error: 'Vector search failed' }, { status: 500 })
    }

    type Candidate = { row: Record<string, unknown>; vec?: number[] }

    const candidates: Candidate[] = (rawCandidates || []).map((r: Record<string, unknown>): Candidate => {
      let vec: number[] | undefined
      if (r.embedding && Array.isArray(r.embedding)) vec = r.embedding as number[]
      else if (r.embedding && typeof r.embedding === 'string') {
        try { vec = JSON.parse(r.embedding as string) as number[] } catch { vec = undefined }
      } else if (r.embedding_json) {
        try { vec = (r.embedding_json as unknown) as number[] } catch { vec = undefined }
      }
      return { row: r, vec }
    }).filter((c: Candidate) => Array.isArray(c.vec) && (c.vec as number[]).length > 0)

    const scored: { row: Record<string, unknown>; score: number }[] = candidates.map((c: Candidate) => ({ row: c.row, score: cosine(queryEmbedding as number[], c.vec as number[]) }))
    scored.sort((a: { row: Record<string, unknown>; score: number }, b: { row: Record<string, unknown>; score: number }) => b.score - a.score)

    const start = (page - 1) * perPage
    const sliced = scored.slice(start, start + perPage)

    const items = sliced.map((s: { row: Record<string, unknown>; score: number }) => ({
      id: s.row.id,
      company_name: anonymizeText(String(s.row.company_name || '')),
      job_title: anonymizeText(String(s.row.job_title || '')),
      analysis: anonymizeAny(s.row.analysis),
      ai_analysis: anonymizeText(String(s.row.ai_analysis || '')),
      company_profile_summary: anonymizeText(String(s.row.company_profile_summary || '')),
      job_description_summary: anonymizeText(String(s.row.job_description_summary || '')),
      resume_summary: anonymizeText(String(s.row.resume_summary || '')),
      created_at: s.row.created_at,
      score: s.score
    }))

    const total_estimate = Math.min(candidateLimit, (items.length > 0 ? candidateLimit : 0))
    return NextResponse.json({ items, page, per_page: perPage, total_estimate })
  } catch (error) {
    logEvent('ERROR', 'POST /api/analyses', 'Handler error', { error: String(error) })
    return NextResponse.json({ error: 'Failed to list analyses' }, { status: 500 })
  }
} 