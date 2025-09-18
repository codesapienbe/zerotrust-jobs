'use client'

import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useAppStore } from '../lib/store'
import ExpiryCountdown from './ExpiryCountdown'
import Logo from './Logo'
import ThemeToggle from './ThemeToggle'

export default function ClientHeader() {
  const store = useAppStore()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (!menuRef.current) return
      if (!(e.target instanceof Node)) return
      if (!menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    if (menuOpen) {
      document.addEventListener('mousedown', handleOutside)
    }
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [menuOpen])

  return (
    <header className="bg-white shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row justify-between items-center py-4 gap-3 sm:gap-0">
          <div className="flex items-center w-full sm:w-auto justify-between sm:justify-start">
            <Link href="/" aria-label="Home">
              <Logo className="w-28 sm:w-40 h-auto" />
            </Link>

            {/* Mobile hamburger - visible only on very small screens */}
            <button
              type="button"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              onClick={() => setMenuOpen(prev => !prev)}
              className="sm:hidden inline-flex items-center justify-center p-2 rounded-md text-gray-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500"
            >
              {/* Icon: hamburger / X */}
              {!menuOpen ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path d="M6 6l12 12M6 18L18 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-3 sm:gap-4 flex-wrap">
            <div className="text-sm text-gray-500">AI-Powered Risk Assessment</div>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="accent-teal-500"
                checked={store.feedbackEnabled}
                onChange={(e) => store.setFeedbackEnabled(e.target.checked)}
                aria-label="Enable paste feedback"
              />
              <span className="text-xs text-gray-500">Feedback</span>
            </label>
            {/* Live expiry countdown */}
            <ExpiryCountdown />
            {/* Theme toggle */}
            <ThemeToggle />
            <Link href="/settings" aria-label="Settings">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M12 15.5A3.5 3.5 0 1112 8.5a3.5 3.5 0 010 7z" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06c.5.4 1.12.47 1.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09c.2.66.7 1.18 1.51 1z" stroke="currentColor" strokeWidth="1.2" fill="none"/>
              </svg>
            </Link>
          </div>

          {/* Mobile menu dropdown */}
          {menuOpen && (
            <div ref={menuRef} className="sm:hidden absolute right-4 top-full mt-2 w-64 bg-white border rounded shadow-lg z-50 p-4">
              <div className="flex flex-col gap-3">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="accent-teal-500"
                    checked={store.feedbackEnabled}
                    onChange={(e) => { store.setFeedbackEnabled(e.target.checked); setMenuOpen(false) }}
                    aria-label="Enable paste feedback"
                  />
                  <span className="text-sm text-gray-700">Feedback</span>
                </label>

                <div>
                  <div className="text-sm text-gray-700">Theme</div>
                  <div className="mt-2"><ThemeToggle /></div>
                </div>

                <div>
                  <div className="text-sm text-gray-700">Session</div>
                  <div className="mt-2"><ExpiryCountdown /></div>
                </div>

                <Link href="/settings">
                  <button onClick={() => setMenuOpen(false)} className="w-full text-left text-sm text-blue-600">Settings</button>
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
} 