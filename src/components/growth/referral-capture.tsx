'use client'

import { useEffect } from 'react'
import {
  REF_PARAM,
  SOURCE_PARAM,
  REF_COOKIE,
  REF_SOURCE_COOKIE,
  REF_EVENT_COOKIE,
  REF_COOKIE_MAX_AGE_SECONDS,
  isReferralSource,
  type ReferralSource,
} from '@/lib/growth/referrals'

/**
 * First-touch attribution capture for the acquisition loop.
 *
 * Renders nothing and runs only in a post-paint effect, so it never touches the
 * LCP path. When a visitor arrives on any link carrying `?ref=` (a shared
 * ticket) or `?via=` (an invite-an-organiser prompt), it writes first-touch
 * cookies that the signup flow later persists onto the new profile. First touch
 * wins: if attribution is already recorded, a later link never overwrites it, so
 * the first thing that brought a user is the one credited.
 */
export function ReferralCapture() {
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const ref = params.get(REF_PARAM)
      const via = params.get(SOURCE_PARAM)
      if (!ref && !via) return

      // First touch wins: never overwrite an existing attribution.
      if (document.cookie.split('; ').some((c) => c.startsWith(`${REF_SOURCE_COOKIE}=`))) {
        return
      }

      const source: ReferralSource | null = isReferralSource(via)
        ? via
        : ref
          ? 'share-a-ticket'
          : null
      if (!source) return

      const eventSlug = (() => {
        const m = window.location.pathname.match(/^\/events\/([^/]+)/)
        return m ? m[1] : null
      })()

      const set = (name: string, value: string) => {
        document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${REF_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`
      }

      if (ref) set(REF_COOKIE, ref)
      set(REF_SOURCE_COOKIE, source)
      if (eventSlug) set(REF_EVENT_COOKIE, eventSlug)
    } catch {
      // Attribution is best-effort: a parse or cookie failure must never break
      // the page for a real visitor.
    }
  }, [])

  return null
}
