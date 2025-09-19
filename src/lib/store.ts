import create from 'zustand'

export type AppStore = {
  groqApiKey: string
  groqModel: string
  firecrawlApiKey: string
  feedbackEnabled: boolean
  encryptedBlob?: string
  encryptionEnabled: boolean
  expiryMinutes?: number
  expiryTimestamp?: number
  setGroqApiKey: (k: string) => void
  setGroqModel: (m: string) => void
  setFirecrawlApiKey: (k: string) => void
  setFeedbackEnabled: (v: boolean) => void
  setEncryptedBlob: (b?: string) => void
  setEncryptionEnabled: (v: boolean) => void
  setExpiryMinutes: (m?: number) => void
  setExpiryTimestamp: (ts?: number) => void
  reset: () => void
}

const STORAGE_KEY = 'job-advisor-store'

function loadFromStorage(): Partial<AppStore> | null {
  try {
    if (typeof window === 'undefined') return null
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    // If expiryTimestamp present and in the past, remove stored data
    if (parsed?.expiryTimestamp && typeof parsed.expiryTimestamp === 'number') {
      if (parsed.expiryTimestamp < Date.now()) {
        try { window.localStorage.removeItem(STORAGE_KEY) } catch (e) {}
        return null
      }
    }
    return parsed
  } catch (e) {
    return null
  }
}

function saveToStorage(state: Partial<AppStore>) {
  try {
    if (typeof window === 'undefined') return
    const payload = JSON.stringify({
      groqApiKey: state.groqApiKey || '',
      groqModel: state.groqModel || '',
      firecrawlApiKey: state.firecrawlApiKey || '',
      feedbackEnabled: !!state.feedbackEnabled,
      encryptedBlob: state.encryptedBlob || undefined,
      encryptionEnabled: !!state.encryptionEnabled,
      expiryMinutes: state.expiryMinutes,
      expiryTimestamp: state.expiryTimestamp,
    })
    window.localStorage.setItem(STORAGE_KEY, payload)
  } catch (e) {
    // ignore storage errors
  }
}

const persisted = loadFromStorage() || {}

export const useAppStore = create<AppStore>((set, get) => ({
  groqApiKey: (persisted.groqApiKey as string) || '',
  groqModel: (persisted.groqModel as string) || '',
  firecrawlApiKey: (persisted.firecrawlApiKey as string) || '',
  feedbackEnabled: (persisted.feedbackEnabled as boolean) || false,
  encryptedBlob: (persisted.encryptedBlob as string) || undefined,
  encryptionEnabled: (persisted.encryptionEnabled as boolean) || false,
  expiryMinutes: (persisted.expiryMinutes as number) || undefined,
  expiryTimestamp: (persisted.expiryTimestamp as number) || undefined,

  setGroqApiKey: (k: string) => {
    set(() => ({ groqApiKey: k }))
    saveToStorage({ ...get(), groqApiKey: k })
  },

  setGroqModel: (m: string) => {
    set(() => ({ groqModel: m }))
    saveToStorage({ ...get(), groqModel: m })
  },

  setFirecrawlApiKey: (k: string) => {
    set(() => ({ firecrawlApiKey: k }))
    saveToStorage({ ...get(), firecrawlApiKey: k })
  },

  setFeedbackEnabled: (v: boolean) => {
    set(() => ({ feedbackEnabled: v }))
    saveToStorage({ ...get(), feedbackEnabled: v })
  },

  setEncryptedBlob: (b?: string) => {
    set(() => ({ encryptedBlob: b }))
    saveToStorage({ ...get(), encryptedBlob: b })
  },

  setEncryptionEnabled: (v: boolean) => {
    set(() => ({ encryptionEnabled: v }))
    saveToStorage({ ...get(), encryptionEnabled: v })
  },

  setExpiryMinutes: (m?: number) => {
    const ts = m ? Date.now() + m * 60 * 1000 : undefined
    set(() => ({ expiryMinutes: m, expiryTimestamp: ts }))
    saveToStorage({ ...get(), expiryMinutes: m, expiryTimestamp: ts })
  },

  setExpiryTimestamp: (ts?: number) => {
    set(() => ({ expiryTimestamp: ts }))
    saveToStorage({ ...get(), expiryTimestamp: ts })
  },

  reset: () => {
    set(() => ({ groqApiKey: '', firecrawlApiKey: '', feedbackEnabled: false, encryptedBlob: undefined, encryptionEnabled: false, expiryMinutes: undefined, expiryTimestamp: undefined }))
    try { if (typeof window !== 'undefined') window.localStorage.removeItem(STORAGE_KEY) } catch (e) {}
  }
}))

// Persistence is handled by individual setters; no global subscribe required
// Typed selector helpers for consumers to avoid implicit `any` on selector params
export const selectReset = (state: AppStore) => state.reset 