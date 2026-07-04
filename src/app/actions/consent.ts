'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { withdrawOrganiserConsentByToken } from '@/lib/consent/record'

/**
 * Withdraw organiser marketing consent via the per-row unsubscribe token. No
 * login required (Spam Act: unsubscribe must not demand an account). Scoped to
 * the one organiser, so EventLinqs platform updates are untouched. Idempotent.
 */
export async function unsubscribeFromOrganiserAction(token: string): Promise<void> {
  const admin = createAdminClient()
  await withdrawOrganiserConsentByToken(admin, token, new Date().toISOString())
  revalidatePath(`/unsubscribe/${token}`)
}
