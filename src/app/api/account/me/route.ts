import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { deriveAccountUser } from '@/components/layout/site-header-account-button'
import { isAdminUserId } from '@/lib/admin/auth'
import { captureException } from '@/lib/observability/sentry'

/**
 * GET /api/account/me: who is signed in, for the header of a page that is cached for everyone (WINDOW 5C's 11:57 and the
 * PM's 12:28 of 21 November 2026, item 4: a signed in buyer saw 'Sign in' on the home page, /events and event pages and
 * could not reach My tickets there). Those pages render the anonymous header on purpose (site-header.tsx: a per-user
 * header must never be cached and replayed to another visitor), so the header asks here, after it has painted, and only
 * when the browser holds a session cookie. Private and never cached: it answers for the caller's own session only, and
 * names nothing but the caller's display name, address and whether the admin entry is theirs.
 */
export const dynamic = 'force-dynamic'

const PRIVATE = { 'Cache-Control': 'private, no-store, max-age=0' }

export async function GET() {
  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    if (!data.user) return NextResponse.json({ signedIn: false }, { headers: PRIVATE })
    const user = deriveAccountUser({ email: data.user.email, user_metadata: data.user.user_metadata })
    const isAdmin = await isAdminUserId(data.user.id)
    return NextResponse.json({ signedIn: true, user, email: data.user.email ?? null, isAdmin }, { headers: PRIVATE })
  } catch (error) {
    captureException(error, { where: 'app/api/account/me' })
    // A failed read is the anonymous header, never an error on the page (the header's own rule, site-header.tsx).
    return NextResponse.json({ signedIn: false }, { headers: PRIVATE })
  }
}
