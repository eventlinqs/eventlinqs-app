import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { countOrRaise } from '@/lib/supabase/count-or-raise'
import { readOrThrow } from '@/lib/supabase/read-or-throw'
import { recordAnonAuditEvent } from '@/lib/admin/audit'
import { FOUNDING_REFERRAL_MONTHS } from '@/lib/payments/founding-waiver'
import { isFeatureEnabled } from '@/lib/flags/broadcast'

/**
 * The founding-organiser network: spots, invite codes, and conversion.
 *
 * The growth doctrine's supply-side loop made real. Founding membership is
 * a REAL count (organisations.is_founding), never fabricated scarcity, and
 * since LAW 24 (founder ruling, 20 September 2026) it has no cap: "Not a cap
 * of 50. Every organiser." Invites are single-use codes, either from a
 * founding organiser (their personal links) or from the founder. A conversion
 * grants the new organisation founding membership and records WHO REFERRED
 * IT. The six-month fee-free window is not granted here any more: every
 * organisation already holds one from its own registration, stamped by the
 * database at insert (trigger trg_registration_fee_free_window, migration
 * 20260926000001). The inviter's three extra months are credited later, by the
 * database, when the referred organiser's first paid ticket actually sells
 * (close-out FO1); this module no longer pays on a signup.
 *
 * NATIONWIDE FROM DAY ONE (founder ruling 2026-08-23). This module used to
 * carry `FOUNDING_CITIES = ['geelong','melbourne']` and gate every invite on
 * it, so an organiser in Perth could not be invited and could not invite
 * anyone. The two-city list was a geographic restriction and it is gone. A city slug is
 * still VALIDATED, because the column is not free text and the invite landing
 * renders the city name, but it is validated against the canonical city
 * registry (src/lib/cities/data.ts) rather than against a launch order.
 */
import { isCitySlug, getCity, type CitySlug } from '@/lib/cities/data'

/**
 * ONE THREE. This used to be a separate literal that happened to equal the
 * constant in src/lib/payments/founding-waiver.ts, which is how the fee engine
 * and the invite mechanic come to disagree about the same offer without
 * anything failing. It is a re-export: the terms live in the waiver module,
 * beside the charge that applies them. (FOUNDING_SPOT_CAP, the fifty, was
 * removed with the cap under LAW 24.)
 */
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
  invitesIssued: number
  invitesAccepted: number
}

/**
 * Live, real counts for the programme (no fabricated numbers).
 *
 * A FAILED COUNT RAISES RATHER THAN READING AS ZERO. These three numbers are
 * the top of the founder's demand-signal screen: `taken ?? 0` on a failed read
 * renders the whole programme as untouched, which is indistinguishable at the
 * UI from the truth on the day the platform launches.
 */
export async function getFoundingCounts(): Promise<FoundingCounts> {
  const admin = createAdminClient()
  const [takenRes, issuedRes, acceptedRes] = await Promise.all([
    admin.from('organisations').select('id', { count: 'exact', head: true }).eq('is_founding', true),
    admin.from('founding_invites').select('id', { count: 'exact', head: true }),
    admin.from('founding_invites').select('id', { count: 'exact', head: true }).eq('status', 'accepted'),
  ])
  const spotsTaken = countOrRaise('organisations that joined through a founding invite', takenRes)
  return {
    spotsTaken,
    invitesIssued: countOrRaise('founding invites issued', issuedRes),
    invitesAccepted: countOrRaise('founding invites accepted', acceptedRes),
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
 *
 * A FAILED COUNT RAISES RATHER THAN READING AS ZERO, for the reason written out
 * over getFoundingCounts above, which this function sat two paragraphs below
 * and did not follow. It was `confirmed ?? 0`, so a dropped socket told a
 * founding organiser they had brought nobody on board. That is the number the
 * offer is measured in: every confirmed referral is three more fee-free months
 * already earned, and a screen saying nought of them reads as the programme
 * having paid nothing rather than as a database that could not be reached.
 */
export async function getFoundingReferralSummary(organisationId: string): Promise<{
  confirmed: number
  pending: number
}> {
  const admin = createAdminClient()
  const [confirmedRes, pendingRes] = await Promise.all([
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
  return {
    confirmed: countOrRaise('confirmed founding referrals', confirmedRes),
    pending: countOrRaise('pending founding referrals', pendingRes),
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
    // 23514 check_violation raised by trg_founding_invite_allowance: this
    // organiser already holds their five. The database is entitled to be the
    // one that notices, and it is the only thing that notices when the
    // application's count could not be taken, so the refusal is translated
    // into the SAME sentence the screen would have shown rather than into a
    // raised constraint the organiser cannot read.
    if (error.code === '23514' && /founding invite allowance reached/i.test(error.message)) {
      return { error: `You have used all ${INVITES_PER_FOUNDING_ORGANISER} of your founding invites.` }
    }
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

/** The row `accept_founding_invite` returns. One row, always. */
type FoundingInviteRow = {
  consumed: boolean
  spot_number: number | null
  referral_recorded: boolean
  offer_closed: boolean
  already_founding: boolean
}

/**
 * What actually happened when an invite was converted.
 *
 * SEPARATE FACTS, because the old shape could not tell the caller apart from
 * itself: no spot comes back when the organisation already holds one, when the
 * offer is closed, or when the database could not be reached, and the last one
 * now throws. `alreadyFull` (no spot because all fifty were taken) was removed
 * with the cap under LAW 24: the programme can no longer be full.
 */
export type FoundingInviteOutcome = {
  /** The single-use code was spent by THIS call. */
  consumed: boolean
  /** A numbered founding spot was allocated by this call. */
  granted: boolean
  spotNumber: number | null
  /** The referral relationship was written by this call. */
  referralRecorded: boolean
  /** founding_open is false, so no spot and no window were granted. */
  offerClosed: boolean
  /** The organisation already held a spot before this call. */
  alreadyFounding: boolean
}

/**
 * Resolve an invite for the warm landing page. Null when not found.
 *
 * A FAILED READ IS NOT A MISSING INVITE, and this one was. The read was
 * `const { data } = await ...`, so a dropped socket left `data` null and
 * /join/[code] rendered its refusal:
 *
 *     "This invitation is not available. It may have already been used, or it
 *      has been withdrawn. Ask the person who invited you for a fresh link."
 *
 * to somebody holding a perfectly valid, pending code. That page is the front
 * door of the acquisition loop, the invited organiser has no way to tell a
 * blink from a dead link, and the sentence tells them to go back to the person
 * who invited them and say the platform turned them away.
 *
 * `readOrThrow` retries a transient fault, answers null only when PostgREST
 * itself said "no row" (PGRST116), and throws for everything else, so the page
 * says "try again" rather than "you are not welcome". The guard that would
 * normally catch this shape, read-failure-is-not-not-found, says in its own
 * header that it cannot: it judges notFound() inside src/app, and this is a
 * helper in src/lib folding a read into null for a RENDERED refusal.
 */
export async function getInviteByCode(code: string): Promise<PublicInvite | null> {
  if (!/^[A-Z0-9]{6,16}$/.test(code)) return null
  const admin = createAdminClient()
  const data = await readOrThrow('founding-invite-landing', () =>
    admin
      .from('founding_invites')
      .select('code, inviter_name, city_slug, status')
      .eq('code', code)
      .maybeSingle(),
  )
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
 * THE CONSUME AND THE CLAIM ARE ONE TRANSACTION, and they were four round trips
 * (LB-INVITEWHOLE, 20 September 2026). The order below is unchanged and was
 * never the problem: the invite is marked accepted BEFORE the spot is claimed,
 * so two submits of one link cannot both pass the pending check. What was wrong
 * is that the two writes were in different transactions and the claim's error
 * was discarded:
 *
 *     const { data: spot } = await admin.rpc('claim_founding_spot', { ... })
 *     const spotNumber = typeof spot === 'number' ? spot : null
 *
 * A dropped socket on that line is indistinguishable there from the programme
 * being full, so an invited organiser whose claim blinked was told "all 50
 * founding spots are taken" while their single-use code had been spent
 * milliseconds earlier. No spot, no window, no way to try again, and nothing
 * anywhere recording it. Migration 20260920000050 moves both writes into
 * accept_founding_invite, where a fault rolls both back and the code is still
 * pending.
 *
 * IT THROWS NOW, where it used to promise never to. That promise was only
 * keepable while a failure could be mistaken for an answer. A thrown error here
 * means NOTHING HAPPENED: the code is unspent and the caller must keep it.
 */
export async function acceptFoundingInvite(input: {
  code: string
  userId: string
  orgId: string
  cityFromOrg: string | null
}): Promise<FoundingInviteOutcome> {
  const admin = createAdminClient()

  // Resolved BEFORE the conversion, because the conversion is now one
  // transaction and the flag has to be an input to it. src/lib/flags/broadcast
  // is the platform's one flag resolver, with its cache and its documented
  // fallback; reading feature_flags a second way inside the SQL would be a
  // second answer to one question.
  const offerOpen = await isFeatureEnabled('founding_open', { client: admin })

  const { data, error } = await admin.rpc('accept_founding_invite', {
    p_code: input.code,
    p_user_id: input.userId,
    p_org_id: input.orgId,
    p_offer_open: offerOpen,
  })

  if (error) {
    // Recorded before it is re-thrown, because the caller's only sensible
    // response is to keep the code and carry on, and a conversion that failed
    // is a founding spot somebody was invited to and has not been given.
    console.error('[founding] the invite conversion failed for org %s:', input.orgId, error)
    await recordAnonAuditEvent({
      action: 'founding.invite.conversion_failed',
      metadata: {
        organisation_id: input.orgId,
        invite_code: input.code,
        error: error.message,
        note: 'nothing was written: the invite is still pending and the code can be used again',
      },
    })
    throw new Error(`the founding invite conversion failed: ${error.message}`)
  }

  // PostgREST returns a set-returning function as an array of rows.
  const row = (Array.isArray(data) ? data[0] : data) as FoundingInviteRow | undefined
  if (!row) {
    throw new Error('accept_founding_invite returned no row, which it cannot do')
  }

  const spotNumber = typeof row.spot_number === 'number' ? row.spot_number : null
  const granted = spotNumber !== null

  if (!row.consumed) {
    // Already accepted, revoked, or never existed. Not an error and not a
    // refusal of the offer: there was nothing here to spend.
    return {
      consumed: false,
      granted: false,
      spotNumber: null,
      referralRecorded: false,
      offerClosed: false,
      alreadyFounding: false,
    }
  }

  if (row.referral_recorded === false && !row.offer_closed) {
    // Not fatal, and usually not a fault: the column is only written when it
    // was NULL, so an organisation that already carries a referrer keeps it.
    // Logged rather than audited for that reason.
    console.info('[founding] no referral recorded for org %s from invite %s', input.orgId, input.code)
  }

  // THE OFFER CAN BE CLOSED WITHOUT A DEPLOY (FO1 reversal condition). With
  // founding_open false no new spot is granted and no new window is opened;
  // organisations that already hold one keep it, and their referrals keep
  // earning. The invite is still consumed, so the link cannot be replayed once
  // the offer reopens.
  if (row.offer_closed) {
    await recordAnonAuditEvent({
      action: 'founding.offer.closed_refusal',
      metadata: {
        organisation_id: input.orgId,
        invite_code: input.code,
        reason: 'feature_flag founding_open is false',
      },
    })
    return {
      consumed: true,
      granted: false,
      spotNumber: null,
      referralRecorded: row.referral_recorded === true,
      offerClosed: true,
      alreadyFounding: false,
    }
  }

  // NO WINDOW IS GRANTED HERE (LAW 24). This used to open the new
  // organisation's six-month window from the moment of the invite, behind an
  // in-code fifty cap and the database trigger trg_founding_waiver_cap. Every
  // organisation now holds its window from its own REGISTRATION, stamped by the
  // database at insert (trg_registration_fee_free_window, migration
  // 20260926000001), so an invited organiser has it already and on the same
  // clock as everybody else.
  const outcome: FoundingInviteOutcome = {
    consumed: true,
    granted,
    spotNumber,
    referralRecorded: row.referral_recorded === true,
    offerClosed: false,
    alreadyFounding: row.already_founding === true,
  }

  // THE INVITER IS NOT CREDITED HERE. It used to be, the moment this line ran,
  // which paid three fee-free months for a signup while the published offer
  // promised them for an organiser who RUNS AN EVENT. The credit now belongs to
  // the referred organisation's first confirmed PAID order and is granted by
  // trigger trg_founding_referral_credit, from the referral relationship
  // recorded above. See migration 20260913000010_founding_organiser_terms.sql.

  return outcome
}
