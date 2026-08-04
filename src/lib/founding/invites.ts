import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordAnonAuditEvent } from '@/lib/admin/audit'
import {
  extendWaiver,
  initialWaiverUntil,
  FOUNDING_INITIAL_MONTHS,
  FOUNDING_WAIVER_CAP,
} from '@/lib/payments/founding-waiver'

/**
 * The founding-organiser network: spots, invite codes, and conversion.
 *
 * The growth doctrine's supply-side loop made real. The 50 founding spots are
 * a REAL count (organisations.is_founding), never fabricated scarcity. Invites
 * are single-use codes issuable only for the open cities (Geelong, Melbourne),
 * either by a founding organiser (their personal links) or by the founder from
 * the waitlist bridge. A conversion grants the new organisation a spot (if any
 * remain) and credits the inviter 3 fee-free months.
 */

export const FOUNDING_SPOT_CAP = 50
export const FOUNDING_CITIES = ['geelong', 'melbourne'] as const
export type FoundingCity = (typeof FOUNDING_CITIES)[number]
/** How many personal invites a single founding organiser may generate. */
export const INVITES_PER_FOUNDING_ORGANISER = 5
export const REFERRAL_BONUS_MONTHS = 3

export function isFoundingCity(v: unknown): v is FoundingCity {
  return typeof v === 'string' && (FOUNDING_CITIES as readonly string[]).includes(v)
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
 * Create a founding invite. Used by both a founding organiser (kind
 * 'organiser') and the founder's waitlist bridge (kind 'founder'). Generates a
 * unique code, retrying on the vanishingly rare collision.
 */
export async function createFoundingInvite(input: {
  inviterKind: 'organiser' | 'founder'
  inviterOrgId: string | null
  inviterName: string
  citySlug: FoundingCity
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
  citySlug: FoundingCity
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
 * Idempotent per invite. Grants a founding spot if any remain (atomic RPC) and
 * credits the inviter 3 months. Never throws; returns a small result object.
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

    if ((holders ?? 0) >= FOUNDING_WAIVER_CAP) {
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

  // Credit the inviter on a successful conversion.
  //
  // The DATE WINDOW is what the charge reads (src/lib/payments/founding-waiver.ts):
  // three months are added to founding_fee_free_until FROM ITS CURRENT VALUE, not
  // from today, so two referrals in the same week stack to six months instead of
  // one overwriting the other. `founding_bonus_months` is still incremented as
  // the historical record of how many referrals were earned, but nothing prices
  // from it any more.
  //
  // Every extension is audit-logged with who, when and the resulting date, which
  // is the audit trail the counter never had.
  if (granted && invite.inviter_org_id) {
    const { data: inviterOrg } = await admin
      .from('organisations')
      .select('founding_bonus_months, founding_fee_free_until, name')
      .eq('id', invite.inviter_org_id)
      .maybeSingle()
    if (inviterOrg) {
      const previousUntil = inviterOrg.founding_fee_free_until ?? null
      const nextUntil = extendWaiver(previousUntil, REFERRAL_BONUS_MONTHS)
      const { error: updateError } = await admin
        .from('organisations')
        .update({
          founding_bonus_months: (inviterOrg.founding_bonus_months ?? 0) + REFERRAL_BONUS_MONTHS,
          founding_fee_free_until: nextUntil,
        })
        .eq('id', invite.inviter_org_id)

      await recordAnonAuditEvent({
        action: updateError
          ? 'founding.waiver.extension_failed'
          : 'founding.waiver.extended',
        metadata: {
          organisation_id: invite.inviter_org_id,
          organisation_name: inviterOrg.name ?? null,
          reason: 'confirmed_referral',
          referred_organisation_id: input.orgId,
          invite_code: input.code,
          months_added: REFERRAL_BONUS_MONTHS,
          previous_fee_free_until: previousUntil,
          new_fee_free_until: updateError ? null : nextUntil,
          ...(updateError ? { error: updateError.message } : {}),
        },
      })
    }
  }

  return { granted, spotNumber, alreadyFull: !granted }
}
