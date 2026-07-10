import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

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

  // Credit the inviter's referral bonus on a successful conversion.
  if (granted && invite.inviter_org_id) {
    const { data: inviterOrg } = await admin
      .from('organisations')
      .select('founding_bonus_months')
      .eq('id', invite.inviter_org_id)
      .maybeSingle()
    if (inviterOrg) {
      await admin
        .from('organisations')
        .update({ founding_bonus_months: (inviterOrg.founding_bonus_months ?? 0) + REFERRAL_BONUS_MONTHS })
        .eq('id', invite.inviter_org_id)
    }
  }

  return { granted, spotNumber, alreadyFull: !granted }
}
