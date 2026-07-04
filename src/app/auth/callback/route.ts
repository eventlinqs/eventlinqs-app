import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { readAttributionCookies, toAttributionRecord } from '@/lib/growth/referrals'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const role = searchParams.get('role')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        if (role === 'organiser') {
          await supabase.from('profiles').update({ role: 'organiser' }).eq('id', user.id)
        }
        // OAuth signups never pass through /api/auth/signup, so capture the
        // first-touch attribution here. Only stamp a brand-new profile that has
        // none yet, so a returning user signing in again is never overwritten.
        try {
          const jar = await cookies()
          const captured = readAttributionCookies((name) => jar.get(name)?.value)
          if (captured) {
            const { data: existing } = await supabase
              .from('profiles')
              .select('metadata')
              .eq('id', user.id)
              .single()
            const prior = (existing?.metadata ?? {}) as Record<string, unknown>
            if (!('attribution' in prior)) {
              await supabase
                .from('profiles')
                .update({
                  metadata: {
                    ...prior,
                    attribution: toAttributionRecord(captured, new Date().toISOString()),
                  },
                })
                .eq('id', user.id)
            }
          }
        } catch {
          // attribution is best-effort, never block sign-in
        }
      }
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
