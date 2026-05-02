'use client'

// global-error.tsx renders when the root layout itself throws. It MUST
// be entirely self-contained: it replaces the html/body, cannot rely on
// the app's layout, and cannot import anything that depends on layout-
// only context (theme providers, auth context, etc.). Inline styles
// only, brand-aligned palette per docs/DESIGN-SYSTEM.md.

import { useEffect } from 'react'
import { captureException } from '@/lib/observability/sentry'

interface GlobalErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    captureException(error, {
      tags: { boundary: 'app-router-global-error' },
      digest: error.digest,
    })
  }, [error])

  return (
    <html lang="en-AU">
      <body
        style={{
          margin: 0,
          padding: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#FAFAFA',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          color: '#1A1A2E',
        }}
      >
        <main
          style={{
            maxWidth: 560,
            padding: '32px 24px',
            textAlign: 'center',
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 14,
              fontWeight: 600,
              letterSpacing: '0.04em',
              color: '#6B7280',
              textTransform: 'uppercase',
            }}
          >
            EVENTLINQS
          </p>
          <h1
            style={{
              margin: '16px 0 12px',
              fontSize: 28,
              lineHeight: 1.2,
              fontWeight: 600,
            }}
          >
            Something broke at the root
          </h1>
          <p
            style={{
              margin: '0 0 24px',
              fontSize: 16,
              lineHeight: 1.55,
              color: '#1A1A2E',
            }}
          >
            We logged the error and our team has been notified. You can try
            reloading, or come back in a few minutes.
            {error.digest ? ` Reference: ${error.digest}.` : ''}
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              display: 'inline-block',
              padding: '14px 28px',
              backgroundColor: '#1A1A2E',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: 8,
              fontSize: 16,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  )
}
