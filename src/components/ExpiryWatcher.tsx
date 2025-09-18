'use client'

import { useEffect } from 'react'
import { useAppStore } from '../lib/store'

export default function ExpiryWatcher() {
  const store = useAppStore()
  const reset = store.reset

  useEffect(() => {
    const check = () => {
      try {
        const ts = store.expiryTimestamp
        if (ts && ts < Date.now()) {
          reset()
          console.info('Stored API keys expired and were cleared by ExpiryWatcher')
        }
      } catch (e) {
        // ignore
      }
    }

    // initial check and then poll every 30s
    check()
    const id = setInterval(check, 30_000)
    return () => clearInterval(id)
  }, [reset])

  return null
} 