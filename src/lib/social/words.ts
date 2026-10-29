/**
 * A POST'S WORDS STATE ONLY WHAT THE EVENT'S OWN ROW HOLDS (item 11, the social engine; docs/SOCIAL-ENGINE.md).
 *
 * Every run of digits a caption states, the post's own link taken out, is a run of digits one of the post's facts
 * states: the event's name, its date and time on Melbourne's clock, its venue, and its price only where the price was
 * read fresh. So no person and no model types a number the listing does not hold (the ACCC: "Any information a
 * business posts on social media must be accurate and truthful"). The database holds the same rule on every version
 * (social_drafts_hold_their_facts, 20261027233001); this is its twin, so the admin page says why before it asks.
 *
 * And the house copy rules, as the anti-tell gate holds them for every EventLinqs surface: no em or en dash, no
 * exclamation mark, never the banned word.
 */

const DIGITS = /[0-9]+/g
/** The en and em dash, named by code point so this file carries neither. */
const LONG_DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)

/** Every run of digits the facts state. */
export function digitsHeld(facts: readonly string[]): Set<string> {
  const held = new Set<string>()
  for (const f of facts) for (const m of f.match(DIGITS) ?? []) held.add(m)
  return held
}

/** The runs of digits the caption states that no fact holds, the link's own digits not counted. */
export function strayNumbers(caption: string, link: string | null, facts: readonly string[]): string[] {
  const said = link === null || link === '' ? caption : caption.split(link).join(' ')
  const held = digitsHeld(facts)
  return [...new Set(said.match(DIGITS) ?? [])].filter((d) => !held.has(d))
}

/**
 * Whether OUR words carry the banned word. An organiser's event title and organisation name are their names, quoted
 * exactly as the listing carries them (the project manager's ruling, 29 October 2026 14:52, made for AMCF's own
 * title); those exact names and every link are taken out first, and what is left is judged. A name
 * written any other way is our words. The one rule for a post's words and a campaign piece (campaign.ts pieceRefusal).
 */
export function carriesBannedWord(text: string, names: readonly (string | null | undefined)[]): boolean {
  let ours = text.replace(/https?:\/\/\S+/g, ' ')
  const exact = names.filter((n): n is string => typeof n === 'string' && n.trim() !== '').sort((a, b) => b.length - a.length)
  for (const name of exact) ours = ours.split(name).join(' ')
  return /cultur/i.test(ours)
}

/**
 * An organiser's own description, where our words may quote it: never where it carries the banned word outside the
 * night's exact names (only the title and the organisation name are their names). Then the words go without it, so a
 * night is still told and its post or piece is never held for a sentence we need not repeat.
 */
export function quotableSummary(summary: string | null | undefined, names: readonly (string | null | undefined)[]): string | null {
  if (typeof summary !== 'string' || summary.trim() === '') return null
  return carriesBannedWord(summary, names) ? null : summary
}

/** Why these words cannot be kept, in the admin's own words, or null where they can. names: the exact names quoted (carriesBannedWord). */
export function wordsRefusal(caption: string, link: string | null, facts: readonly string[], names: readonly (string | null | undefined)[] = []): string | null {
  const text = caption.trim()
  if (text.length === 0) return 'The words are empty.'
  if (text.length > 2200) return 'Instagram takes at most 2,200 characters in a caption.'
  if (LONG_DASH.test(text)) return 'The words carry a long dash. Use a comma, a colon or a full stop.'
  if (text.includes('!')) return 'The words carry an exclamation mark.'
  if (carriesBannedWord(text, names)) return 'The words carry a banned word. Say community.'
  if (link !== null && link !== '' && !text.includes(link)) return 'The words must carry the post’s own link, so what it brings is counted.'
  const stray = strayNumbers(text, link, facts)
  if (stray.length > 0) return `The words state ${stray.join(', ')}, which the listing does not hold.`
  return null
}
