import './globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import ClientHeader from '@/components/ClientHeader'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Job Application Advisor',
  description: 'AI-powered job application risk assessment and advisory tool',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Inline script to set initial color-scheme based on stored preference or OS preference to avoid flash
  const themeScript = `(() => {
    try {
      const STORAGE_KEY = 'color-scheme-preference'
      const saved = (function(){ try { return localStorage.getItem(STORAGE_KEY) } catch { return null } })()
      const apply = (pref) => {
        try {
          if (pref === 'system') {
            const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
            document.documentElement.setAttribute('data-color-scheme', prefersDark ? 'dark' : 'light')
          } else {
            document.documentElement.setAttribute('data-color-scheme', pref)
          }
        } catch (e) { }
      }
      if (saved === 'dark' || saved === 'light') {
        apply(saved)
      } else {
        apply('system')
      }
      // Listen for OS changes when no explicit user preference is set
      try {
        const mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)')
        const handler = () => {
          try {
            const current = (function(){ try { return localStorage.getItem(STORAGE_KEY) } catch { return null } })()
            if (!current || current === 'system') apply('system')
          } catch (e) {}
        }
        if (mq && mq.addEventListener) mq.addEventListener('change', handler)
        else if (mq && mq.addListener) mq.addListener(handler)
      } catch (e) {}
    } catch (e) { /* noop */ }
  })()`

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        {/* Run early to apply theme before hydration */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <a href="#main-content" className="sr-only skip-link">Skip to main content</a>
        <ClientHeader />
        <main id="main-content" className="min-h-screen" style={{ backgroundColor: 'var(--color-background)' }} role="main">
          {children}
        </main>
        <footer style={{ backgroundColor: 'var(--color-surface)', borderTop: '1px solid var(--color-border)' }}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <p style={{ textAlign: 'center', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>Built with research data from 178+ job applications • Powered by Groq & Firecrawl</p>
          </div>
        </footer>
      </body>
    </html>
  )
}
