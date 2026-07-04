import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { encodeRefCode } from '@/lib/growth/referrals'

export const dynamic = 'force-dynamic'

/**
 * Returns the current user's opaque referral code, or null for a guest. Used by
 * client share controls on otherwise-static pages (the event detail page) so a
 * logged-in sharer gets a personalised, attributed link without forcing the page
 * itself to read the session server-side (which would disqualify it from ISR and
 * cost LCP).
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const refCode = user ? encodeRefCode(user.id) : null
    return NextResponse.json(
      { refCode },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  } catch {
    return NextResponse.json({ refCode: null }, { headers: { 'Cache-Control': 'no-store' } })
  }
}
