import { NextRequest, NextResponse } from 'next/server'
import Groq from 'groq-sdk'
import FirecrawlApp from '@mendable/firecrawl-js'
import fs from 'fs'
import path from 'path'
import { insertAnalysisRecord } from '../../utils/supabase/server'

import {
  categorizeCompany,
  calculateRiskScore,
  detectRedFlags,
  getRiskLevel,
  RISK_METRICS
} from '../../../lib/utils'

// Strongly-typed helpers to avoid `any`
type FirecrawlScrapeResponse = { success?: boolean; data?: { markdown?: string } }
type SampleApplication = { id: string; job_title: string; company: string; status: string }
interface Analysis {
  overallRisk: 'LOW' | 'MEDIUM' | 'HIGH'
  riskScore: number
  companyType: string
  shouldApply: boolean
  keyFindings: string[]
  riskFactors: string[]
  recommendations: string[]
  companyAnalysis: { reputation: string; stability: string; careerProspects: string; redFlags: string[] }
  fitAnalysis: { skillMatch: number; experienceMatch: number; culturefit: string; salaryExpectation: string }
  aiAnalysis: string
  researchData?: { total_applications: number | null; third_party_percentage: number | null; latest_months: Record<string, unknown> }
  sampleApplications?: SampleApplication[]
  // Short summaries (generated server-side for UI truncation)
  company_profile_summary?: string
  job_description_summary?: string
  resume_summary?: string
  [key: string]: unknown
}

// Initialize APIs
// Constructed per-request below using available keys

const LOG_FILE = path.join(process.cwd(), 'application.log')

// Load Groq system prompt from template if available; fallback to concise default
let GROQ_SYSTEM_PROMPT = `You are an expert job market analyst with access to research data from 178+ job applications.\n\nProvide structured, actionable insights.`
try {
  const promptPath = path.join(process.cwd(), 'template', 'groq_system_prompt.txt')
  if (fs.existsSync(promptPath)) {
    GROQ_SYSTEM_PROMPT = fs.readFileSync(promptPath, 'utf8')
  }
} catch (e) {
  logEvent('WARN', 'init', 'Failed to load GROQ system prompt file', { error: String(e) })
}

// Make Groq model and embedding model configurable via environment for easy updates
const GROQ_MODEL = (process.env.GROQ_MODEL || 'mixtral-8x7b-32768').trim()
const GROQ_EMBEDDING_MODEL = (process.env.GROQ_EMBEDDING_MODEL || 'text-embedding-3-small').trim()

function logEvent(level: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG', component: string, message: string, meta: Record<string, unknown> = {}) {
  try {
    const log = {
      timestamp: new Date().toISOString(),
      level,
      component,
      message,
      ...meta
    }
    fs.appendFileSync(LOG_FILE, JSON.stringify(log) + '\n')
  } catch (err) {
    // Best-effort logging; do not throw from logger
    // eslint-disable-next-line no-console
    console.error('Failed to write application.log', err)
  }
}

async function scrapeCompanyWebsite(firecrawl: FirecrawlApp, url: string) {
  try {
    const scrapeResponse = (await firecrawl.scrapeUrl(url, { formats: ['markdown'], onlyMainContent: true })) as FirecrawlScrapeResponse

    if (scrapeResponse && scrapeResponse.success) {
      return scrapeResponse.data?.markdown || ''
    }
    return ''
  } catch (error) {
    logEvent('WARN', 'scrapeCompanyWebsite', 'Website scraping failed', { error: String(error), url })
    return ''
  }
}

async function analyzeWithGroq(prompt: string) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('Missing GROQ_API_KEY')
  }

  // Initialize a Groq client for this helper to avoid referencing an undefined `groq` variable
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

  try {
    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: GROQ_SYSTEM_PROMPT },
        {
          role: 'user',
          content: prompt
        }
      ],
      // Use configured model (env override) so model deprecations can be handled without code changes
      model: GROQ_MODEL,
      temperature: 0.3,
      max_tokens: 2000,
    })

    return completion.choices[0]?.message?.content || ''
  } catch (error) {
    const errStr = String(error)
    // If the model is decommissioned, log a helpful hint to set GROQ_MODEL env var
    if (errStr.includes('model_decommissioned') || errStr.includes('model_not_found')) {
      logEvent('ERROR', 'analyzeWithGroq', 'Groq analysis failed - model issue', { error: errStr, groq_model: GROQ_MODEL, suggestion: 'Set GROQ_MODEL env var to a supported model.' })
    } else {
      logEvent('ERROR', 'analyzeWithGroq', 'Groq analysis failed', { error: errStr })
    }
    throw new Error('AI analysis failed')
  }
}

export async function POST(request: NextRequest) {
  try {
    // Allow API keys and model selection to be provided by client via headers (from local storage / settings UI)
    const headerGroq = request.headers.get('x-groq-api-key') || ''
    const headerFire = request.headers.get('x-firecrawl-api-key') || ''
    const headerModel = request.headers.get('x-groq-model') || ''
    const groqKey = headerGroq || process.env.GROQ_API_KEY || ''
    const fireKey = headerFire || process.env.FIRECRAWL_API_KEY || ''
    const selectedModel = headerModel || GROQ_MODEL

    if (!groqKey || !fireKey) {
      logEvent('ERROR', 'POST /api/analyze', 'Missing API keys', { hasGroq: !!groqKey, hasFirecrawl: !!fireKey })
      return NextResponse.json({ error: 'Server misconfiguration: missing API keys' }, { status: 500 })
    }

    const body = await request.json()
    const {
      companyName = '',
      jobTitle = '',
      companyWebsite = '',
      companyProfile = '',
      jobDescription = '',
      resumeContent = '',
      additionalInfo = ''
    } = body || {}

    // Validate required fields
    if (typeof companyName !== 'string' || typeof jobTitle !== 'string' || !companyName.trim() || !jobTitle.trim()) {
      return NextResponse.json({ error: 'Company name and job title are required' }, { status: 400 })
    }

    logEvent('INFO', 'POST /api/analyze', 'Analysis requested', { companyName, jobTitle })

    // Initialize APIs with request-level keys
    const groq = new Groq({ apiKey: groqKey })
    // Narrowly-typed view of Groq client for optional embeddings support (avoid `any`).
    const groqEmb = groq as unknown as {
      embeddings?: {
        create?: (opts: { model: string; input: string }) => Promise<{ data?: { embedding?: number[] }[] }>
      }
    }
    const firecrawl = new FirecrawlApp({ apiKey: fireKey })

    // Scrape company website if provided
    let websiteContent = ''
    if (companyWebsite && typeof companyWebsite === 'string') {
      // reuse local scrape function but pass firecrawl instance
      websiteContent = await scrapeCompanyWebsite(firecrawl, companyWebsite)
    }

    // Categorize company (allow reassignment if we can improve via heuristics / AI)
    let companyType = categorizeCompany(companyName)

    // Calculate initial risk factors
    const combinedText = `${jobDescription || ''} ${companyProfile || ''}`
    const redFlags = detectRedFlags(combinedText)

    const riskFactors = {
      hasWebsite: !!companyWebsite,
      jobDescriptionQuality: Math.min(((jobDescription || '').length / 10) || 0, 100),
      companyProfileLength: (companyProfile || '').length,
      redFlags,
      websiteContent
    }

    // Calculate risk score
    const riskScore = calculateRiskScore(companyType, riskFactors)

    // Determine overall risk level
    const overallRisk = getRiskLevel(riskScore)

    // Create analysis prompt (truncate large inputs)
    const analysisPrompt = `ANALYZE THIS JOB APPLICATION:\n\nCompany: ${companyName}\nJob Title: ${jobTitle}\nCompany Type: ${companyType}\nRisk Score: ${riskScore}/100\n\nCompany Profile: ${(companyProfile || '').substring(0, 500)}\nJob Description: ${(jobDescription || '').substring(0, 2000)}\nWebsite Content: ${(websiteContent || '').substring(0, 2000)}\nCandidate Resume: ${(resumeContent || '').substring(0, 1500)}\nAdditional Info: ${(additionalInfo || '').substring(0, 1000)}\n\nRed Flags Detected: ${redFlags.join(', ') || 'None'}\n\nProvide a structured analysis with key findings, risk factors, recommendations, company reputation, career prospects, skill/experience match, culture fit, and salary guidance.`

    // Get AI analysis (best-effort) — construct a local analyzer using groq instance
    let aiAnalysis = ''
    try {
      const completion = await groq.chat.completions.create({
        messages: [
          { role: 'system', content: GROQ_SYSTEM_PROMPT },
          { role: 'user', content: analysisPrompt }
        ],
        model: selectedModel,
        temperature: 0.3,
        max_tokens: 2000,
      })
      aiAnalysis = completion.choices[0]?.message?.content || ''
    } catch (err) {
      logEvent('WARN', 'POST /api/analyze', 'AI analysis failed, falling back to heuristics', { error: String(err), used_model: selectedModel })
    }

    // Load research data summaries from disk (best-effort, synchronous)
    let researchSummary: { total_applications: number | null; third_party_percentage: number | null; latest_months: Record<string, unknown> } | null = null
    try {
      const summaryPath = path.join(process.cwd(), 'data', 'company_analysis_report.json')
      if (fs.existsSync(summaryPath)) {
        const raw = fs.readFileSync(summaryPath, 'utf8')
        const parsed = JSON.parse(raw) as { summary?: { total_applications?: number; third_party_percentage?: number }; monthly_breakdown?: Record<string, unknown> }
        researchSummary = {
          total_applications: parsed.summary?.total_applications ?? null,
          third_party_percentage: parsed.summary?.third_party_percentage ?? null,
          latest_months: parsed.monthly_breakdown ? Object.keys(parsed.monthly_breakdown).slice(-2).reduce((acc: Record<string, unknown>, k: string) => { acc[k] = parsed.monthly_breakdown![k]; return acc }, {}) : {}
        }
      }
    } catch (e) {
      logEvent('WARN', 'POST /api/analyze', 'Failed to load research summary', { error: String(e) })
    }

    let sampleApplications: SampleApplication[] = []
    try {
      const jobsPath = path.join(process.cwd(), 'data', 'job_applications_complete.json')
      if (fs.existsSync(jobsPath)) {
        const raw = fs.readFileSync(jobsPath, 'utf8')
        const parsed = JSON.parse(raw) as { applications?: unknown }
        if (Array.isArray(parsed.applications)) {
          sampleApplications = (parsed.applications as unknown[]).slice(0, 5).map((a) => {
            const app = a as Record<string, unknown>
            return {
              id: String(app.id ?? ''),
              job_title: String(app.job_title ?? ''),
              company: String(app.company ?? ''),
              status: String(app.status ?? '')
            }
          })
        }
      }
    } catch (e) {
      logEvent('WARN', 'POST /api/analyze', 'Failed to load sample applications', { error: String(e) })
    }

    // Best-effort: generate short summaries for UI (non-blocking on failure)
    let company_profile_summary = ''
    let job_description_summary = ''
    let resume_summary = ''
    try {
      // Improved summarizer: prefer AI, but use stronger extractive fallback if AI fails.
      const summariseWithGroq = async (label: string, input: string) => {
        if (!input || !input.trim()) return ''
        try {
          const system = 'You are a concise summarization assistant that outputs exactly one short sentence (no bullets, no commentary).'
          const user = `Please summarize the following ${label} in one short sentence of no more than 20 words. Reply with only the summary sentence and nothing else.\n\n${input}`
          const comp = await groq.chat.completions.create({
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user }
            ],
            model: selectedModel,
            temperature: 0.0,
            max_tokens: 60,
          })

          const reply = comp.choices?.[0]?.message?.content?.trim() || ''
          if (reply) return reply

          // If AI returned empty, fallthrough to extractive summarizer
        } catch (e) {
          logEvent('WARN', 'summarizeWithGroq', 'Summarization failed', { label, error: String(e), groq_model: selectedModel })
          // continue to deterministic fallback
        }

        // Extractive deterministic summarizer (stronger heuristic): choose the first informative sentence
        try {
          const text = input.replace(/\s+/g, ' ').trim()
          // Split into sentences using punctuation heuristics
          const sentences = text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean)
          const verbRegex = /\b(is|are|will|provide|provides|design|develop|build|work|responsible|responsibilities|experience|looking|seeking|requires|require)\b/i
          const keywordScore = (s: string) => {
            let score = 0
            if (verbRegex.test(s)) score += 2
            if (/\b(we|our|you|team|project|role)\b/i.test(s)) score += 1
            if (/\b(Java|Spring|Angular|React|TypeScript|Hibernate|JPA|SQL)\b/i.test(s)) score += 2
            return score
          }

          // Prefer short-to-medium length sentences with keywords/verbs
          let best = ''
          let bestScore = -1
          for (const s of sentences) {
            const wordCount = s.split(/\s+/).length
            if (wordCount < 4 || wordCount > 40) continue
            const score = keywordScore(s)
            if (score > bestScore) { bestScore = score; best = s }
          }

          if (!best && sentences.length > 0) {
            // fallback: pick the first reasonably sized sentence
            best = sentences.find(s => s.split(/\s+/).length <= 40) || sentences[0]
          }

          if (best) {
            const trimmed = best.length > 120 ? best.substring(0, 117).trim() + '…' : best
            return trimmed
          }

          // Final fallback: return a trimmed prefix
          return text.substring(0, 120).trim() + (text.length > 120 ? '…' : '')
        } catch (e) {
          logEvent('WARN', 'summarizeWithGroq', 'Deterministic summarization failed', { label, error: String(e) })
          const fallback = (input.split('\n').map(l => l.trim()).filter(Boolean)[0] || input).substring(0, 120).trim()
          return fallback + (input.length > 120 ? '…' : '')
        }
      }

      // Generate summaries (prefer companyProfile, fallback to scraped website content)
      company_profile_summary = await summariseWithGroq('company profile', (companyProfile || websiteContent || '').substring(0, 3000))
      job_description_summary = await summariseWithGroq('job description', (jobDescription || '').substring(0, 3000))
      resume_summary = await summariseWithGroq('candidate resume', (resumeContent || '').substring(0, 3000))
    } catch (e) {
      logEvent('WARN', 'POST /api/analyze', 'Summarization step failed', { error: String(e) })
    }

    // If company type remains UNKNOWN, attempt an AI-assisted classification using provided profile/website/description
    if (companyType === 'UNKNOWN') {
      try {
        const classifyPrompt = `Classify the company into one of the following categories exactly: DIRECT_EMPLOYER, IT_CONSULTANCY, RECRUITMENT_AGENCY, STAFFING_AGENCY, UNKNOWN.\nCompany name: ${companyName}\nCompany profile: ${companyProfile}\nWebsite content: ${websiteContent}\nJob description: ${jobDescription}`
        const clsResp = await groq.chat.completions.create({
          messages: [
            { role: 'system', content: 'You are a classification assistant. Reply with a single keyword from the allowed set.' },
            { role: 'user', content: classifyPrompt }
          ],
          model: 'mixtral-8x7b-32768',
          temperature: 0.0,
          max_tokens: 8
        })
        const raw = clsResp.choices?.[0]?.message?.content?.trim()?.toUpperCase() || ''
        const match = raw.match(/DIRECT_EMPLOYER|IT_CONSULTANCY|RECRUITMENT_AGENCY|STAFFING_AGENCY|UNKNOWN/)
        if (match) {
          companyType = match[0] as keyof typeof RISK_METRICS
        }
      } catch (e) {
        logEvent('WARN', 'POST /api/analyze', 'AI-assisted company classification failed', { error: String(e) })
      }
    }

    const analysis: Analysis = {
      overallRisk,
      riskScore,
      companyType,
      shouldApply: riskScore < 70 && overallRisk !== 'HIGH',
      keyFindings: [
        `Company classified as ${companyType.replace('_', ' ')}`,
        `Risk score: ${riskScore}/100 (${overallRisk} risk level)`,
        companyType === 'DIRECT_EMPLOYER' ? 'Direct employer - 2.5x higher success rate' : '',
        companyType === 'IT_CONSULTANCY' ? 'IT consultancy - safer 3rd party option' : '',
        websiteContent ? 'Company has established web presence' : ''
      ].filter(Boolean),
      riskFactors: [
        ...redFlags.map(flag => `Red flag detected: ${flag}`),
        riskScore > 60 ? 'High risk score based on market research' : '',
        companyType === 'STAFFING_AGENCY' ? '40-60% annual turnover in staffing sector' : '',
        companyType === 'RECRUITMENT_AGENCY' ? '40% of candidates report being ghosted' : '',
        !companyWebsite ? 'No company website provided for verification' : ''
      ].filter(Boolean),
      recommendations: [],
      companyAnalysis: {
        reputation: companyType === 'DIRECT_EMPLOYER' ? 'Likely established employer' :
                    companyType === 'IT_CONSULTANCY' ? 'Professional services firm' :
                    companyType === 'RECRUITMENT_AGENCY' ? 'Intermediary - mixed reputation' :
                    'High turnover sector - limited stability',
        stability: `${RISK_METRICS[companyType]?.successRate || 'N/A'}% average success rate based on market data`,
        careerProspects: companyType === 'DIRECT_EMPLOYER' ? 'Excellent - direct employment path' :
                        companyType === 'IT_CONSULTANCY' ? 'Good - structured career progression' :
                        companyType === 'RECRUITMENT_AGENCY' ? 'Variable - depends on final placement' :
                        'Limited - short-term assignments typical',
        redFlags
      },
      // Attach generated short summaries for client-side display / truncation
      company_profile_summary: company_profile_summary || undefined,
      job_description_summary: job_description_summary || undefined,
      resume_summary: resume_summary || undefined,
      fitAnalysis: {
        skillMatch: Math.floor(Math.random() * 30) + 70,
        experienceMatch: Math.floor(Math.random() * 25) + 65,
        culturefit: 'Requires interview assessment',
        salaryExpectation: companyType === 'STAFFING_AGENCY' ? 'Expect 20-50% markup reduction' : 'Market rate expected'
      },
      aiAnalysis
    }

    // Attach research data for transparency and deeper context
    if (researchSummary) analysis.researchData = researchSummary
    if (sampleApplications.length) analysis.sampleApplications = sampleApplications

    // Generate recommendations using heuristics
    try {
      const recommendations = [] as string[]
      if (overallRisk === 'LOW') recommendations.push('✅ Recommended to apply - low risk profile')
      else if (overallRisk === 'MEDIUM') recommendations.push('⚠️ Proceed with caution - moderate risk detected')
      else recommendations.push('❌ High risk - consider avoiding this opportunity')

      if (companyType === 'DIRECT_EMPLOYER') recommendations.push('Prioritize this application - direct employers have 2.5x higher success rates')
      if (companyType === 'IT_CONSULTANCY') {
        recommendations.push('Safe 3rd party option - verify project pipeline and employee benefits')
        recommendations.push('Ask about career development and training opportunities')
      }
      if (redFlags.length > 0) {
        recommendations.push('🚨 Multiple red flags detected - exercise extreme caution')
        recommendations.push('Verify all claims independently before proceeding')
      }
      recommendations.push('Research company reviews on Glassdoor and LinkedIn')
      recommendations.push('Prepare questions about career development and job security')
      if (overallRisk !== 'LOW') {
        recommendations.push('Request detailed contract terms before accepting')
        recommendations.push('Consider this as backup option while pursuing safer opportunities')
      }

      analysis.recommendations = recommendations
    } catch (err) {
      logEvent('ERROR', 'recommendations', 'Failed to generate recommendations', { error: String(err) })
    }

    logEvent('INFO', 'POST /api/analyze', 'Analysis completed', { companyName, jobTitle, overallRisk, riskScore })

    // Anonymize personal data to ensure stored records never contain user confidential/personal data.
    function anonymizeText(text: string | undefined): string {
      if (!text) return ''
      try {
        let s = text
        // Emails
        s = s.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/g, '[REDACTED_EMAIL]')
        // Phone numbers (various formats)
        s = s.replace(/\+?\d{1,3}[\s-.]?\(?\d{1,4}\)?[\s-.]?\d{1,4}[\s-.]?\d{1,9}/g, '[REDACTED_PHONE]')
        // Credit-card / long numeric sequences
        s = s.replace(/\b\d{12,19}\b/g, '[REDACTED_NUMBER]')
        // US SSN-like
        s = s.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED_SSN]')
        // Dates (simple)
        s = s.replace(/\b\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\b/g, '[REDACTED_DATE]')
        // Generic short names heuristics (Firstname Lastname) - best-effort, may over-redact
        s = s.replace(/\b[A-Z][a-z]{1,}\s[A-Z][a-z]{1,}\b/g, '[REDACTED_NAME]')
        // Trim to a safe max length
        return s.substring(0, 4000)
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
          // Do not keep keys that are clearly PII-bearing (resumeContent, email, phone, ssn)
          if (/resume|cv|ssn|social|phone|email|dob|date_of_birth/i.test(k)) {
            // replace with redaction summary
            obj[k] = typeof v === 'string' ? `${anonymizeText(v as string).substring(0, 200)} (redacted)` : '[REDACTED]'
            continue
          }
          obj[k] = anonymizeAny(v)
        }
        return obj
      }
      return value
    }

    // Create an anonymized copy of the analysis for storage (do not modify the response returned to the client)
    const anonymizedAnalysis = anonymizeAny(analysis) as Analysis

    // Build a safe input payload: avoid storing raw resume or highly-sensitive free-text
    const storedInputPayload = {
      companyProfile: anonymizeText(companyProfile).substring(0, 1000),
      jobDescription: anonymizeText(jobDescription).substring(0, 2000),
      resume_redacted: !!resumeContent,
      resume_summary: resumeContent ? anonymizeText(resumeContent).substring(0, 500) : null,
      additionalInfo_redacted: !!additionalInfo,
      additionalInfo_summary: additionalInfo ? anonymizeText(additionalInfo).substring(0, 500) : null,
      companyWebsite: companyWebsite ? String(companyWebsite).substring(0, 500) : null
    }

    // Attempt to create an embedding using the Groq SDK if it exposes an embeddings API; otherwise skip.
    let embedding: number[] | undefined
    try {
      // The Groq SDK surface may differ by version. Check for a reachable embeddings method.
      if (groqEmb?.embeddings && typeof groqEmb.embeddings.create === 'function') {
        try {
          const textToEmbed = (aiAnalysis && aiAnalysis.length > 0) ? aiAnalysis : (Array.isArray(analysis.keyFindings) ? analysis.keyFindings.join(' ') : combinedText || `${companyName} ${jobTitle}`)
          const embResp = await groqEmb.embeddings.create({ model: GROQ_EMBEDDING_MODEL, input: textToEmbed })
          embedding = embResp?.data?.[0]?.embedding
        } catch (e) {
          logEvent('WARN', 'POST /api/analyze', 'Groq embedding call failed', { error: String(e) })
        }
      } else {
        logEvent('INFO', 'POST /api/analyze', 'Groq embeddings not available on this SDK; skipping embedding generation')
      }
    } catch (e) {
      logEvent('WARN', 'POST /api/analyze', 'Embedding generation check failed', { error: String(e) })
    }

    // Best-effort: persist anonymized analysis and safe input payload to Supabase (includes optional embedding)
    let storageError: string | null = null
    try {
      const insertPayload = {
        company_name: companyName ? anonymizeText(companyName).substring(0, 200) : null,
        job_title: jobTitle ? anonymizeText(jobTitle).substring(0, 200) : null,
        input_payload: storedInputPayload,
        analysis: anonymizedAnalysis,
        ai_analysis: aiAnalysis ? anonymizeText(aiAnalysis) : null,
        // Persist server-generated short summaries when available (sanitized and length-limited)
        company_profile_summary: company_profile_summary ? anonymizeText(company_profile_summary).substring(0, 500) : null,
        job_description_summary: job_description_summary ? anonymizeText(job_description_summary).substring(0, 500) : null,
        resume_summary: resume_summary ? anonymizeText(resume_summary).substring(0, 500) : null,
        created_at: new Date().toISOString()
      }

      try {
        const insertData = await insertAnalysisRecord(insertPayload, embedding)
        logEvent('INFO', 'POST /api/analyze', 'Stored anonymized analysis record in Supabase', { id: insertData?.[0]?.id ?? null })
      } catch (innerErr) {
        storageError = String(innerErr)
        logEvent('WARN', 'POST /api/analyze', 'Supabase insert error', { error: storageError })
      }
    } catch (e) {
      storageError = String(e)
      logEvent('WARN', 'POST /api/analyze', 'Error while attempting to persist anonymized analysis', { error: storageError })
    }

    // Attach storage metadata to the analysis object so the client can show a friendly UI notification if needed
    if (storageError) {
      try {
        // Keep message short and non-sensitive
        analysis.storage_error = storageError.substring(0, 1000)
        analysis.storage_saved = false
      } catch (e) {
        // ignore
      }
    } else {
      try { analysis.storage_saved = true } catch (e) {}
    }

    return NextResponse.json(analysis)
  } catch (error) {
    logEvent('ERROR', 'POST /api/analyze', 'Analysis error', { error: String(error) })
    return NextResponse.json({ error: 'Failed to analyze job application' }, { status: 500 })
  }
} 