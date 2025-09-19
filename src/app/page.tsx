'use client'

import React, { useState, useEffect, useRef } from 'react'
import { CheckCircle, XCircle, ArrowRight, ArrowLeft, Building2, User, FileText } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { useAppStore } from '../lib/store'
import { formatCompanyType } from '../lib/utils'

interface FormData {
  companyName: string
  jobTitle: string
  companyWebsite: string
  companyProfile: string
  jobDescription: string
  resumeContent: string
  additionalInfo: string
}

interface AnalysisResult {
  overallRisk: 'LOW' | 'MEDIUM' | 'HIGH'
  riskScore: number
  companyType: keyof typeof import('../lib/utils').RISK_METRICS
  shouldApply: boolean
  keyFindings: string[]
  riskFactors: string[]
  recommendations: string[]
  companyAnalysis: {
    reputation: string
    stability: string
    careerProspects: string
    redFlags: string[]
  }
  fitAnalysis: {
    skillMatch: number
    experienceMatch: number
    culturefit: string
    salaryExpectation: string
  }
  aiAnalysis?: string
  // Prefer server-provided short summaries when available
  company_profile_summary?: string
  job_description_summary?: string
  resume_summary?: string
}

const STEPS = [
  { id: 'company', title: 'Company' },
  { id: 'job', title: 'Job' },
  { id: 'you', title: 'You' },
  { id: 'review', title: 'Review' },
]

const HUMOR_HINT = "don't worry — just copy/paste the content, even if it's messy; I'll organize it for you."

export default function HomePage() {
  const [formData, setFormData] = useState<FormData>({
    companyName: '',
    jobTitle: '',
    companyWebsite: '',
    companyProfile: '',
    jobDescription: '',
    resumeContent: '',
    additionalInfo: '',
  })

  const [stepIndex, setStepIndex] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aiOpen, setAiOpen] = useState<boolean>(false)

  // Autosave: load saved form on mount and persist on changes (debounced)
  const saveTimer = useRef<number | null>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem('jobAdvisorForm')
      if (raw) {
        const parsed = JSON.parse(raw)
        setFormData(prev => ({ ...prev, ...parsed }))
      }
    } catch (e) {
      // ignore
    }
  }, [])

  useEffect(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      try { localStorage.setItem('jobAdvisorForm', JSON.stringify(formData)) } catch (e) {}
    }, 500) as unknown as number

    return () => { if (saveTimer.current) window.clearTimeout(saveTimer.current) }
  }, [formData])

  const step = STEPS[stepIndex]

  const updateField = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const renderMarkdown = (text: string) => {
    const raw = marked.parse(text || '')
    const clean = DOMPurify.sanitize(raw)
    return { __html: clean }
  }

  const validateStep = (index: number) => {
    if (STEPS[index].id === 'company') return !!formData.companyName.trim()
    if (STEPS[index].id === 'job') return !!formData.jobTitle.trim()
    return true
  }

  const next = () => {
    if (!validateStep(stepIndex)) return
    setStepIndex(i => Math.min(i + 1, STEPS.length - 1))
  }
  const back = () => setStepIndex(i => Math.max(i - 1, 0))

  // Read API keys from the app store (call without selector to avoid selector typing issues)
  const store = useAppStore()
  const storeGroqKey = store.groqApiKey
  const storeFireKey = store.firecrawlApiKey
  const storeGroqModel = store.groqModel

  const handleSubmit = async () => {
    setIsSubmitting(true)
    setError(null)
    setResult(null)

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-groq-api-key': storeGroqKey || '',
          'x-firecrawl-api-key': storeFireKey || '',
          'x-groq-model': storeGroqModel || ''
        },
        body: JSON.stringify(formData)
      })
      if (!response.ok) {
        const errBody = await response.json().catch(() => null)
        throw new Error(errBody?.error || 'Server error')
      }
      const analysis: AnalysisResult = await response.json()
      setResult(analysis)
      setStepIndex(STEPS.length)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally { setIsSubmitting(false) }
  }

  const renderProgress = () => {
    // Cap progress at 100% — when showing results stepIndex may equal STEPS.length
    const displayIndex = Math.min(stepIndex, STEPS.length - 1)
    const pct = Math.min(100, Math.round(((displayIndex + 1) / STEPS.length) * 100))
    return (
      <div className="w-full mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-medium text-gray-600">Step {Math.min(stepIndex + 1, STEPS.length)}/{STEPS.length}</div>
          <div className="text-sm font-medium text-gray-600">{pct}%</div>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden"><div className="h-2 bg-blue-600 rounded-full" style={{ width: `${pct}%` }} /></div>
      </div>
    )
  }

  interface PasteFieldProps {
    id: string
    label: string
    placeholder?: string
    rows?: number
    value: string
    onChange: (v: string) => void
    onFeedback?: () => void
  }

  const PasteField = ({ id, label, placeholder, rows = 4, value, onChange, onFeedback }: PasteFieldProps) => {
    const wrapperRef = useRef<HTMLDivElement | null>(null)
    const flashTimer = useRef<number | null>(null)
    const [badgeVisible, setBadgeVisible] = useState(false)

    useEffect(() => {
      return () => {
        if (flashTimer.current) window.clearTimeout(flashTimer.current)
      }
    }, [])

    const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      // subtle animation to confirm paste
      try {
        if (wrapperRef.current) {
          wrapperRef.current.classList.add('paste-flash')
          setBadgeVisible(true)
          if (flashTimer.current) window.clearTimeout(flashTimer.current)
          flashTimer.current = window.setTimeout(() => {
            wrapperRef.current?.classList.remove('paste-flash')
            setBadgeVisible(false)
          }, 900) as unknown as number
        }
        // trigger optional feedback callback (sound/vibrate)
        try { onFeedback?.() } catch (e) {}
      } catch (err) {
        // ignore animation failures
      }
      // allow native paste to proceed
    }

    return (
      <label className="block">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-700">{label}</div>
          <div className="paste-hint" aria-hidden>
            <span className="badge">Paste</span>
            <span className="humor">{HUMOR_HINT}</span>
          </div>
        </div>
        <div className="paste-field mt-2" ref={wrapperRef}>
          <textarea
            id={id}
            className="form-textarea"
            rows={rows}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onPaste={handlePaste}
            placeholder={placeholder}
            aria-label={label}
          />
          <span className={`paste-badge ${badgeVisible ? 'visible' : ''}`} aria-hidden>{badgeVisible ? 'Pasted!' : ''}</span>
        </div>
        <div className="form-label">Plain text input — will be structured in the final report.</div>
      </label>
    )
  }

  // Small reusable summary block with truncation and copy support
  const SummaryBlock = ({ title, text, limit = 300 }: { title: string; text?: string; limit?: number }) => {
    const [open, setOpen] = useState<boolean>(false)
    const trimmed = String(text || '').trim()
    const short = trimmed.length > limit ? trimmed.substring(0, limit).trim() + '…' : trimmed

    const copyText = async () => {
      try { await navigator.clipboard.writeText(trimmed) } catch (e) { /* ignore copy errors */ }
    }

    return (
      <div className="mt-4">
        <div className="flex items-start justify-between">
          <div className="font-semibold">{title}</div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={copyText} className="text-xs px-2 py-1 border rounded bg-white text-gray-700">Copy</button>
            {trimmed.length > limit && (<button type="button" onClick={() => setOpen(o => !o)} className="text-xs px-2 py-1 border rounded bg-white text-gray-700">{open ? 'Show less' : 'Show more'}</button>)}
          </div>
        </div>
        <div className="mt-2 text-sm text-gray-600" style={{ fontSize: '0.95rem' }}>{open ? trimmed || '—' : (short || '—')}</div>
      </div>
    )
  }

  const renderCompanyStep = () => (
    <div className="space-y-4">
      <label className="block">
        <div className="text-sm font-semibold text-gray-700">Company name * <span className="sr-only">required</span></div>
        <input id="companyName" className="form-input mt-2" value={formData.companyName} onChange={e => updateField('companyName', e.target.value)} placeholder="e.g., Sopra Steria" aria-label="Company name" aria-required="true" />
      </label>

      <label className="block">
        <div className="text-sm font-semibold text-gray-700">Company website</div>
        <input id="companyWebsite" className="form-input mt-2" value={formData.companyWebsite} onChange={e => updateField('companyWebsite', e.target.value)} placeholder="https://company.com" aria-label="Company website" />
      </label>

      <PasteField id="companyProfile" label="Company profile / description" rows={4} value={formData.companyProfile} onChange={(v: string) => updateField('companyProfile', v)} onFeedback={playFeedback} placeholder="Copy company profile or LinkedIn description..." />
    </div>
  )

  const renderJobStep = () => (
    <div className="space-y-4">
      <label className="block">
        <div className="text-sm font-semibold text-gray-700">Job title * <span className="sr-only">required</span></div>
        <input id="jobTitle" className="form-input mt-2" value={formData.jobTitle} onChange={e => updateField('jobTitle', e.target.value)} placeholder="e.g., Senior Java Developer" aria-label="Job title" aria-required="true" />
      </label>

      <PasteField id="jobDescription" label="Job description" rows={6} value={formData.jobDescription} onChange={(v: string) => updateField('jobDescription', v)} onFeedback={playFeedback} placeholder="Paste full job description..." />
    </div>
  )

  const renderYouStep = () => (
    <div className="space-y-4">
      <PasteField id="resumeContent" label="Resume / CV content" rows={6} value={formData.resumeContent} onChange={(v: string) => updateField('resumeContent', v)} onFeedback={playFeedback} placeholder="Paste your resume text..." />
      <PasteField id="additionalInfo" label="Additional info" rows={3} value={formData.additionalInfo} onChange={(v: string) => updateField('additionalInfo', v)} onFeedback={playFeedback} placeholder="Salary expectation, remote preferences, etc." />
    </div>
  )

  const renderReviewStep = () => (
    <div className="space-y-4">
      <div className="bg-gray-50 border rounded p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs text-gray-500">Company</div>
            <div className="text-sm font-medium text-gray-900">{formData.companyName || '—'}</div>
            <div className="text-xs text-gray-500">{formData.companyWebsite}</div>
          </div>

          <div className="text-right">
            <div className="text-xs text-gray-500">Job</div>
            <div className="text-sm font-medium text-gray-900">{formData.jobTitle || '—'}</div>
          </div>
        </div>

        <div className="mt-3 text-sm text-gray-700">
          <div className="font-semibold">Job description</div>
          <div className="mt-2 text-sm text-gray-600 whitespace-pre-wrap">{formData.jobDescription || '—'}</div>
        </div>

      </div>

      <div className="text-sm text-gray-600">When you submit, our analysis engine will evaluate company type, red flags and provide recommendations based on market research and AI analysis.</div>
    </div>
  )

  const renderStepContent = () => {
    switch (step?.id) {
      case 'company': return renderCompanyStep()
      case 'job': return renderJobStep()
      case 'you': return renderYouStep()
      case 'review': return renderReviewStep()
      default: return null
    }
  }

  const renderResults = () => {
    if (!result) return null
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center gap-3 mb-4">
          <CheckCircle className="w-6 h-6 text-green-600" />
          <h3 className="text-lg font-semibold">Advisory Report</h3>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={() => downloadMarkdown(result)} className="inline-flex items-center gap-2 px-3 py-2 rounded-md border text-sm bg-white text-gray-700 hover:bg-gray-100">Download .md</button>
            <button type="button" onClick={() => downloadPdf(result)} className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700">Download PDF</button>
          </div>
        </div>
        <div className="text-sm text-gray-700 mb-4">Overall Risk: <strong className="ml-2">{result.overallRisk}</strong></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border rounded p-3 bg-gray-50"><div className="text-xs text-gray-500">Risk Score</div><div className="text-xl font-bold">{result.riskScore}/100</div></div>
          <div className="border rounded p-3 bg-gray-50"><div className="text-xs text-gray-500">Company Type</div><div className="text-xl font-bold">{formatCompanyType(result.companyType as keyof typeof import('../lib/utils').RISK_METRICS)}</div></div>
        </div>

        <div className="mt-4"><div className="font-semibold">Recommendations</div><ul className="list-disc pl-5 mt-2 text-sm text-gray-700">{result.recommendations.map((r, i) => <li key={i}>{r}</li>)}</ul></div>

        <div className="mt-6">
          <div className="font-semibold">Key Findings</div>
          <ul className="list-disc pl-5 mt-2 text-sm text-gray-700">
            {result.keyFindings?.map((k, i) => <li key={i}>{k}</li>)}
          </ul>

          <div className="font-semibold mt-4">Company Analysis</div>
          <div className="mt-2 text-sm text-gray-700">
            <div><strong>Reputation:</strong> {result.companyAnalysis?.reputation || '—'}</div>
            <div><strong>Stability:</strong> {result.companyAnalysis?.stability || '—'}</div>
            <div><strong>Career prospects:</strong> {result.companyAnalysis?.careerProspects || '—'}</div>
            {result.companyAnalysis?.redFlags && result.companyAnalysis.redFlags.length > 0 && (
              <div className="mt-2">
                <div className="text-sm font-semibold">Red flags</div>
                <ul className="list-disc pl-5 mt-1 text-sm text-gray-700">{result.companyAnalysis.redFlags.map((f, i) => <li key={i}>{f}</li>)}</ul>
              </div>
            )}
          </div>

          <SummaryBlock title="Company Profile" text={result.company_profile_summary || formData.companyProfile} limit={300} />
          <SummaryBlock title="Job Description" text={result.job_description_summary || formData.jobDescription} limit={300} />
          <SummaryBlock title="Candidate Resume" text={result.resume_summary || formData.resumeContent} limit={300} />

          {result.aiAnalysis && (
            <div className="mt-4">
              <div className="flex items-center justify-between">
                <div className="font-semibold">AI Analysis</div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => { navigator.clipboard?.writeText(result.aiAnalysis || '') }} className="text-xs px-2 py-1 border rounded bg-white text-gray-700">Copy</button>
                  <button type="button" onClick={() => setAiOpen(o => !o)} className="text-xs px-2 py-1 border rounded bg-white text-gray-700">{aiOpen ? 'Collapse' : 'Expand'}</button>
                </div>
              </div>
              {aiOpen ? (
                <div className="mt-2 prose max-w-full" dangerouslySetInnerHTML={renderMarkdown(result.aiAnalysis)} />
              ) : (
                <div className="mt-2 text-sm text-gray-600" style={{ fontSize: '0.95rem' }}>{String(result.aiAnalysis || '').substring(0, 400)}{(result.aiAnalysis || '').length > 400 ? '…' : ''}</div>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  // Feedback (sound + haptic) settings
  const [feedbackEnabled, setFeedbackEnabled] = useState<boolean>(() => {
    try { return localStorage.getItem('feedbackEnabled') === 'true' } catch { return false }
  })

  useEffect(() => { try { localStorage.setItem('feedbackEnabled', feedbackEnabled ? 'true' : 'false') } catch {} }, [feedbackEnabled])

  const playFeedback = () => {
    if (!feedbackEnabled) return
    try {
      // Vibration (if supported)
      try {
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          (navigator as Navigator & { vibrate?: (pattern: number | number[]) => boolean }).vibrate?.(16)
        }
      } catch (e) {
        // ignore
      }

      // Short beep via WebAudio (if supported)
      try {
        if (typeof window === 'undefined') return
        const win = window as Window & { webkitAudioContext?: typeof AudioContext }
        const Ctx = win.AudioContext ?? win.webkitAudioContext
        if (!Ctx) return
        const ctx = new Ctx()
        const o = ctx.createOscillator()
        const g = ctx.createGain()
        o.type = 'sine'
        o.frequency.setValueAtTime(880, ctx.currentTime)
        g.gain.setValueAtTime(0.0001, ctx.currentTime)
        g.gain.exponentialRampToValueAtTime(0.02, ctx.currentTime + 0.01)
        o.connect(g)
        g.connect(ctx.destination)
        o.start()
        setTimeout(() => {
          try {
            g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.02)
            o.stop(ctx.currentTime + 0.03)
            ctx.close()
          } catch (e) {
            // ignore
          }
        }, 120)
      } catch (e) {
        // ignore audiovisual errors
      }
    } catch (e) { /* ignore audiovisual errors */ }
  }

  // Helper: build a readable markdown report from analysis + form data
  const buildMarkdown = (analysis: AnalysisResult, form: FormData) => {
    const lines: string[] = []
    lines.push(`# Advisory Report — ${form.companyName} — ${form.jobTitle}`)
    lines.push('')
    lines.push(`**Overall Risk:** ${analysis.overallRisk}`)
    lines.push(`**Risk Score:** ${analysis.riskScore}/100`)
    lines.push(`**Company Type:** ${analysis.companyType.replace('_', ' ')}`)
    lines.push('')

    lines.push('## Key Findings')
    analysis.keyFindings.forEach(k => lines.push(`- ${k}`))
    lines.push('')

    lines.push('## Risk Factors')
    analysis.riskFactors.forEach(r => lines.push(`- ${r}`))
    lines.push('')

    lines.push('## Recommendations')
    analysis.recommendations.forEach(r => lines.push(`- ${r}`))
    lines.push('')

    // Summaries only — do not duplicate original, reference provided inputs when full content is needed
    lines.push('## Company Profile Summary')
    if (analysis.company_profile_summary && analysis.company_profile_summary.trim().length > 0) {
      lines.push(analysis.company_profile_summary.trim())
    } else {
      lines.push('(See provided company profile)')
    }
    lines.push('')

    lines.push('## Job Description Summary')
    if (analysis.job_description_summary && analysis.job_description_summary.trim().length > 0) {
      lines.push(analysis.job_description_summary.trim())
    } else {
      lines.push('(See provided job description)')
    }
    lines.push('')

    lines.push('## Candidate Resume Summary')
    if (analysis.resume_summary && analysis.resume_summary.trim().length > 0) {
      lines.push(analysis.resume_summary.trim())
    } else {
      lines.push('(See provided resume)')
    }

    if (analysis.aiAnalysis) {
      lines.push('')
      lines.push('## AI Analysis (summary)')
      const aiShort = String(analysis.aiAnalysis || '').substring(0, 800).trim()
      lines.push(aiShort + ((analysis.aiAnalysis || '').length > 800 ? '…' : ''))
    }

    return lines.join('\n')
  }

  // Trigger download of markdown file
  const downloadMarkdown = (analysis: AnalysisResult) => {
    try {
      const md = buildMarkdown(analysis, formData)
      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${(formData.companyName || 'analysis').replace(/[^a-z0-9-_\.]/gi, '_')}-${(formData.jobTitle || 'report').replace(/[^a-z0-9-_\.]/gi, '_')}.md`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) { /* ignore download errors */ }
  }

  // Generate a simple PDF using jsPDF (falls back to plain text rendering)
  const downloadPdf = async (analysis: AnalysisResult) => {
    try {
      const md = buildMarkdown(analysis, formData)
      // dynamic import to avoid top-level type issues when types are not installed
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { jsPDF } = await import('jspdf')
      const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
      pdf.setFontSize(12)
      const marginLeft = 40
      const maxLineWidth = 540
      const lines = pdf.splitTextToSize(md, maxLineWidth)
      const cursorY = 60
      pdf.text(lines, marginLeft, cursorY)
      const filename = `${(formData.companyName || 'analysis').replace(/[^a-z0-9-_\.]/gi, '_')}-${(formData.jobTitle || 'report').replace(/[^a-z0-9-_\.]/gi, '_')}.pdf`
      pdf.save(filename)
    } catch (e) { /* ignore pdf generation errors */ }
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <header className="mb-6">
          <PageHeader
            title="Job Application Advisor"
            subtitle="AI-powered risk assessment & recommendations"
            right={(
              <div className="hidden sm:flex items-center space-x-3 text-sm text-gray-500">
                <div className="flex items-center gap-2"><Building2 className="w-4 h-4 text-gray-400" /><span>Company</span></div>
                <div className="flex items-center gap-2"><FileText className="w-4 h-4 text-gray-400" /><span>Job</span></div>
                <div className="flex items-center gap-2"><User className="w-4 h-4 text-gray-400" /><span>You</span></div>
              </div>
            )}
          />
        </header>

        <main>
          <div className="bg-white border rounded-lg shadow-sm p-4 sm:p-6">
            {renderProgress()}

            <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-semibold text-gray-900">{step?.title}</h2><div className="text-sm text-gray-500">{stepIndex < STEPS.length ? (stepIndex === STEPS.length - 1 ? 'Review & Submit' : `Fill details`) : ''}</div></div>

            <div className="mb-4"><div key={step?.id} className="animate-slide-in">{renderStepContent()}</div></div>

            <div className="flex items-center justify-between">
              <div>
                <button type="button" onClick={back} disabled={stepIndex === 0 || isSubmitting} className="inline-flex items-center gap-2 px-3 py-2 rounded-md border text-sm bg-white text-gray-700 disabled:opacity-50" aria-label="Back"><ArrowLeft className="w-4 h-4" />Back</button>
              </div>

              <div className="flex items-center gap-3">
                {stepIndex < STEPS.length - 1 ? (
                  <button type="button" onClick={next} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700" aria-label="Next">Next<ArrowRight className="w-4 h-4" /></button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className={"inline-flex items-center gap-2 px-4 py-2 rounded-md bg-green-600 text-white text-sm font-medium hover:bg-green-700" + (isSubmitting ? ' cursor-wait opacity-75' : '')}
                    aria-label="Submit and analyze"
                  >
                    {isSubmitting ? (
                      <>
                        <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                        <span>Submitting…</span>
                      </>
                    ) : (
                      <>
                        <span>Submit & Analyze</span>
                        <CheckCircle className="w-4 h-4" />
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {error && (<div className="mt-4 p-3 rounded border bg-red-50 text-red-700 flex items-start gap-2" role="alert"><XCircle className="w-5 h-5" /><div>{error}</div></div>)}

          </div>

          <div className="mt-6">{renderResults()}</div>
        </main>
      </div>
    </div>
  )
}
