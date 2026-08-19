import type { SupabaseClient } from '@supabase/supabase-js'
import type { OutstandingRequirement, ReconcileOutcome } from '@/lib/stripe/reconcile-connect'
import {
  ORG_SALE_FIELDS_SELECT,
  verifyOrgSaleFields,
  isOrganiserSellable,
} from '@/lib/payments/sale-status'

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
  return true
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
 * Injected so the gate can be tested without Stripe or a database. Defaults to the
 * real reconciler.
 */
type ReconcileFn = (organisationId: string) => Promise<ReconcileOutcome>

async function defaultReconcile(organisationId: string): Promise<ReconcileOutcome> {
  // Imported lazily and behind the refusal branch so the happy path never pays for
  // loading the Stripe SDK, and so a test that never refuses needs no mock.
  const [{ reconcileConnectedAccount }, { createAdminClient }] = await Promise.all([
    import('@/lib/stripe/reconcile-connect'),
    import('@/lib/supabase/admin'),
  ])
  return reconcileConnectedAccount(createAdminClient(), organisationId)
}

/**
 * Server-side publish-gate for events. Free events bypass; paid events
 * (any tier with price > 0) require the organising org to have an
 * onboarded Stripe Connect account with `charges_enabled` true and a
 * non-restricted payout status.
 *
 * RECONCILE BEFORE REFUSING. If the stored columns say the organisation cannot
 * sell, the gate does NOT refuse on that reading. It re-reads the connected
 * account from Stripe, writes the truth, and decides on the fresh state. That is
 * what makes a stale column incapable of producing a false refusal, which is the
 * failure that locked the founder out of his own platform.
 *
 * The Stripe call happens ONLY on the path that was about to refuse. An
 * organisation that can already sell is answered from the row with no network
 * call, so the working path is not slowed down.
 */
export async function checkPublishGate(
  client: SupabaseClient,
  // `coverImageUrl` is REQUIRED, not optional. Making it optional is what let
  // callers skip the cover check by omission; the type now refuses that.
  input: { organisationId: string; tiersHavePaid: boolean; coverImageUrl: string | null },
  /** `null` opts out of the Stripe re-read; see the branch below for when that is right. */
  reconcile: ReconcileFn | null = defaultReconcile,
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

  if (!input.tiersHavePaid) return { ok: true }

  const { data: org, error } = await client
    .from('organisations')
    // The canonical five, from ONE source (ORG_SALE_FIELDS_SELECT). This used to
    // select three, which is how the fast path below came to disagree with the sale
    // gate: it could not test what it had not read.
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
   * FAST PATH, now the SAME predicate the sale gate uses. Founder ruling
   * 2026-08-19: align this with the sale gate.
   *
   * THE DIVERGENCE THIS ENDS, and it ran in the unsafe direction. This condition
   * used to be `stripe_charges_enabled && payout_status !== 'restricted'`, which is
   * two loose checks where the sale gate makes five strict ones. isOrganiserSellable
   * additionally requires stripe_account_id, stripe_payouts_enabled === true,
   * payout_status === 'active' exactly (not merely "not restricted"), and a country
   * whose currency is supported. So an organiser on hold, or with payouts not yet
   * enabled, or in an unsupported country, could PUBLISH a paid event that the sale
   * gate would then refuse to sell. The organiser announces and promotes a night
   * that cannot take a cent, and the buyer meets a designed "still finishing their
   * payment setup" message that reads as a platform fault.
   *
   * It is not a silent tightening either, which was the stated reason the old
   * condition stayed loose. Failing this check does not refuse: it falls through to
   * the SLOW PATH below, which asks Stripe what is actually true and only refuses if
   * Stripe agrees. So an organisation whose columns have drifted still publishes.
   *
   * ONE PREDICATE, not a second copy. verifyOrgSaleFields asserts every one of the
   * five columns is PRESENT before the predicate runs, so a narrowed select becomes
   * a loud programming error rather than a verdict about the organiser.
   */
  const saleFields = verifyOrgSaleFields(org)
  if (saleFields.complete && isOrganiserSellable(saleFields.org)) {
    return { ok: true }
  }

  // NO RECONCILER. A caller may pass `null` to decide on the row it has just
  // read, without consulting Stripe.
  //
  // WHY THIS EXISTS (merge finding, 13 August 2026). The reconcile below was
  // built for the ORGANISER-FACING publish action, where a person clicks
  // Publish and must never be refused because of a column that drifted while
  // they were looking at the page. The scheduled-publish CRON is a different
  // caller with a different problem: it reads the organisation row seconds
  // before it decides, so it is not working from stale data, and a Stripe call
  // per blocked event puts a network failure mode inside a fail-closed job.
  //
  // It was measured, not assumed: running the reconciler from the cron against
  // an organisation with charges enabled and payouts restricted returned
  // `paid_event_charges_disabled`, which is the WRONG reason to show an
  // organiser. Opting out explicitly is therefore not a weakening, it is the
  // correct answer for this caller, and it is expressed as its own branch so
  // nobody has to fake a Stripe outage to get it.
  if (reconcile === null) {
    return {
      ok: false,
      reason: org.stripe_charges_enabled ? 'organisation_payouts_restricted' : 'paid_event_charges_disabled',
      message: org.stripe_charges_enabled
        ? 'Payouts are restricted on this organisation, so this paid event stays scheduled rather than going live. Open payouts to see what Stripe needs.'
        : 'This organisation cannot take payment yet, so this paid event stays scheduled rather than going live. Connect Stripe and finish identity verification.',
      outstanding: [],
      disabledReason: null,
      nextAction: { label: 'Open payouts', href: '/dashboard/payouts' },
    }
  }

  // SLOW PATH. We are about to refuse. Before doing that, find out what Stripe
  // actually says, because the stored columns are exactly what cannot be trusted.
  const fresh = await reconcile(input.organisationId)

  if (!fresh.ok) {
    // Stripe unreachable. Refuse on the stored state, but say plainly that the
    // status could not be refreshed rather than asserting a Stripe problem.
    return {
      ok: false,
      reason: org.stripe_charges_enabled ? 'organisation_payouts_restricted' : 'paid_event_charges_disabled',
      message:
        fresh.reason === 'stripe_error'
          ? 'We could not check your Stripe status just now, so publishing a paid event is on hold for the moment. Nothing is wrong with your account as far as we know. Try again shortly.'
          : 'Organisation not found.',
      outstanding: [],
      disabledReason: null,
      nextAction: { label: 'Open payouts', href: '/dashboard/payouts' },
    }
  }

  // Stripe says it can sell. The refusal that was about to happen was false, and
  // reconcile has already written the correct row.
  if (fresh.canSell) return { ok: true }

  // A genuine block, now described from Stripe's own payload.
  if (!fresh.payoutStatus || fresh.payoutStatus === 'unset') {
    return {
      ok: false,
      reason: 'paid_event_charges_disabled',
      message:
        'Connect Stripe and finish identity verification before publishing paid events. Free events can be published anytime.',
      outstanding: [],
      disabledReason: null,
      nextAction: { label: 'Connect Stripe', href: '/dashboard/payouts' },
    }
  }

  if (fresh.adminHoldPreserved) {
    return {
      ok: false,
      reason: 'organisation_payouts_restricted',
      message:
        'Payouts are on hold on this organisation by EventLinqs, not by Stripe. Contact support and we will tell you exactly why and what happens next.',
      outstanding: fresh.outstanding,
      disabledReason: fresh.disabledReason,
      nextAction: { label: 'Contact support', href: '/contact' },
    }
  }

  return {
    ok: false,
    reason: fresh.canSell === false && !fresh.outstanding.length && fresh.payoutStatus === 'restricted'
      ? 'organisation_payouts_restricted'
      : 'paid_event_charges_disabled',
    message: describeOutstanding(fresh.outstanding, fresh.disabledReason),
    outstanding: fresh.outstanding,
    disabledReason: fresh.disabledReason,
    nextAction: { label: 'Finish Stripe setup', href: '/dashboard/payouts' },
  }
}
