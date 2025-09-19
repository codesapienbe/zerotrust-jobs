'use client'

import React, { useState } from 'react'
import { useAppStore } from '../../lib/store'
import PageHeader from '../../components/PageHeader'

export default function SettingsPage() {
  const store = useAppStore()
  const groqApiKey = store.groqApiKey
  const firecrawlApiKey = store.firecrawlApiKey
  const setGroqApiKey = store.setGroqApiKey
  const groqModel = store.groqModel
  const setGroqModel = store.setGroqModel
  const setFirecrawlApiKey = store.setFirecrawlApiKey
  const resetStore = store.reset

  const [localGroq, setLocalGroq] = useState(groqApiKey)
  const [localModel, setLocalModel] = useState(groqModel)
  const [localFire, setLocalFire] = useState(firecrawlApiKey)
  const [consent, setConsent] = useState(false)
  const expiryMinutes = store.expiryMinutes
  const setExpiryMinutes = store.setExpiryMinutes
  const setExpiryTimestamp = store.setExpiryTimestamp

  const save = () => {
    if (!consent) {
      alert('Please accept cookie consent before saving API keys to local storage.')
      return
    }
    setGroqApiKey(localGroq)
    setGroqModel(localModel)
    setFirecrawlApiKey(localFire)
    // Ensure expiry is set; default to 24 hours if not provided
    const minutes = expiryMinutes || 24 * 60
    setExpiryMinutes(minutes)
    const ts = Date.now() + minutes * 60 * 1000
    setExpiryTimestamp(ts)
    alert('API keys saved to local storage. You can remove them anytime in this settings page. Tokens will expire automatically based on the Auto-expiry setting.')
  }

  return (
    <div className="min-h-screen p-6 bg-gray-50">
      <div className="max-w-3xl mx-auto bg-white border rounded-lg p-6">
        <PageHeader title="Settings" />

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700">GROQ API Key</label>
          <input className="form-input mt-2" value={localGroq} onChange={e => setLocalGroq(e.target.value)} placeholder="Enter your GROQ API key" />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700">GROQ Model (optional)</label>
          <input className="form-input mt-2" value={localModel} onChange={e => setLocalModel(e.target.value)} placeholder="e.g., mixtral-8x7b-32768 or updated model" />
          <div className="text-xs text-gray-500 mt-1">If empty, the app will use the server-side default. Use this to override the Groq model for summarization.</div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700">FIRECRAWL API Key</label>
          <input className="form-input mt-2" value={localFire} onChange={e => setLocalFire(e.target.value)} placeholder="Enter your Firecrawl API key" />
        </div>

        <div className="flex items-center gap-3">
          <button className="btn-primary" onClick={save}>Save keys</button>
          <button className="btn-secondary" onClick={() => { resetStore(); setLocalGroq(''); setLocalFire(''); setLocalModel('') }}>Remove keys</button>
        </div>

        <div className="mt-6 border-t pt-4">
          <h3 className="text-sm font-semibold mb-2">Auto-expiry</h3>
          <div className="flex items-center gap-2">
            <label htmlFor="expiryMinutes" className="sr-only">Expiry minutes</label>
            <input id="expiryMinutes" type="number" min={1} className="form-input w-32" value={expiryMinutes || ''} onChange={e => setExpiryMinutes(e.target.value ? parseInt(e.target.value, 10) : undefined)} placeholder="Minutes" />
            <div className="text-sm text-gray-600">minutes (tokens will auto-remove after this period)</div>
          </div>
          <div className="mt-2 text-sm">
            <button className="btn-secondary" onClick={() => setExpiryTimestamp(undefined)}>Clear expiry</button>
          </div>
        </div>

        <div className="mt-6 p-4 bg-yellow-50 border rounded text-sm text-gray-700">
          <strong>Important:</strong> You can remove the tokens after using the app. We only store tokens in your browser&apos;s localStorage; clearing localStorage or using the &quot;Remove keys&quot; button will delete them.
        </div>

        <div className="mt-4 text-sm text-gray-600">
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /> I consent to storing API keys in localStorage for this session.</label>
        </div>
      </div>
    </div>
  )
} 