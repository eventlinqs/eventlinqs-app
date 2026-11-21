import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { emailCheckedMetadata } from '@/lib/auth/email-check'
import { NextResponse } from 'next/server'
import { type EmailOtpType } from '@supabase/supabase-js'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const role = searchParams.get('role')
  const next = searchParams.get('next') ?? '/dashboard'

  if (token_hash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash })
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser()
      // A press on a link we emailed proves the inbox: the one email check, kept for payout set up (law 50 (b),
      // src/lib/auth/email-check.ts). Best effort: a failed write only means payouts ask again.
      if (user && !(user.app_metadata as Record<string, unknown> | undefined)?.email_checked_at) {
        try {
          await createAdminClient().auth.admin.updateUserById(user.id, { app_metadata: emailCheckedMetadata() })
        } catch {
          // payouts will ask for the check again
        }
      }
      if (role === 'organiser' && user) {
        await supabase.from('profiles').update({ role: 'organiser' }).eq('id', user.id)
      }
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=verification_failed`)
}
