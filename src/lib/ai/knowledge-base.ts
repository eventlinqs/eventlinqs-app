import 'server-only'
import { helpTopics } from '@/lib/help-content'

/**
 * Support knowledge base. Rendered from the SAME data that powers the Help
 * Centre (src/lib/help-content.ts) so the assistant can never drift from
 * the published help pages, then extended with hard platform boundaries
 * verified against the actual codebase, and the live fee label resolved at
 * request time through the one fee resolver (Fee system law: never a
 * hardcoded fee number).
 */

function renderHelpTopics(): string {
  const parts: string[] = []
  for (const topic of helpTopics) {
    parts.push(`## ${topic.title}`)
    for (const article of topic.articles) {
      parts.push(`Q: ${article.q}\nA: ${article.a}`)
    }
  }
  return parts.join('\n\n')
}

// Rendered once per server instance; helpTopics is static data.
const HELP_SECTIONS = renderHelpTopics()

/**
 * Platform boundaries the assistant must respect. Each line is verified
 * against the real codebase and flows. If a capability is not listed as
 * existing, the assistant must say it does not exist and offer the human
 * handoff instead of guessing.
 */
const PLATFORM_BOUNDARIES = `## What the platform can and cannot do (verified)

Things that exist and how to reach them:
- Buying tickets: from any event page. Guest checkout works without an account.
- Finding tickets: signed-in users go to My Tickets (/tickets). Tickets are also emailed with a QR code.
- Ticket transfer: My Tickets, open the ticket, choose Transfer or gift this ticket. The old QR code stops working immediately.
- Refunds: requested from the organiser. The organiser sets the refund policy on the event page and processes refunds from their dashboard. EventLinqs support can help chase an unresponsive organiser.
- Event discovery: browse /events, by city (/cities), by category (/categories), by community (/communities), or the personalised feed (/feed) for signed-in users.
- Organiser sign-up: Event Organisers in the header, then Start selling tickets. Free to start.
- Attendee data export: organisers can export their attendee list from the event dashboard, including marketing consent status. Organisers own their attendee relationships.
- Human support: the contact form on /contact, or ask this assistant to pass the conversation to the support team.

Things that do NOT exist (never imply otherwise):
- No phone support line.
- No ticket resale marketplace. Reselling above face value is against the terms of use.
- No cash or bank-transfer payments at checkout. Card payment through Stripe only.
- No editing a ticket holder name after purchase except via the transfer flow.
- The assistant itself cannot look up an order, issue a refund, resend a ticket, or change any account or booking. Those need the support team or the organiser: offer the handoff.`

/**
 * `feeLabel` is the LIVE label resolved at request time, or undefined when the
 * pricing lookup could not be made. It is never defaulted to a written-down
 * number here: this module renders the knowledge base, and a knowledge base that
 * restates a fee drifts the day the fee changes, which is exactly what happened
 * on 15 August 2026 when the second fee was deleted and this file went on
 * describing it.
 */
export function buildSupportKnowledgeBase(feeLabel?: string): string {
  const fees = feeLabel
    ? `## Current fee (live value, resolved from the platform pricing engine for this conversation)
- ONE fee on paid tickets, and it is the only one: ${feeLabel} per ticket, card processing included.
- There is NO separate payment processing fee, and no second fee of any kind. If someone asks about a processing fee, say plainly that there is not one: the single fee above covers card processing.
- The organiser keeps the full face value of the ticket when the fee is passed on to the buyer, which is the default.
- The buyer always sees the true all-in total on the ticket selection screen before checkout (Australian all-in pricing rules).
- Free events are free: no fee of any kind.
- Organisers can choose to absorb the fee or pass it on to buyers, per event.`
    : `## Current fee (NOT AVAILABLE in this conversation)
- The live pricing lookup did not succeed, so you do NOT know the current fee.
- Do not quote, estimate or guess any fee figure. Send the person to /pricing, which reads the live value.
- You may still say these things, which do not depend on the figure: there is only ONE fee on a paid ticket, card processing is included in it, free events carry no fee at all, the buyer sees the true all-in total before checkout, and the organiser chooses whether the fee is passed to the buyer or absorbed.`

  return [
    '# EventLinqs support knowledge base',
    HELP_SECTIONS,
    PLATFORM_BOUNDARIES,
    fees,
  ].join('\n\n')
}
