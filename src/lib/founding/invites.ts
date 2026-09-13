import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordAnonAuditEvent } from '@/lib/admin/audit'
import {
  foundingGrantVerdict,
  initialWaiverUntil,
  FOUNDING_INITIAL_MONTHS,
  FOUNDING_REFERRAL_MONTHS,
  FOUNDING_WAIVER_CAP,
} from '@/lib/payments/founding-waiver'
import { isFeatureEnabled } from '@/lib/flags/broadcast'

/**
 * The founding-organiser network: spots, invite codes, and conversion.
 *
 * The growth doctrine's supply-side loop made real. The 50 founding spots are
 * a REAL count (organisations.is_founding), never fabricated scarcity. Invites
 * are single-use codes, either from a founding organiser (their personal
 * links) or from the founder. A conversion grants the new organisation a spot
 * (if any remain), opens its six-month fee-free window, and records WHO
 * REFERRED IT. The inviter's three extra months are credited later, by the
 * database, when the referred organiser's first paid ticket actually sells
 * (close-out FO1); this module no longer pays on a signup.
 *
 * NATIONWIDE FROM DAY ONE (founder ruling 2026-08-23). This module used to
 * carry `FOUNDING_CITIES = ['geelong','melbourne']` and gate every invite on
 * it, so an organiser in Perth could not be invited and could not invite
 * anyone. The cap and the referral mechanic are the scarcity; the two-city
 * list was a separate, geographic restriction and it is gone. A city slug is
 * still VALIDATED, because the column is not free text and the invite landing
 * renders the city name, but it is validated against the canonical city
 * registry (src/lib/cities/data.ts) rather than against a launch order.
 */
import { isCitySlug, getCity, type CitySlug } from '@/lib/cities/data'

/**
 * ONE FIFTY, ONE THREE. These used to be separate literals that happened to
 * equal the constants in src/lib/payments/founding-waiver.ts, which is how the
 * fee engine and the invite mechanic come to disagree about the same offer
 * without anything failing. They are re-exports now: the terms live in the
 * waiver module, beside the charge that applies them, and this module names
 * them in its own vocabulary.
 */
export const FOUNDING_SPOT_CAP = FOUNDING_WAIVER_CAP
/** How many personal invites a single founding organiser may generate. */
export const INVITES_PER_FOUNDING_ORGANISER = 5
export const REFERRAL_BONUS_MONTHS = FOUNDING_REFERRAL_MONTHS

/**
 * Any city in the canonical Australian registry may carry a founding invite.
 *
 * Kept as a named function rather than inlining `isCitySlug` at the call sites
 * so there is one place to read the answer to "which cities can be invited",
 * and so the answer is visibly `all of them` instead of being implied by the
 * absence of a check.
 */
export function isFoundingCity(v: unknown): v is CitySlug {
  return typeof v === 'string' && isCitySlug(v)
}

/** The display name for an invite's city, from the canonical registry. */
export function foundingCityName(slug: string): string {
  return getCity(slug)?.name ?? slug
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no ambiguous 0/O/1/I

/** A short, unguessable, human-shareable invite code. */
function generateCode(): string {
  const bytes = new Uint8Array(10)
  crypto.getRandomValues(bytes)
  let out = ''
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length]
  return out
}

export type FoundingCounts = {
  spotsTaken: number
  spotsRemaining: number
  invitesIssued: number
  invitesAccepted: number
}

/** Live, real counts for the programme (no fabricated numbers). */
export async function getFoundingCounts(): Promise<FoundingCounts> {
  const admin = createAdminClient()
  const [{ count: taken }, { count: issued }, { count: accepted }] = await Promise.all([
    admin.from('organisations').select('id', { count: 'exact', head: true }).eq('is_founding', true),
    admin.from('founding_invites').select('id', { count: 'exact', head: true }),
    admin.from('founding_invites').select('id', { count: 'exact', head: true }).eq('status', 'accepted'),
  ])
  const spotsTaken = taken ?? 0
  return {
    spotsTaken,
    spotsRemaining: Math.max(0, FOUNDING_SPOT_CAP - spotsTaken),
    invitesIssued: issued ?? 0,
    invitesAccepted: accepted ?? 0,
  }
}

/**
 * How many organisers this one has actually brought on board, split into the
 * two states that matter to the offer.
 *
 * CONFIRMED is the number that has earned fee-free months: organisations this
 * one referred whose first paid ticket has sold. PENDING is the number who
 * signed up through the link and have not sold one yet.
 *
 * DERIVED, never stored. A counter column would need a declared maintainer and
 * would rot the first time a path forgot to increment it; these two numbers are
 * a count over the two columns that already decide the credit, so the screen
 * and the machine cannot tell different stories.
 */
export async function getFoundingReferralSummary(organisationId: string): Promise<{
  confirmed: number
  pending: number
}> {
  const admin = createAdminClient()
  const [{ count: confirmed }, { count: pending }] = await Promise.all([
    admin
      .from('organisations')
      .select('id', { count: 'exact', head: true })
      .eq('referred_by_organisation_id', organisationId)
      .not('referral_credited_at', 'is', null),
    admin
      .from('organisations')
      .select('id', { count: 'exact', head: true })
      .eq('referred_by_organisation_id', organisationId)
      .is('referral_credited_at', null),
  ])
  return { confirmed: confirmed ?? 0, pending: pending ?? 0 }
}

/**
 * Create a founding invite. Used by both a founding organiser (kind
 * 'organiser') and the founder's waitlist bridge (kind 'founder'). Generates a
 * unique code, retrying on the vanishingly rare collision.
 */
export async function createFoundingInvite(input: {
  inviterKind: 'organiser' | 'founder'
  inviterOrgId: string | null
  inviterName: string
  citySlug: CitySlug
  inviteeEmail: string | null
}): Promise<{ code: string } | { error: string }> {
  const admin = createAdminClient()
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode()
    const { error } = await admin.from('founding_invites').insert({
      code,
      inviter_kind: input.inviterKind,
      inviter_org_id: input.inviterOrgId,
      inviter_name: input.inviterName,
      city_slug: input.citySlug,
      invitee_email: input.inviteeEmail?.toLowerCase() ?? null,
      status: 'pending',
    })
    if (!error) return { code }
    // 23514 check_violation on city_slug: the database still carries the
    // two-city CHECK from 20260710000002_founding_network.sql. The app no
    // longer restricts by city (nationwide from day one), so this can only
    // mean migration 20260823000001 has not been applied to this database
    // yet. Say that, rather than returning a generic failure that reads as a
    // bug in the invite code, because the fix is an operator action.
    if (error.code === '23514') {
      console.error('[founding] invite insert refused by a check constraint:', error)
      return {
        error:
          'This database still limits founding invites to Geelong and Melbourne. Apply migration 20260823000001_founding_invites_nationwide.sql to open them nationwide.',
      }
    }
    // 23505 unique_violation on the code: retry with a fresh one.
    if (error.code !== '23505') {
      console.error('[founding] invite insert failed:', error)
      return { error: 'Could not create the invite. Please try again.' }
    }
  }
  return { error: 'Could not generate a unique invite code. Please try again.' }
}

export type PublicInvite = {
  code: string
  inviterName: string
  citySlug: CitySlug
  status: string
}

/** Resolve an invite for the warm landing page. Null when not found. */
export async function getInviteByCode(code: string): Promise<PublicInvite | null> {
  if (!/^[A-Z0-9]{6,16}$/.test(code)) return null
  const admin = createAdminClient()
  const { data } = await admin
    .from('founding_invites')
    .select('code, inviter_name, city_slug, status')
    .eq('code', code)
    .maybeSingle()
  if (!data || !isFoundingCity(data.city_slug)) return null
  return {
    code: data.code,
    inviterName: data.inviter_name,
    citySlug: data.city_slug,
    status: data.status,
  }
}

/**
 * Convert an invite when the invited organiser has created their organisation.
 *
 * Idempotent per invite. Records who referred whom, grants a founding spot if
 * any remain (atomic RPC) and opens the new organisation's six-month window.
 *
 * IT NO LONGER CREDITS THE INVITER HERE, and that is the point of close-out
 * FO1. This function used to add three fee-free months to the inviter's window
 * the instant the invited organiser CREATED AN ACCOUNT. The offer published on
 * /organisers, and repeated word for word in every outreach message since
 * 12 September 2026, promises "3 more fee-free months for every organiser you
 * refer WHO RUNS AN EVENT". So the copy promised an event and the machine paid
 * on a signup: an organiser could have earned a year of waived fees by inviting
 * four friends who never sold a ticket.
 *
 * The credit now belongs to the referred organiser's FIRST CONFIRMED PAID
 * ORDER and is granted by the database, in trigger trg_founding_referral_credit
 * (migration 20260913000010). It is in the database rather than in a webhook
 * because the grant must happen exactly once for exactly the orders that
 * actually confirmed, and the row lock that guarantees that is only available
 * where the row is.
 *
 * Never throws; returns a small result object.
 */
export async function acceptFoundingInvite(input: {
  code: string
  userId: string
  orgId: string
  cityFromOrg: string | null
}): Promise<{ granted: boolean; spotNumber: number | null; alreadyFull: boolean }> {
  const admin = createAdminClient()
  const { data: invite } = await admin
    .from('founding_invites')
    .select('id, status, inviter_org_id, city_slug')
    .eq('code', input.code)
    .maybeSingle()

  if (!invite || invite.status !== 'pending') {
    return { granted: false, spotNumber: null, alreadyFull: false }
  }

  // Mark accepted first (single-use), so a double submit cannot double-grant.
  const { data: claimed } = await admin
    .from('founding_invites')
    .update({
      status: 'accepted',
      accepted_by_user_id: input.userId,
      accepted_org_id: input.orgId,
      accepted_at: new Date().toISOString(),
    })
    .eq('id', invite.id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()
  if (!claimed) return { granted: false, spotNumber: null, alreadyFull: false }

  // WHO REFERRED WHOM, recorded before anything can fail, and independently of
  // whether a founding spot was still available. The relationship is a fact
  // about how this organiser arrived; the spot is a separate question, and an
  // organiser who came through a friend's link still came through it even when
  // the fiftieth spot went an hour earlier. The three-month credit is granted
  // later, by the database, on this organisation's first confirmed paid order.
  if (invite.inviter_org_id && invite.inviter_org_id !== input.orgId) {
    const { error: referralError } = await admin
      .from('organisations')
      .update({ referred_by_organisation_id: invite.inviter_org_id })
      .eq('id', input.orgId)
      .is('referred_by_organisation_id', null)
    if (referralError) {
      // Not fatal to the signup: the organiser still gets their account and
      // their spot. It IS reported, because an unrecorded referral is a fee
      // waiver somebody earned and will never be paid.
      console.error('[founding] could not record the referral for org %s:', input.orgId, referralError)
      await recordAnonAuditEvent({
        action: 'founding.referral.record_failed',
        metadata: {
          organisation_id: input.orgId,
          referrer_organisation_id: invite.inviter_org_id,
          invite_code: input.code,
          error: referralError.message,
        },
      })
    }
  }

  // THE OFFER CAN BE CLOSED WITHOUT A DEPLOY (FO1 reversal condition). With
  // founding_open false no new spot is granted and no new window is opened;
  // organisations that already hold one keep it, and their referrals keep
  // earning. The invite is still consumed above, so the link cannot be replayed
  // once the offer reopens.
  const offerOpen = await isFeatureEnabled('founding_open', { client: admin })
  if (!offerOpen) {
    await recordAnonAuditEvent({
      action: 'founding.offer.closed_refusal',
      metadata: {
        organisation_id: input.orgId,
        invite_code: input.code,
        reason: 'feature_flag founding_open is false',
      },
    })
    return { granted: false, spotNumber: null, alreadyFull: true }
  }

  const { data: spot } = await admin.rpc('claim_founding_spot', {
    p_org_id: input.orgId,
    p_city_slug: invite.city_slug,
  })
  const spotNumber = typeof spot === 'number' ? spot : null
  const granted = spotNumber !== null

  // Grant the NEW organisation its six-month window. claim_founding_spot sets
  // is_founding and allocates the numbered spot atomically (that RPC is what
  // enforces the fifty-spot race); this writes the date the charge actually
  // reads. The database trigger trg_founding_waiver_cap is the final backstop:
  // if fifty organisations already hold a window this update is rejected and the
  // failure is audit-logged rather than silently swallowed.
  if (granted) {
    // THE FIFTY CAP, IN CODE. It used to be copy only. Checked here so the
    // refusal is readable and audit-logged; the database trigger
    // trg_founding_waiver_cap is the backstop that a direct SQL grant or a
    // future code path cannot get around.
    const { count: holders } = await admin
      .from('organisations')
      .select('id', { count: 'exact', head: true })
      .not('founding_fee_free_until', 'is', null)

    if (
      foundingGrantVerdict({ holders: holders ?? 0, opensNewWindow: true }) === 'refused_cap'
    ) {
      await recordAnonAuditEvent({
        action: 'founding.waiver.cap_reached',
        metadata: {
          organisation_id: input.orgId,
          invite_code: input.code,
          holders: holders ?? 0,
          cap: FOUNDING_WAIVER_CAP,
        },
      })
      // The founding SPOT is still granted (the RPC allocated it); only the fee
      // waiver is withheld, and it is recorded so the founder can see it.
      return { granted, spotNumber, alreadyFull: false }
    }

    const until = initialWaiverUntil()
    const { error: grantError } = await admin
      .from('organisations')
      .update({ founding_fee_free_until: until })
      .eq('id', input.orgId)
      .is('founding_fee_free_until', null)

    await recordAnonAuditEvent({
      action: grantError ? 'founding.waiver.grant_failed' : 'founding.waiver.granted',
      metadata: {
        organisation_id: input.orgId,
        reason: 'founding_spot_claimed',
        spot_number: spotNumber,
        invite_code: input.code,
        months_granted: FOUNDING_INITIAL_MONTHS,
        new_fee_free_until: grantError ? null : until,
        cap: FOUNDING_WAIVER_CAP,
        ...(grantError ? { error: grantError.message } : {}),
      },
    })
  }

  // THE INVITER IS NOT CREDITED HERE. It used to be, the moment this line ran,
  // which paid three fee-free months for a signup while the published offer
  // promised them for an organiser who RUNS AN EVENT. The credit now belongs to
  // the referred organisation's first confirmed PAID order and is granted by
  // trigger trg_founding_referral_credit, from the referral relationship
  // recorded above. See migration 20260913000010_founding_organiser_terms.sql.

  return { granted, spotNumber, alreadyFull: !granted }
}
