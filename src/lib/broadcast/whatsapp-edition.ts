import type { DigestEvent } from './digest'

/**
 * THE WEEKLY ROUNDUP'S WHATSAPP EDITION, DRAFTED FOR LAWAL TO POST.
 *
 * The plan ("EventLinqs, the discovery-to-booking foundation", locked 27 October 2026, Sprint 2 row 9): "The weekly
 * roundup per city: email to subscribers, the WhatsApp edition drafted for Lawal", and Retention: "Lawal creates the
 * channel; EventLinqs drafts each edition from the week's listings". WhatsApp Channels cannot be posted to by any
 * build today (the 13:14 (d)), so this is text he copies into the channel, or shares as a link if no channel is
 * offered to him.
 *
 * PURE. The events are the same ones the weekly email carries (src/lib/broadcast/digest.ts fetchDigestEvents: the
 * city's published, public listings of the week, seed data never), in the same order and with the same links, so the
 * channel and the email never disagree about what is on.
 *
 * Plain text, because a channel post is plain text: one line a fact, no markup, every link the event's own.
 */
export function whatsappEdition(input: { readonly cityName: string; readonly events: readonly DigestEvent[]; readonly cityUrl: string }): string {
  if (input.events.length === 0) return ''
  const lines: string[] = [`What's on in ${input.cityName} this week`, '']
  input.events.forEach((e, i) => {
    lines.push(`${i + 1}. ${e.title}`)
    lines.push(`${e.dateLabel}, ${e.venueLabel}. ${e.priceLabel}.`)
    lines.push(e.url)
    lines.push('')
  })
  lines.push(`Everything on in ${input.cityName}: ${input.cityUrl}`)
  return lines.join('\n')
}

/**
 * The share link that carries the edition where no channel is offered, in the form the event share bar and the Launch
 * Kit already use (src/components/features/events/event-share-bar.tsx, src/components/launch-kit/launch-share-row.tsx).
 * WhatsApp's own page for it ("How to use click to chat", https://faq.whatsapp.com/5913398998672934) was fetched on
 * 27 October 2026 and renders its text by script, so its wording is UNSOURCED here; the form is the platform's own.
 */
export function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}
