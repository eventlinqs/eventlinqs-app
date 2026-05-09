'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { trackEventServer } from '@/lib/analytics/plausible'

/**
 * Sign out the current Supabase user and redirect to /.
 *
 * Called from the avatar dropdown's "Sign out" menu item (Batch 9.2.1).
 * Fire-and-forget Plausible event captures the conversion server-side
 * (bypasses ad blockers).
 *
 * The redirect terminates this server action via Next's `redirect()`
 * helper, so the client form action that invokes this never sees the
 * post-call response.
 */
export async function signOut(): Promise<never> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://eventlinqs.com'
  void trackEventServer('account_sign_out', `${siteUrl}/`)
  revalidatePath('/', 'layout')
  redirect('/')
}
