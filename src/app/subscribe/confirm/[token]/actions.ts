'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { confirmCityGuide } from '@/lib/newsletter/confirm'

/**
 * The Confirm press on /subscribe/confirm/[token] (Release 2, item 8: double opt in). A deliberate button press, never a
 * side effect of opening the page, so an email scanner that follows the link confirms no one. Public by design: the
 * sealed link is the only key (AES-256-GCM, src/lib/newsletter/confirm-token.ts), each link can write one consent once,
 * and a link that is altered, expired or already confirmed writes nothing.
 */
export async function confirmCityGuideAction(token: string): Promise<void> {
  await confirmCityGuide(createAdminClient(), token, Date.now())
  revalidatePath(`/subscribe/confirm/${token}`)
}
