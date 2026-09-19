/**
 * EVERY PATH ON THIS PLATFORM THAT CAN REACH A MAIL OR SMS TRANSPORT, NAMED.
 *
 * Pure data, no imports, so the registered guard can read it, a unit test can
 * assert against it, and neither has to run a database or a browser.
 *
 * WHY A REGISTRY RATHER THAN A GREP. "No send path may reach a transport
 * without the resolver" cannot be enforced by hoping every future author
 * remembers. scripts/guards/consent-ledger-is-evidence.mjs re-derives the set of
 * modules that import a transport straight from the repository and fails the
 * build when one of them is not listed here, so a new send path cannot be added
 * without a human classifying it. A module classified `marketing` must call the
 * resolver in its own file, and the guard checks that too.
 *
 * THE CLASSIFICATION, and it is a judgement each time, which is exactly why it
 * is written down beside the file rather than inferred from a name:
 *
 *   marketing      the message promotes an event to somebody who did not ask
 *                  about that specific event. It needs a consent record and
 *                  goes through src/lib/consent/resolver.ts.
 *   transactional  the message is about something the person themselves did:
 *                  their order, their ticket, their refund, their payout, their
 *                  sign-in, their waitlist request, an event they hold a ticket
 *                  to. It is not the direct marketing this ledger is evidence
 *                  for, and gating it on a marketing consent would mean a buyer
 *                  who declined marketing never received their ticket.
 *   operations     the message goes to the platform's own operators, never to a
 *                  member of the public.
 *   transport      the module IS the transport, or only asks the provider about
 *                  itself. It sends no message of its own.
 *
 * A transactional or operations entry is a claim, and the reason is written out
 * so the claim can be argued with. Nothing here is decorative.
 */

export type SendPathKind = 'marketing' | 'transactional' | 'operations' | 'transport'

export interface SendPathEntry {
  /** Repository-relative path, forward slashes. */
  file: string
  kind: SendPathKind
  /** The purpose it sends under. Empty for the transport itself. */
  purpose: string
  reason: string
}

export const SEND_PATHS: readonly SendPathEntry[] = [
  {
    file: 'src/lib/email/send.ts',
    kind: 'transport',
    purpose: '',
    reason: 'The Resend transport itself. It composes nothing and decides nothing.',
  },
  {
    file: 'src/lib/health/checks.ts',
    kind: 'transport',
    purpose: '',
    reason:
      'Asks the provider to list the sending domains so the health page can say whether mail can leave. It sends no message.',
  },
  {
    file: 'src/app/api/cron/weekly-digest/route.ts',
    kind: 'marketing',
    purpose: 'platform_local_digest',
    reason:
      'The weekly local digest promotes other organisers events to a city list. It is the marketing the ledger exists for, and its recipient list is filtered through the resolver.',
  },
  {
    file: 'src/lib/notifications/organiser-sale-notify.ts',
    kind: 'transactional',
    purpose: 'organiser_sale',
    reason:
      'Tells an organiser a ticket sold on their own event. It reports what happened to their money, to them, and gating it on a marketing consent would mean an organiser who declined marketing never learned they had been paid. Close-out MONEY FIX B4.',
  },
  {
    file: 'src/lib/notifications/organiser-sales-digest.ts',
    kind: 'transactional',
    purpose: 'organiser_sale',
    reason:
      'The same facts as organiser-sale-notify, rolled up to one message a day because that is the default preference. It promotes nothing and reaches nobody but the organiser whose sales it reports.',
  },
  {
    file: 'src/lib/notifications/organiser-money-notify.ts',
    kind: 'transactional',
    purpose: 'organiser_money_event',
    reason:
      'The four money messages an organiser was never sent: a refund that settled on their event, a refund that failed at the bank and left their buyer out of pocket, a chargeback that has frozen their share, and a Connect account that has stopped being able to take money. Every one reports what has happened to THEIR money, to them, and none may be switched off by anyone (close-out MONEY FIX B4 reversal condition). Gating any of them on a marketing consent would mean an organiser who declined marketing was never told their money had stopped moving, which is the defect this item exists to end rather than a use of the ledger.',
  },
  {
    file: 'src/lib/notifications/organiser-event-notify.ts',
    kind: 'transactional',
    purpose: 'organiser_event_published',
    reason:
      'Tells an organiser their own event is live, in response to their own publish. Close-out MONEY FIX B4, and the message clause 2 of every-message-has-a-declared-recipient requires to balance the owner platform_event_published feed.',
  },
  {
    file: 'src/lib/email/order-confirmation.ts',
    kind: 'transactional',
    purpose: 'order_confirmation',
    reason: 'The receipt and the tickets for an order the buyer just placed.',
  },
  {
    file: 'src/app/api/webhooks/stripe/route.ts',
    kind: 'transactional',
    purpose: 'order_confirmation',
    reason:
      'Confirms a paid order once Stripe settles it. Lane A territory: the payment path is not touched by the consent work.',
  },
  {
    file: 'src/app/actions/transfer-ticket.ts',
    kind: 'transactional',
    purpose: 'ticket_delivery',
    reason: 'Delivers a ticket to the person it was transferred to, at the holder request.',
  },
  {
    file: 'src/lib/refunds/notify.ts',
    kind: 'transactional',
    purpose: 'refund_notice',
    reason: 'Tells a buyer their money is on its way back. Lane A territory.',
  },
  {
    file: 'src/lib/payouts/email.ts',
    kind: 'transactional',
    purpose: 'payout_notice',
    reason: 'Tells an organiser what was paid out to them and when.',
  },
  {
    file: 'src/lib/email/auth-emails.ts',
    kind: 'transactional',
    purpose: 'auth_link',
    reason: 'Sign-in links, verification and password resets, each one asked for by the person.',
  },
  {
    file: 'src/lib/notifications/dispatch.ts',
    kind: 'transactional',
    purpose: 'event_change_notice',
    reason:
      'Tells an attendee about an event they follow or hold a ticket to, under the per-user notification preferences. Lane C territory: the notification router is not touched by the consent work.',
  },
  {
    file: 'src/lib/fillrate/engine.ts',
    kind: 'transactional',
    purpose: 'waitlist_offer',
    reason:
      'Tells somebody who joined THIS event waitlist that a ticket came free. They asked about this event by name, and the engine refuses everybody who did not.',
  },
  {
    file: 'src/app/waitlist/actions.ts',
    kind: 'transactional',
    purpose: 'waitlist_offer',
    reason: 'Confirms a city waitlist signup the person just submitted.',
  },
  {
    file: 'src/lib/launch/kit-email.ts',
    kind: 'transactional',
    purpose: 'organiser_operations',
    reason: 'Sends an organiser their own launch kit for their own event, on request.',
  },
  {
    file: 'src/lib/marketplace/notify.ts',
    kind: 'transactional',
    purpose: 'organiser_operations',
    reason:
      'Tells an artist or organiser about their own marketplace activity, under the availability they switched on themselves.',
  },
  {
    file: 'src/app/(dashboard)/dashboard/events/[id]/seats/actions.ts',
    kind: 'transactional',
    purpose: 'ticket_delivery',
    reason: 'Tells a ticket holder their seat changed on an event they hold a ticket to.',
  },
  {
    file: 'src/app/admin/(authed)/network/actions.ts',
    kind: 'transactional',
    purpose: 'organiser_operations',
    reason:
      'Invites a named organiser the founder marked from the demand signal, one address at a time, by hand.',
  },
  {
    file: 'src/lib/ai/handoff.ts',
    kind: 'operations',
    purpose: 'platform_operations',
    reason: 'Hands a support conversation to the platform support address.',
  },
  {
    file: 'src/lib/health/runner.ts',
    kind: 'operations',
    purpose: 'platform_operations',
    reason: 'The health heartbeat and fault alerts, to the platform alert address.',
  },
  {
    file: 'src/lib/notifications/platform-send.ts',
    kind: 'operations',
    purpose: 'platform_operations',
    reason: 'The owner notifications and the owner digest. Lane C territory.',
  },
  {
    file: 'src/app/api/cron/auth-sentinel/route.ts',
    kind: 'operations',
    purpose: 'platform_operations',
    reason: 'Alerts the platform when the auth provider drifts.',
  },
  {
    file: 'src/app/api/cron/webhook-sentinel/route.ts',
    kind: 'operations',
    purpose: 'platform_operations',
    reason: 'Alerts the platform when a webhook stops arriving.',
  },
  {
    file: 'src/app/api/cron/connect-divergence/route.ts',
    kind: 'operations',
    purpose: 'platform_operations',
    reason: 'Alerts the platform when a connected account diverges from its recorded state.',
  },
  {
    file: 'src/app/api/cron/platform-settlement-reconcile/route.ts',
    kind: 'operations',
    purpose: 'platform_operations',
    reason:
      'Alerts the platform when money has settled on its own balance that nothing records as owed onward to an organiser (MONEY FIX A3 layer three). It reaches one address, the alert destination, and never an organiser or a buyer: the finding is that the platform books are wrong, and until that is investigated there is no fact to tell anybody else.',
  },
  {
    file: 'src/lib/campaigner/sink.ts',
    kind: 'transport',
    purpose: '',
    reason:
      'The campaigner transport adapter (close-out GA4). It delivers whatever it is handed and decides nothing: in test mode it refuses every address outside the test domain, in hold mode it is never created, and in live mode it calls the Resend transport. The consent decision is taken by src/lib/campaigner/run.ts before anything reaches here.',
  },
  {
    file: 'src/lib/campaigner/run.ts',
    kind: 'marketing',
    purpose: 'facilitated_event_marketing',
    reason:
      'The campaign pacing runner (close-out GA4). It is the marketing path: it asks the resolver about every recipient at SEND time, not only at admission to the allowlist, so a withdrawal taken five minutes ago takes effect on this run rather than the next campaign.',
  },
] as const

/** Every path that must call the resolver in its own file. */
export function marketingSendPaths(): SendPathEntry[] {
  return SEND_PATHS.filter((path) => path.kind === 'marketing')
}

export function findSendPath(file: string): SendPathEntry | null {
  return SEND_PATHS.find((path) => path.file === file) ?? null
}
