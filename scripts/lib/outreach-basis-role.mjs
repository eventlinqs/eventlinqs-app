/**
 * IS THIS ADDRESS THE ORGANISER's OWN, IN THE ROLE AN INVITATION TO LIST RELATES TO? (window 6, 29 October 2026)
 *
 * Spam Act Schedule 2 clause 4, as migration 20261028201001 records it, makes a published address a basis only when the
 * message relates to the holder's role. scripts/ops/outreach-basis.mjs used to take every address on the organiser's
 * pages, and R4 step 2 showed what that does: 23 of 98 were another council service filed under an aquatic centre, other
 * library branches, a steakhouse, an inbox for job applications. Each refusal here is one of those, said with its reason;
 * a refused address gets no basis and a line in the report, never a guess.
 *
 * roleRefusal(address, organiserName, textBefore) returns null when the address may be taken, else the reason.
 * textBefore is the page's words just before the address, where a page says what the inbox is for.
 */
const STOP = new Set(['and', 'of', 'the', 'at', 'for', 'with', 'inc', 'club', 'co'])
const NOT_EVENTS = /^(careers?|jobs?|hr|recruit\w*|accounts?|payroll|invoices?|billing|helpdesk|privacy|steakhouse|restaurant|kitchen)$/

export function roleRefusal(address, organiserName, textBefore = '') {
  const [local, domain = ''] = address.toLowerCase().split('@')
  // Only the sentence that introduces the address: a site's menu ("Join The Team", "Careers") sits before every address
  // in its footer and says nothing about what that address is for.
  const sentence = textBefore.slice(-200).split(/[.!?]\s/).pop() ?? ''
  if (/\b(resume|résumé|cv|employment|job applications?|apply for)\b/i.test(sentence)) return 'published for job applications'
  if (NOT_EVENTS.test(local)) return `a ${local} inbox (a restaurant, jobs or administration), not their events`
  // A government domain is shared by every service it runs: only the organiser's own named inbox is taken there.
  if (/\.gov\.au$/.test(domain)) {
    const words = organiserName.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean)
    const initials = words.filter((w) => !STOP.has(w)).map((w) => w[0]).join('')
    const named = local === initials || words.some((w) => w.length >= 4 && !STOP.has(w) && local === w)
    if (!named) return `a shared government domain (${domain}): only the organiser's own named inbox is taken there`
  }
  return null
}
