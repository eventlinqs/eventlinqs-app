'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { authMessage, readAuthErrorFromUrl } from '@/lib/auth/auth-errors'

/**
 * THE fragment-aware auth error boundary.
 *
 * GoTrue reports a refused, expired or already-used link by redirecting to our
 * page with the failure in the URL FRAGMENT:
 *
 *   /auth/reset-password#error=access_denied&error_code=otp_expired
 *                        &error_description=Email+link+is+invalid+or+has+expired
 *
 * Reproduced against production on 2026-08-02 with an invalid token, no email
 * sent and nothing written. A fragment is never transmitted to the server, so
 * neither a route handler nor a server component can see it. Before this
 * component, `/auth/reset-password` therefore sat on "Validating your reset
 * link" indefinitely, and `/login` showed a generic message that discarded the
 * reason.
 *
 * Mounted on every page a provider can redirect back to. Reads the query string
 * AND the fragment, renders a copy-deck sentence, and strips the error out of
 * the address bar so a refresh cannot resurrect a stale alarm.
 *
 * WHY THE SHAPE IS ODD. The failure lives in `window.location`, which does not
 * exist during server rendering, and the banner must not appear during
 * hydration or React reports a mismatch. So:
 *
 *   - the URL is read ONCE, in a lazy useState initialiser, and latched. It is
 *     never re-read, because the effect below rewrites the URL and a re-read
 *     would immediately erase the message it just produced.
 *   - `isClient` is the canonical useSyncExternalStore client-only gate: false
 *     on the server and through hydration, true afterwards.
 *
 * Both avoid calling setState inside an effect, which cascades renders.
 *
 * Renders nothing when there is no error, so it costs no layout on the happy
 * path. Styling is copied verbatim from the sibling error banner in the login
 * and signup forms so the two are indistinguishable.
 */

const subscribeToNothing = () => () => {}

export function AuthErrorFromUrl() {
  const isClient = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  )

  const [detected] = useState(() => {
    if (typeof window === 'undefined') return null
    return readAuthErrorFromUrl({
      search: window.location.search,
      hash: window.location.hash,
    })
  })

  useEffect(() => {
    if (!detected) return

    // `error_description` is provider-authored text. It is deliberately never
    // rendered, being exactly the raw-provider-string class this work removes,
    // but it is worth having in the console when diagnosing a live report.
    if (detected.description) {
      console.info('[auth] provider error description:', detected.description)
    }

    // Clear the fragment and the OAuth error params so a refresh or a shared
    // URL does not replay the failure. replaceState keeps history clean and
    // triggers no navigation.
    const url = new URL(window.location.href)
    for (const key of ['error', 'error_code', 'error_description']) {
      url.searchParams.delete(key)
    }
    url.hash = ''
    window.history.replaceState({}, '', url.toString())
  }, [detected])

  if (!isClient || !detected) return null

  return (
    <div className="rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-sm text-error-strong" role="alert">
      {authMessage(detected.failure)}
    </div>
  )
}
