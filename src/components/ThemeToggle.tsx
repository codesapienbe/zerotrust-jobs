"use client"

import React, { useEffect, useState } from 'react'

const STORAGE_KEY = 'color-scheme-preference'
export type ColorSchemePreference = 'system' | 'light' | 'dark'

function applyColorScheme(pref: ColorSchemePreference) {
  try {
    if (pref === 'system') {
      const prefersDark = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      document.documentElement.setAttribute('data-color-scheme', prefersDark ? 'dark' : 'light')
    } else {
      document.documentElement.setAttribute('data-color-scheme', pref)
    }
  } catch {
    // noop
  }
}

export default function ThemeToggle() {
  const [preference, setPreference] = useState<ColorSchemePreference>('system')

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as ColorSchemePreference | null
      const initial = saved || 'system'
      setPreference(initial)
      applyColorScheme(initial)

      // Listen for OS changes when in `system` mode
      const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null
      const handleChange = (ev: MediaQueryListEvent) => {
        if (localStorage.getItem(STORAGE_KEY) === 'system') {
          applyColorScheme('system')
        }
      }

      // Modern browsers expose addEventListener on MediaQueryList; older browsers provide addListener/removeListener.
      if (mq) {
        if (typeof mq.addEventListener === 'function') {
          mq.addEventListener('change', handleChange)
        } else {
          // typed fallback without using `any`
          const legacyMq = mq as MediaQueryList & { addListener?: (fn: (ev: MediaQueryListEvent) => void) => void; removeListener?: (fn: (ev: MediaQueryListEvent) => void) => void }
          legacyMq.addListener?.(handleChange)
        }
      }

      return () => {
        if (!mq) return
        if (typeof mq.removeEventListener === 'function') {
          mq.removeEventListener('change', handleChange)
        } else {
          const legacyMq = mq as MediaQueryList & { addListener?: (fn: (ev: MediaQueryListEvent) => void) => void; removeListener?: (fn: (ev: MediaQueryListEvent) => void) => void }
          legacyMq.removeListener?.(handleChange)
        }
      }
    } catch {
      // ignore
    }
  }, [])

  function cyclePreference() {
    const next: ColorSchemePreference = preference === 'system' ? 'dark' : preference === 'dark' ? 'light' : 'system'
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // ignore
    }
    setPreference(next)
    applyColorScheme(next)
  }

  const ariaLabel = preference === 'system' ? 'Theme: System (click to cycle)' : preference === 'dark' ? 'Theme: Dark (click to cycle)' : 'Theme: Light (click to cycle)'

  const Icon = () => {
    if (preference === 'system') {
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <rect x="3" y="5" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/>
          <circle cx="8" cy="11" r="1" fill="currentColor" />
        </svg>
      )
    }
    if (preference === 'dark') {
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
      )
    }
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
        <g stroke="currentColor" strokeWidth="1.5">
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </g>
      </svg>
    )
  }

  return (
    <button
      aria-label={ariaLabel}
      title={ariaLabel}
      onClick={cyclePreference}
      className="btn-primary"
      style={{ padding: '6px 10px', fontSize: '0.875rem', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 8 }}
    >
      <Icon />
      <span className="sr-only">{ariaLabel}</span>
    </button>
  )
} 