import { contactAddress } from './sender'

/**
 * THE BROADCAST RULE (the PM's 15:35 of 21 November 2026, ruling 1: "the newsletter is a BROADCAST, not a letter: design A
 * (Lawal's own reference, approved 'to the T', 04:15) is EXEMPT from letterProblems' greeting and sign off. In their place
 * the broadcast check holds: the sender named in the footer with its contact address, a working one click unsubscribe,
 * the consent basis recorded per subscriber (law 50), no dashes, no placeholder, every link a live route (the crawler).
 * Written as a named broadcast rule with its test, never a blanket bypass.").
 *
 * What this judges, on the edition's own HTML and plain text as one subscriber receives it:
 *   1. the sender named in the footer with its contact address (EventLinqs and hello@ on the sending domain);
 *   2. the reader's own unsubscribe link in both parts (the one click pair in the headers is set by the send itself, from
 *      the same token: src/app/api/cron/weekly-digest/route.ts);
 *   3. no em dash, no en dash, no spaced hyphen in what a reader sees;
 *   4. no placeholder: undefined, null, NaN, [object, TBA, {{ or a bracketed fill like [event].
 * What it cannot see, and where each is held instead: the consent basis per subscriber (the send plan reads only readers
 * the consent ledger permits, src/lib/consent; scripts/guards/consent-ledger-is-evidence.mjs), and every link a live route
 * (tests/unit/newsletter/edition-links-have-routes.test.ts, and the crawler on production). Pure.
 */
export function broadcastProblems(message: { readonly html: string; readonly text: string; readonly unsubscribeUrl: string }): string[] {
  const problems: string[] = []
  const visible = visibleText(message.html)
  const contact = contactAddress('hello')
  for (const [part, body] of [['html', visible], ['text', message.text]] as const) {
    const tail = body.slice(-1200)
    if (!/EventLinqs/.test(tail) || !tail.includes(contact)) problems.push(`the ${part} footer does not name EventLinqs with ${contact}`)
    if (/[\u2013\u2014]/.test(body)) problems.push(`the ${part} part carries an em or en dash`)
    if (/\s-\s/.test(body)) problems.push(`the ${part} part carries a spaced hyphen`)
    const fill = /\b(undefined|NaN)\b|\[object|\bTBA\b|\{\{|\[(?:[a-z][a-z ]{1,30})\]|(?:^|\s)null(?:\s|$)/m.exec(body)
    if (fill) problems.push(`the ${part} part carries a placeholder (${fill[0].trim()})`)
  }
  if (!message.html.includes(`href="${escapeAttribute(message.unsubscribeUrl)}"`)) problems.push('the html part has no link to the reader\'s own unsubscribe')
  if (!message.text.includes(message.unsubscribeUrl)) problems.push('the text part has no link to the reader\'s own unsubscribe')
  return problems
}

function escapeAttribute(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** What a reader sees of the HTML: the body's text, with the head, styles and tags removed and entities read. */
function visibleText(html: string): string {
  return html
    .replace(/<head[\s\S]*?<\/head>/i, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8217;|&rsquo;/g, '\u2019')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+/g, ' ')
}
