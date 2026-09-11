/**
 * Event tags: two tags may never differ only by case (close-out UX1.3).
 *
 * WHY THIS FILE EXISTS. The first real outside organiser event on production
 * carried both `#African` and `#african`. Each rendered as its own pill, each
 * linked to its own `/events?q=` search, and the two split the audience for one
 * idea in half. The cause is one line in the event form:
 *
 *     tags: Array.from(new Set([...]))
 *
 * A JavaScript Set compares strings exactly, so `African` and `african` are two
 * members. Deduplication looked like it was happening and was not.
 *
 * THE RULE. Case-insensitive uniqueness, FIRST SPELLING WINS. The organiser's
 * own capitalisation is kept, because `RnB`, `Afrobeats` and `First Nations`
 * are how people write them and lowercasing every tag would make the platform
 * look careless in exactly the places CLAUDE.md Law 3 cares about. What is
 * dropped is the later duplicate, never the first spelling.
 *
 * WHERE IT IS ENFORCED. Here, at the server action, which is the real boundary
 * a form cannot bypass; and again in the database, by the
 * `events_tags_case_distinct` CHECK constraint, which no writer of any kind can
 * bypass. The form is a convenience, the action is the boundary, the constraint
 * is the guarantee.
 */

/** The maximum tags one event may carry, so a paste cannot become a wall. */
export const MAX_EVENT_TAGS = 20

/** The maximum length of a single tag. */
export const MAX_TAG_LENGTH = 40

/**
 * Normalise a list of organiser-supplied tags.
 *
 * Trims, drops empties, strips a leading hash the organiser typed out of habit,
 * removes case-insensitive duplicates keeping the first spelling, and caps the
 * count. Order is otherwise preserved, because the organiser chose it.
 */
export function normaliseTags(input: readonly (string | null | undefined)[] | null | undefined): string[] {
  if (!input) return []
  const seen = new Set<string>()
  const out: string[] = []

  for (const raw of input) {
    if (typeof raw !== 'string') continue
    // People type "#African" because that is how the pill reads back to them.
    const tag = raw.trim().replace(/^#+/, '').trim().slice(0, MAX_TAG_LENGTH).trim()
    if (!tag) continue
    const key = tag.toLocaleLowerCase('en-AU')
    if (seen.has(key)) continue
    seen.add(key)
    out.push(tag)
    if (out.length >= MAX_EVENT_TAGS) break
  }

  return out
}

/**
 * True when a list already satisfies the rule. Used by the tests and by the
 * verification script so "normalised" is asserted rather than assumed.
 */
export function tagsAreNormalised(tags: readonly string[]): boolean {
  const keys = tags.map(t => t.toLocaleLowerCase('en-AU'))
  return new Set(keys).size === keys.length && tags.every(t => t === t.trim() && t.length > 0)
}
