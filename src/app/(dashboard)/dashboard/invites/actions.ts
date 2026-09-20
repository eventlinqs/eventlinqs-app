'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { readOrThrow } from '@/lib/supabase/read-or-throw'
import { countOrRaise } from '@/lib/supabase/count-or-raise'
import { resolveOrganisationScope } from '@/lib/organisations/scope'
import { isFlagEnabled } from '@/lib/flags'
import {
  createFoundingInvite,
  isFoundingCity,
  INVITES_PER_FOUNDING_ORGANISER,
} from '@/lib/founding/invites'

/**
 * A founding organiser generates a personal invite for a fellow organiser in
 * ANY Australian city. Only a founding organisation may issue invites, and
 * only up to its allowance. The invite is not tied to a specific email here
 * (the organiser shares the link personally); the founder's admin bridge is
 * the email-targeted path.
 *
 * The city is validated, never restricted: the platform is open nationwide
 * from day one, so the only wrong answer is a slug that is not an Australian
 * city at all.
 */
export async function generateMyFoundingInvite(citySlug: string): Promise<{ code?: string; error?: string }> {
  if (!(await isFlagEnabled('launch_kit'))) return { error: 'Invites are not open right now.' }
  if (!isFoundingCity(citySlug)) return { error: 'Choose an Australian city for this invite.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // The caller's ACTIVE business must be a FOUNDING organisation.
  //
  // This was `.eq('owner_id', user.id).maybeSingle()`, which returns PGRST116 and
  // `data: null` when the caller owns more than one, so an owner of several was
  // told "Organisation not found" and could never issue a founding invite. The
  // allowance is counted per `inviter_org_id`, so the business has to be named
  // rather than guessed, and it is the same business the invites page is showing.
  //
  // Identity comes from the session client above (getUser, never getSession); the
  // row is then read with the service role scoped to owner_id = that verified user.
  // `is_founding` is revoked from `authenticated` by column privilege (migration
  // 20260808000010), because that role serves both the owner and any logged-in
  // visitor and a grant cannot tell them apart. The ownership filter is what makes
  // the service-role read safe.
  // A FAILED READ IS NOT A MISSING ORGANISATION. The error was discarded, so a
  // dropped socket answered "Organisation not found." to an organiser who has
  // one, which is unanswerable: there is nothing for them to do about it and
  // nothing in the log about it either.
  const scope = await resolveOrganisationScope()
  if (!scope.ok) return { error: 'Organisation not found.' }
  const org = await readOrThrow('founding-invite-issuer', () =>
    createAdminClient()
      .from('organisations')
      .select('id, name, is_founding')
      .eq('id', scope.active.id)
      .maybeSingle(),
  )
  if (!org) return { error: 'Organisation not found.' }
  if (!org.is_founding) {
    return { error: 'Founding invites are available to Founding Organisers. Yours is not one yet.' }
  }

  // Enforce the per-organiser allowance against real issued rows.
  //
  // A FAILED COUNT NO LONGER READS AS NOUGHT ISSUED. It was `(count ?? 0) >=
  // INVITES_PER_FOUNDING_ORGANISER`, and `error` was not bound, so a count that
  // could not be taken came back null, `null ?? 0` was zero, and the one check
  // standing between the offer and its own scarcity minted another code. Every
  // founding invite is a founding spot and six fee-free months, so the failure
  // direction was the expensive one. countOrRaise turns the failure into a
  // failure; the organiser sees the screen refuse and tries again, which is
  // true, instead of quietly receiving an invite they were not owed.
  //
  // The database says the same thing independently, since migration
  // 20260920000050: trg_founding_invite_allowance refuses the sixth row. This
  // check stays because it produces a readable refusal rather than a raised
  // constraint, and the catch below turns the constraint into the same
  // sentence when the two ever disagree.
  const admin = createAdminClient()
  const issued = countOrRaise(
    'founding invites this organiser has issued',
    await admin
      .from('founding_invites')
      .select('id', { count: 'exact', head: true })
      .eq('inviter_org_id', org.id),
  )
  if (issued >= INVITES_PER_FOUNDING_ORGANISER) {
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
