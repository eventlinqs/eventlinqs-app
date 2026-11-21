'use client'

import { useEffect, useState } from 'react'
import type { AccountUser } from './site-header-account-button'
import { reportClientError } from '@/lib/observability/client-error-report'

/**
 * THE SIGNED IN HEADER ON A PAGE CACHED FOR EVERYONE (WINDOW 5C's 11:57 and the PM's 12:28 of 21 November 2026, item 4).
 * The home page, /events and event pages are cached and render the anonymous header on purpose (site-header.tsx). After
 * the header has painted, a browser that holds a Supabase session cookie asks /api/account/me (private, never cached)
 * who is signed in, and the header swaps Sign in for the account menu. A browser with no session cookie asks nothing,
 * so an anonymous visitor costs no request and the first paint is unchanged.
 */

export type HeaderAccount = { readonly user: AccountUser | null; readonly email: string | null; readonly isAdmin: boolean }

/** A Supabase auth cookie in this browser: sb-<project>-auth-token, or one of its numbered chunks. */
export function holdsSessionCookie(cookie: string): boolean {
  return cookie.split(';').some((c) => /^\s*sb-[^=]+-auth-token(\.\d+)?=/.test(c))
}

export function useSignedInAccount(user: AccountUser | null, email: string | null, isAdmin: boolean): HeaderAccount {
  const [account, setAccount] = useState<HeaderAccount>({ user, email, isAdmin })
  useEffect(() => {
    if (user !== null) return
    if (typeof document === 'undefined' || !holdsSessionCookie(document.cookie)) return
    let live = true
    fetch('/api/account/me', { cache: 'no-store', credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { signedIn?: boolean; user?: AccountUser; email?: string | null; isAdmin?: boolean } | null) => {
        if (live && d?.signedIn === true && d.user) setAccount({ user: d.user, email: d.email ?? null, isAdmin: d.isAdmin === true })
      })
      .catch((error: unknown) => reportClientError(error, { where: 'components/layout/use-signed-in-account' }))
    return () => {
      live = false
    }
  }, [user])
  return account
}
