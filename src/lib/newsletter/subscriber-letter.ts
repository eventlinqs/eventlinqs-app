import { buildDigestEmailHtml, type DigestEdition, type DigestEvent } from '@/lib/broadcast/digest'
import { buildWhatsOn, type WhatsOnInput } from './whats-on'
import { newsletterLinks } from './edition'
import { broadcastProblems } from '@/lib/email/broadcast'

/**
 * ONE SUBSCRIBER'S EDITION (law 45 (a), law 46). The edition is read once per city (src/lib/newsletter/edition.ts
 * readWhatsOnEdition); each reader's own links are put in here: their unsubscribe link and the Manage link, both by the
 * token their consent row carries, so the one click pair in the headers, the body link and the Manage page all name the
 * same person. While design A is not live for subscribers (./design-a-live.ts), `designA` is null and the built digest
 * is the letter, as it has been. Pure.
 */
export function subscriberLetter(input: {
  readonly origin: string
  readonly edition: DigestEdition
  readonly citySlug: string
  readonly cityName: string
  readonly period: { readonly start: string; readonly end: string }
  readonly token: string
  readonly events: DigestEvent[]
  readonly designA: { readonly edition: WhatsOnInput; readonly period: { readonly start: string } } | null
}): { readonly subject: string; readonly html: string; readonly text: string } {
  const unsubscribeUrl = `${input.origin}/unsubscribe/digest/${input.token}`
  if (input.designA) {
    const { subject, html, text } = buildWhatsOn({
      ...input.designA.edition,
      unsubscribeUrl,
      ...newsletterLinks(input.origin, { edition: input.edition, citySlug: input.citySlug, periodStart: input.designA.period.start, recipientToken: input.token }),
    })
    // The broadcast rule (src/lib/email/broadcast.ts; the PM's 15:35 ruling 1): a design A edition that fails it is never
    // sent; the send's own catch records the failure for that reader, so it fails closed, loudly.
    const problems = broadcastProblems({ html, text, unsubscribeUrl })
    if (problems.length > 0) throw new Error(`the edition fails the broadcast rule: ${problems.join('; ')}`)
    return { subject, html, text }
  }
  return buildDigestEmailHtml({ cityName: input.cityName, events: input.events, origin: input.origin, edition: input.edition, period: { ...input.period }, unsubscribeUrl })
}
