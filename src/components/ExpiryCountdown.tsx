'use client'

import React, { useEffect, useState } from 'react'
import { useAppStore } from '../lib/store'

function formatRemaining(ms: number) {
  if (ms <= 0) return 'Expired'
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${sec}s`
  return `${sec}s`
}

export default function ExpiryCountdown() {
  const store = useAppStore()
  const expiry = store.expiryTimestamp
  const expiryMinutes = store.expiryMinutes
  const setExpiryTimestamp = store.setExpiryTimestamp
  const setExpiryMinutes = store.setExpiryMinutes

  const [remaining, setRemaining] = useState<number | null>(null)

  useEffect(() => {
    if (!expiry) {
      setRemaining(null)
      return
    }

    const update = () => setRemaining((expiry ?? 0) - Date.now())
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [expiry])

  if (!expiry) return null

  const totalMs = ((expiryMinutes ?? 24 * 60) as number) * 60 * 1000
  const rem = Math.max(0, (remaining ?? 0))
  const fraction = Math.min(1, rem / totalMs)
  let color = 'bg-green-500'
  if (fraction <= 0.2) color = 'bg-red-500'
  else if (fraction <= 0.5) color = 'bg-yellow-500'

  const extendByMinutes = 15
  const handleExtend = () => {
    const base = expiry ?? Date.now()
    const newTs = base + extendByMinutes * 60 * 1000
    setExpiryTimestamp(newTs)
    if (!expiryMinutes) setExpiryMinutes(24 * 60)
  }

  return (
    <div suppressHydrationWarning={true} className="flex items-center gap-3">
      <div className="w-40">
        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
          <div className={`h-2 ${color}`} style={{ width: `${Math.round(fraction * 100)}%` }} />
        </div>
        <div className="text-xs text-gray-500 mt-1">Expires in: <strong className="ml-1">{remaining !== null ? formatRemaining(remaining) : '—'}</strong></div>
      </div>
      <button type="button" onClick={handleExtend} className="text-xs px-2 py-1 border rounded bg-white hover:bg-gray-50" aria-label={`Extend expiry by ${extendByMinutes} minutes`}>Extend 15m</button>
    </div>
  )
} 