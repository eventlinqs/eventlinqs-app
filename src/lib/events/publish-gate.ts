import type { SupabaseClient } from '@supabase/supabase-js'
import type { OutstandingRequirement } from '@/lib/stripe/reconcile-connect'
import {
  ORG_SALE_FIELDS_SELECT,
  verifyOrgSaleFields,
  isOrganiserSellable,
} from '@/lib/payments/sale-status'
import { walkInHoursProblems, type GuideDay } from '@/lib/walk-in/guide'
import { isLibraryPhoto } from '@/lib/media/library-photo'

/**
 * Result of the publish-gate check.
 *
 * `ok: true` means the publish (or scheduled publish) is allowed. Any
 * other variant carries a stable `reason` token that callers can map to
 * a user-facing message and that tests can assert against without
 * matching free-form copy.
 *
 * `outstanding` is populated on a payout refusal so the caller can show WHAT
 * Stripe is actually asking for instead of telling the organiser to go and find
 * a problem themselves.
 */
export type PublishGateResult =
  | { ok: true }
  | {
      ok: false
      reason:
        | 'organisation_not_found'
        | 'paid_event_charges_disabled'
        | 'organisation_payouts_restricted'
        | 'cover_image_required'
        | 'event_already_ended'
        | 'venue_required'
        | 'walk_in_has_ticket_types'
        | 'walk_in_hours_missing'
      message: string
      /** What Stripe says is outstanding, most urgent first. Empty if Stripe wants nothing. */
      outstanding?: OutstandingRequirement[]
      /** Stripe's own machine-readable reason, when it gives one. */
      disabledReason?: string | null
      /** Where the organiser goes next. */
      nextAction?: { label: string; href: string }
    }

/**
 * Photo-required gate: every published event must carry a real organiser
 * cover. Picsum placeholders are not real imagery and are rejected for
 * parity with the events_published_real_cover DB constraint added in
 * 20260504000001_event_photo_required.sql.
 */
export function hasRealCover(url: string | null | undefined): boolean {
  if (!url) return false
  if (typeof url !== 'string' || url.trim() === '') return false
  if (/^https:\/\/picsum\.photos\//i.test(url)) return false
  // A library photograph is never a night's own cover (the PM's 18:38 of 29 October 2026; src/lib/media/library-photo.ts).
  if (isLibraryPhoto(url)) return false
  return true
}

/**
 * The facts a walk-in event is published on (WI1). `null` for a ticketed event.
 *
 * REQUIRED on the gate's input, for the reason the gate gives for every field: a
 * check a caller can skip by forgetting a field is not a check. A caller that
 * has a walk-in event and passes `null` publishes it without its hours, so every
 * caller reads the mode from the row and passes what it read.
 */
export type WalkInPublishFacts = {
  tierCount: number
  days: GuideDay[]
  startsAt: string
  endsAt: string
  timezone: string
}

/**
 * Returns true if any tier carries a non-zero price. Accepts either the
 * cents form used in DB rows or the dollars form used in form input;
 * both treat zero as free, which is the only thing this function cares
 * about.
 */
export function hasPaidTier(tiers: Array<{ price: number }>): boolean {
  return tiers.some((t) => Number(t.price) > 0)
}

/**
 * Turn Stripe's requirements into a sentence an organiser can act on.
 *
 * THE MESSAGE THIS REPLACES said "Payouts are restricted on this organisation.
 * Resolve the Stripe issue before publishing paid events." It told the founder to
 * fix something that was not broken, named nothing, and offered no next step.
 *
 * Stripe documents `requirements.errors[].reason` as "A plain language message
 * that explains why the error occurred and how to resolve it", so where an error
 * reason exists it is shown VERBATIM rather than reworded into our own guess
 * (https://docs.stripe.com/connect/handling-api-verification, fetched 2026-08-09).
 * Where there is no error reason, the requirement key is named, because naming
 * `company.tax_id` is still infinitely better than "resolve the Stripe issue".
 */
export function describeOutstanding(
  outstanding: OutstandingRequirement[],
  disabledReason: string | null | undefined,
): string {
  if (outstanding.length === 0) {
    // Stripe is asking for nothing, so say what it DID say rather than inventing a
    // requirement. disabled_reason values like 'under_review' and
    // 'requirements.pending_verification' are documented as needing no action.
    if (disabledReason === 'requirements.pending_verification') {
      return 'Stripe is still verifying the details you submitted. Nothing is needed from you; this usually clears within a few minutes.'
    }
    if (disabledReason === 'under_review') {
      return 'Stripe is reviewing this account. Nothing is needed from you right now.'
    }
    if (disabledReason) {
      return `Stripe has paused payouts on this account and gave the reason "${disabledReason}". Open your Stripe dashboard to see the detail.`
    }
    return 'Stripe has not enabled payouts on this account yet and has not said what is outstanding. Open your Stripe dashboard, or press Refresh Stripe status to check again.'
  }

  const withReason = outstanding.filter((o) => o.reason)
  if (withReason.length > 0) {
    // Stripe's own words, which are written for the account holder to read.
    const first = withReason.slice(0, 3).map((o) => o.reason as string)
    return `Stripe needs this resolved before payouts can run: ${first.join(' ')}`
  }

  const names = outstanding.slice(0, 4).map((o) => o.requirement)
  const more = outstanding.length > names.length ? ` and ${outstanding.length - names.length} more` : ''
  return `Stripe still needs: ${names.join(', ')}${more}. Finish these in your Stripe onboarding and this will clear.`
}

/**
 * Server-side publish-gate for events. Free events bypass; a paid event (any tier
 * with price > 0) publishes on the SAME rule the sale and the charge use,
 * isOrganiserSellable: it is refused only for an organisation a person at
 * EventLinqs has put on hold, or one whose payout account sits in a country we
 * cannot settle in.
 *
 * SELL FIRST, CONNECT BEFORE THE PAYOUT (Lawal's yes of 15:22, 14 November 2026:
 * "Yes, you let organisers publish and sell straight away"). Until that day a paid
 * event waited for a connected, verified Stripe account, read and re-read from
 * Stripe here (bfdc66684, 30 April 2026, before A2). Under A2 (29 September) the
 * buyer pays EventLinqs, which holds the money until after the event and then
 * transfers it to the organiser's own connected account (10 October), so no
 * Stripe posture decides a publish any more and none is read on this path.
 * Connecting payouts is a guided step on the dashboard; the payout keeps its own
 * rule (isOrganiserPayable, runEventDisbursements).
 */
export async function checkPublishGate(
  client: SupabaseClient,
  // `coverImageUrl` is REQUIRED, not optional. Making it optional is what let
  // callers skip the cover check by omission; the type now refuses that.
  /*
   * Every field is REQUIRED, not optional, for the reason written on
   * coverImageUrl below: a gate a caller can skip by forgetting a field is not a
   * gate. endsAt and the venue pair joined it on 29 August.
   */
  input: {
    organisationId: string
    tiersHavePaid: boolean
    coverImageUrl: string | null
    /** ISO end time. An event that has already ended cannot go on sale. */
    endsAt: string | null
    /** True for an in-person event. An online event needs no address. */
    isPhysical: boolean
    venueName: string | null
    venueAddress: string | null
    /** WI1. The walk-in facts, or null for a ticketed event. See WalkInPublishFacts. */
    walkIn: WalkInPublishFacts | null
  },
): Promise<PublishGateResult> {
  // COVER REQUIRED TO PUBLISH, for free and paid events alike.
  //
  // THE HOLE THIS CLOSES. The condition used to begin `'coverImageUrl' in input`,
  // so any caller that simply omitted the key skipped the check in silence and
  // published an event with no cover. The requirement was real, was documented,
  // and was opt-in by accident. A gate a caller can skip by forgetting a field is
  // not a gate. The key is now required by the type, so omitting it is a compile
  // error rather than a silent pass.
  if (!hasRealCover(input.coverImageUrl)) {
    return {
      ok: false,
      reason: 'cover_image_required',
      message:
        'Upload a cover photo before publishing this event. Photo-required helps every event look its best on EventLinqs.',
    }
  }

  /*
   * AN EVENT THAT HAS ALREADY ENDED CANNOT BE ATTENDED.
   *
   * Founder ruling 29 August 2026, after a break attempt published an event
   * starting a month in the past through the ordinary wizard with no warning at
   * any step. The only date rule anywhere was "End date and time must be after
   * start date and time", which a fat-fingered year satisfies perfectly.
   *
   * ENDED, not "starts in the past", and the difference is the whole ruling: a
   * festival that opened yesterday and runs for a week is a real event that must
   * still be publishable and still be sellable. What cannot be sold is a night
   * that is over.
   */
  if (input.endsAt) {
    const ends = new Date(input.endsAt)
    if (!Number.isNaN(ends.getTime()) && ends.getTime() < Date.now()) {
      return {
        ok: false,
        reason: 'event_already_ended',
        message:
          'This event has already finished, so it cannot go on sale. Check the date and year, then publish again.',
      }
    }
  }

  /*
   * A PHYSICAL EVENT WITH NO VENUE CANNOT BE ATTENDED EITHER.
   *
   * Founder ruling 29 August 2026. Scoped to in-person events on purpose: an
   * online event legitimately has no address, and refusing one would be a new
   * defect rather than a fix.
   */
  if (input.isPhysical && !input.venueName?.trim() && !input.venueAddress?.trim()) {
    return {
      ok: false,
      reason: 'venue_required',
      message:
        'Add where this event happens before publishing. An in-person event with no venue cannot be found or attended.',
      nextAction: { label: 'Add the venue', href: '#location' },
    }
  }

  /*
   * A FREE WALK-IN EVENT (WI1) has nothing to sell, so the Stripe question below
   * never applies to it. What it must have instead is the hours people come at:
   * a walk-in page with no hours tells nobody when to turn up. The database
   * already refuses a ticket type on it; this says so in words before the save.
   */
  if (input.walkIn) {
    if (input.walkIn.tierCount > 0) {
      return {
        ok: false,
        reason: 'walk_in_has_ticket_types',
        message:
          'A free walk-in event has no ticket types. Remove them, or choose Sell tickets as the way in.',
      }
    }
    const problems = walkInHoursProblems(input.walkIn.days, {
      startsAt: input.walkIn.startsAt,
      endsAt: input.walkIn.endsAt,
      timezone: input.walkIn.timezone,
    })
    if (problems.length > 0) {
      return {
        ok: false,
        reason: 'walk_in_hours_missing',
        message: problems[0],
        nextAction: { label: 'Add the hours', href: '#entry' },
      }
    }
    return { ok: true }
  }

  if (!input.tiersHavePaid) return { ok: true }

  const { data: org, error } = await client
    .from('organisations')
    // The five sale columns, from ONE source (ORG_SALE_FIELDS_SELECT), so a
    // narrowed select is a loud programming error rather than a verdict.
    .select(ORG_SALE_FIELDS_SELECT)
    .eq('id', input.organisationId)
    .maybeSingle()

  if (error || !org) {
    return {
      ok: false,
      reason: 'organisation_not_found',
      message: 'Organisation not found.',
    }
  }

  /*
   * ONE RULE FOR PUBLISH, SALE AND CHARGE. isOrganiserSellable is what the event
   * page, the checkout and the charge precondition (assertOrganiserCanTakeSales)
   * ask, so an event can never be published that the checkout then refuses to
   * sell, and never refused here for a reason the checkout would not refuse.
   */
  const saleFields = verifyOrgSaleFields(org)
  if (!saleFields.complete) {
    return {
      ok: false,
      reason: 'organisation_not_found',
      message: 'We could not read the sale settings for this organisation just now, so the event was not published. Try again in a moment.',
    }
  }
  if (isOrganiserSellable(saleFields.org)) return { ok: true }

  // Refused: a person's hold, or a payout account in a country we cannot settle
  // in. Neither is the organiser's to fix on a screen, so the step is to ask us.
  return {
    ok: false,
    reason: 'organisation_payouts_restricted',
    message:
      saleFields.org.payout_status === 'on_hold'
        ? 'Ticket sales are paused for this organisation. Contact EventLinqs support for details.'
        : 'Ticket sales are not available for payout accounts in this country. Contact EventLinqs support for details.',
    outstanding: [],
    disabledReason: null,
    nextAction: { label: 'Contact support', href: '/contact' },
  }
}
