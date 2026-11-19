import { createHash } from 'node:crypto'

/**
 * A DRAFT'S OWN WORDS, AND THEIR HASH (the send-a-draft route, the PM's 11:55 of 19 November 2026). The approval
 * workflow records the hash of the words the gateway cleared; the route recomputes it from the draft Graph holds at the
 * moment of sending, and sends only when the two are equal. Both sides use this one function, so a draft edited after
 * its approval is refused. Plain JavaScript, so a script on the build machine and the route on production share it.
 *
 * The words are the message's own, as the gateway judges them (C:\dev\comms-gateway\gateway.py own_part): tags become
 * line breaks or nothing, the common entities are decoded, everything from a quoted earlier message ('From: ',
 * '-----Original Message-----', 'On ... wrote:') is cut, and runs of white space become one space.
 * @param {string} html
 * @returns {string}
 */
export function draftWords(html) {
  const text = String(html ?? '')
    .replace(/<(?:br|hr)\b[^>]*>/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/\r\n?/g, '\n')
  const own = text.split(/\n\s*(?:From:\s|-----Original Message-----|On .{5,80} wrote:)/)[0]
  return own.replace(/\s+/g, ' ').trim()
}

/**
 * sha256 of a draft's own words, hex.
 * @param {string} html
 * @returns {string}
 */
export function draftContentHash(html) {
  return createHash('sha256').update(draftWords(html), 'utf8').digest('hex')
}
