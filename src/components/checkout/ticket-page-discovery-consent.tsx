import type { PlatformConsentWording } from './marketing-consent'

/**
 * THE DISCOVERY QUESTION, ASKED ON THE TICKET PAGE.
 *
 * AQ1's reversal condition: "a conversion fall greater than two percent moves
 * the capture off checkout, it does not remove it". This is where it moves to.
 * It renders only while public.marketing_capture_placement says ticket_page,
 * and the payment step stops asking on the same decision, so the question is
 * never put twice.
 *
 * A SERVER COMPONENT, AND AN UNCONTROLLED CHECKBOX, DELIBERATELY. It is handed
 * to the ticket selector as a slot, the way the checkout is handed its trust
 * signals, so the event page pays nothing in client bytes for a question that
 * is not being asked there. The selector reads the box once, at the moment the
 * buyer proceeds.
 *
 * It follows from that shape, rather than being enforced on top of it, that the
 * box is unticked: there is no state, no defaultChecked and no checked
 * attribute, so the server HTML itself carries the proof. AQ1 says "never pre
 * ticked, never bundled with the terms, never inferred" and the cheapest way to
 * keep a rule is to build something that cannot break it.
 *
 * THE SENTENCE IS NEVER TYPED HERE. Both strings come from the immutable
 * versioned record in public.consent_wordings, so the sentence the buyer reads
 * is the sentence stored as evidence.
 */

export function TicketPageDiscoveryConsent({ wording }: { wording: PlatformConsentWording }) {
  return (
    <div className="mt-4 rounded-xl border border-ink-100 bg-ink-50/60 p-4">
      <label className="flex min-h-[44px] cursor-pointer items-start gap-3">
        <input
          id="ticket-page-discovery-consent"
          name="ticket-page-discovery-consent"
          type="checkbox"
          data-discovery-consent=""
          className="mt-0.5 h-5 w-5 shrink-0 rounded border-ink-300 text-gold-500 focus:ring-2 focus:ring-gold-500"
        />
        <span className="text-sm font-medium text-ink-900">{wording.label}</span>
      </label>
      <p
        className="mt-2 text-xs leading-relaxed text-ink-500"
        data-consent-wording-version={wording.version}
      >
        {wording.body}
      </p>
      <p className="mt-2 text-xs text-ink-400">
        Optional. It does not change your tickets or your total.
      </p>
    </div>
  )
}
