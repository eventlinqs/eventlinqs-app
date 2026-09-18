import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * WHO THE ORGANISER IS, AS AN ADDRESS. Close-out MONEY FIX, part B.
 *
 * One resolver, shared by every organiser-facing sender, because the failure
 * this item exists to end is an organiser not being told, and two resolvers
 * would eventually disagree about who that organiser is. `src/lib/payouts/email.ts`
 * has carried its own private copy since the payout notices were built; it is
 * left alone deliberately (it is a proven path on a money message and this item
 * does not need to touch it), and this note records that the duplication is
 * known rather than missed.
 *
 * OWNER, NOT "the organisation email". `organisations.email` is a public-facing
 * contact address that may be a shared inbox nobody reads. The owner's profile
 * email is the account that can actually act on a payout problem, and it is
 * what the payout notices already use, so the two agree.
 */
export interface OrganiserRecipient {
  email: string
  organisationName: string
  organisationId: string
}

export async function resolveOrganisationOwnerEmail(
  admin: SupabaseClient,
  organisationId: string,
): Promise<OrganiserRecipient | null> {
  const { data: org, error } = await admin
    .from('organisations')
    .select('id, name, owner_id')
    .eq('id', organisationId)
    .maybeSingle()
  if (error || !org?.owner_id) return null

  const { data: profile } = await admin
    .from('profiles')
    .select('email')
    .eq('id', org.owner_id as string)
    .maybeSingle()

  const email = (profile?.email as string | null) ?? null
  if (!email) return null

  return {
    email,
    organisationName: (org.name as string) ?? 'your organisation',
    organisationId: org.id as string,
  }
}
