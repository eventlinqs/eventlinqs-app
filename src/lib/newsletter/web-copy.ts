import { escapeHtml } from '@/lib/email/escape'
import { fromZonedInputValue } from '@/lib/dates/event-time'
import { newsletterCity } from './manage'

/**
 * THE EDITION'S WEB COPY ('View in browser'; the PM's order of 21 November 2026, about 03:30: "/newsletter/weekend/<city>/
 * <date> (the web copy, which View in browser opens)"). /newsletter/<edition>/<city>/<date> draws the same builder from
 * the same readers, as of that day's send at 07:00 Melbourne time (law 45). Pure: which answer a request gets.
 *   - an edition that is not THE WEEK or THE WEEKEND, or a city with no edition: 404;
 *   - a date that is not a day, a day before the first edition, or a day whose 07:00 has not come: the designed empty
 *     state, which links the city's guide, never a 404 for a city that has one;
 *   - otherwise the edition, read as of its send.
 */
export const FIRST_EDITION_DAY = '2026-11-21'
const SEND_HOUR = '07:00'

export type WebCopyPlan =
  | { readonly kind: 'not_found' }
  | { readonly kind: 'empty'; readonly city: { readonly slug: string; readonly name: string }; readonly edition: 'week' | 'weekend'; readonly reason: 'not_a_day' | 'before_the_first' | 'not_yet_sent' }
  | { readonly kind: 'edition'; readonly city: { readonly slug: string; readonly name: string }; readonly edition: 'week' | 'weekend'; readonly sendAt: Date }

export function planWebCopy(params: { readonly edition: string; readonly city: string; readonly date: string }, now: Date): WebCopyPlan {
  const edition = params.edition === 'week' || params.edition === 'weekend' ? params.edition : null
  const city = newsletterCity(params.city)
  if (!edition || !city) return { kind: 'not_found' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.date) || Number.isNaN(Date.parse(`${params.date}T12:00:00Z`))) return { kind: 'empty', city, edition, reason: 'not_a_day' }
  if (params.date < FIRST_EDITION_DAY) return { kind: 'empty', city, edition, reason: 'before_the_first' }
  const sendAt = new Date(fromZonedInputValue(`${params.date}T${SEND_HOUR}`, 'Australia/Melbourne'))
  if (Number.isNaN(sendAt.getTime())) return { kind: 'empty', city, edition, reason: 'not_a_day' }
  if (sendAt.getTime() > now.getTime()) return { kind: 'empty', city, edition, reason: 'not_yet_sent' }
  return { kind: 'edition', city, edition, sendAt }
}

const WORDS: Record<'not_a_day' | 'before_the_first' | 'not_yet_sent' | 'unreadable', string> = {
  not_a_day: 'This link does not name an edition.',
  before_the_first: 'There was no edition on that day: the newsletter began on 21 November 2026.',
  not_yet_sent: 'This edition has not gone out yet. It goes at 7am on its day.',
  unreadable: 'This edition could not be read just now. Try again in a minute.',
}

/** The designed empty state, in the edition's own colours: what happened and the city's guide one press away. */
export function webCopyEmptyHtml(input: { readonly origin: string; readonly cityName: string; readonly citySlug: string; readonly edition: 'week' | 'weekend'; readonly reason: keyof typeof WORDS }): string {
  const name = input.edition === 'weekend' ? 'THE WEEKEND' : 'THE WEEK'
  const city = escapeHtml(input.cityName)
  return `<!DOCTYPE html>
<html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>${name}, ${city} | EventLinqs</title></head>
<body style="margin:0;padding:0;background:#EFEDE8;font-family:'Manrope','Helvetica Neue',Helvetica,Arial,sans-serif">
<div style="max-width:640px;margin:0 auto;background:#FFFFFF">
<div style="background:#0A1628;padding:30px 28px">
<div style="font:800 24px/26px 'Archivo','Arial Black',Arial,sans-serif;letter-spacing:.02em;color:#FFFFFF">EVENTLINQS<span style="color:#E8B738">.</span></div>
<div style="font:800 34px/38px 'Archivo','Arial Black',Arial,sans-serif;color:#FFFFFF;margin-top:24px">${name}<br><span style="color:#E8B738">${city}</span></div>
</div>
<div style="padding:28px">
<p data-web-copy-empty style="font:500 17px/26px 'Manrope','Helvetica Neue',Helvetica,Arial,sans-serif;color:#0A1628;margin:0">${escapeHtml(WORDS[input.reason])}</p>
<p style="margin:24px 0 0"><a href="${escapeHtml(`${input.origin}/city/${input.citySlug}`)}" style="display:inline-block;background:#0A1628;color:#FFFFFF;font:700 15px/20px 'Manrope','Helvetica Neue',Helvetica,Arial,sans-serif;padding:14px 22px;border-radius:999px;text-decoration:none">See what&#8217;s on in ${city} &#8594;</a></p>
<p style="margin:20px 0 0;font:500 14px/20px 'Manrope','Helvetica Neue',Helvetica,Arial,sans-serif;color:#5B6474"><a href="${escapeHtml(`${input.origin}/newsletter`)}" style="color:#6F5409">About the newsletter</a></p>
</div></div></body></html>`
}
