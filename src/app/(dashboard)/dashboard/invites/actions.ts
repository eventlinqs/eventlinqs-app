'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isFlagEnabled } from '@/lib/flags'
import {
  createFoundingInvite,
  isFoundingCity,
  INVITES_PER_FOUNDING_ORGANISER,
} from '@/lib/founding/invites'

/**
 * A founding organiser generates a personal invite for a fellow organiser in
 * an open city. Only a founding organisation may issue invites, and only up to
 * its allowance. The invite is not tied to a specific email here (the organiser
 * shares the link personally); the founder's waitlist bridge is the
 * email-targeted path.
 */
export async function generateMyFoundingInvite(citySlug: string): Promise<{ code?: string; error?: string }> {
  if (!(await isFlagEnabled('launch_kit'))) return { error: 'Invites are not open right now.' }
  if (!isFoundingCity(citySlug)) return { error: 'Invites are only open for Geelong and Melbourne.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // The caller must own a FOUNDING organisation.
  //
  // Identity comes from the session client above (getUser, never getSession);
  // the row is then read with the service role scoped to owner_id = that verified
  // user. `is_founding` is revoked from `authenticated` by column privilege
  // (migration 20260808000010), because that role serves both the owner and any
  // logged-in visitor and a grant cannot tell them apart. The ownership filter is
  // what makes the service-role read safe, and it is the pattern
  // src/lib/payouts/auth.ts already uses.
  const { data: org } = await createAdminClient()
    .from('organisations')
    .select('id, name, is_founding')
    .eq('owner_id', user.id)
    .maybeSingle()
  if (!org) return { error: 'Organisation not found.' }
  if (!org.is_founding) {
    return { error: 'Founding invites are available to Founding Organisers. Yours is not one yet.' }
  }

  // Enforce the per-organiser allowance against real issued rows.
  const admin = createAdminClient()
  const { count } = await admin
    .from('founding_invites')
    .select('id', { count: 'exact', head: true })
    .eq('inviter_org_id', org.id)
  if ((count ?? 0) >= INVITES_PER_FOUNDING_ORGANISER) {
    return { error: `You have used all ${INVITES_PER_FOUNDING_ORGANISER} of your founding invites.` }
  }

  const result = await createFoundingInvite({
    inviterKind: 'organiser',
    inviterOrgId: org.id,
    inviterName: org.name,
    citySlug,
    inviteeEmail: null,
  })
  if ('error' in result) return { error: result.error }

  revalidatePath('/dashboard/invites')
  return { code: result.code }
}
