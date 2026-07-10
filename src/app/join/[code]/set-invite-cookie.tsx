'use client'

import { useEffect } from 'react'
import { FOUNDING_INVITE_COOKIE } from './cookie'

/**
 * Drops the founding-invite cookie client-side on mount, so signup can
 * attribute the founding conversion. A first-party, non-httpOnly cookie set
 * from the browser: cookies cannot be mutated during a server-component
 * render in the App Router, and this is the invite landing (not a Server
 * Action or Route Handler), so the write must happen here.
 */
export function SetInviteCookie({ code }: { code: string }) {
  useEffect(() => {
    if (!/^[A-Z0-9]{6,16}$/.test(code)) return
    const maxAge = 60 * 60 * 24 * 14
    document.cookie = `${FOUNDING_INVITE_COOKIE}=${code}; path=/; max-age=${maxAge}; SameSite=Lax`
  }, [code])
  return null
}
