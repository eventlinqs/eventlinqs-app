import type { KnownEvent } from './collect'

/**
 * A NIGHT THAT HAS LEFT ITS SOURCE'S LIST IS HELD AT ONCE (the PM's 07:00 of 15 November 2026, item 4 (b): "a night that has
 * LEFT its source's list is held AT ONCE (night hold, reason 'left source', hidden, never deleted). This is the real BRAZJAZ
 * fix"). BRAZJAZ stood public for days after The JazzLab's list stopped carrying it, because freshness then ran 22 days from
 * any check. Pure: the collection run (./collect-run.ts) reads the list and the store writes the holds.
 *
 * A night has left when ALL of these hold:
 *   - its series was published from this very source (the candidate that published it names the source);
 *   - it is published and public, and still to come;
 *   - this read of the source was COMPLETE (the caller decides: read, not stopped, no page refused or skipped, no cap or
 *     deadline reached), so a list that was only partly read never hides anything;
 *   - it starts no later than the furthest night this read carried, so a list that only shows its next weeks never hides
 *     the nights beyond them;
 *   - this read did not carry it (no plan names it: unchanged, new links, or changed facts all count as carried).
 * And never when the list looks partial: more than LEFT_AT_ONCE_MAX nights missing that are also more than half of the
 * source's own nights inside the read's span. A layout change or an empty page is then said, and nothing is held.
 */
export const LEFT_AT_ONCE_MAX = 3

export type LeftVerdict =
  | { kind: 'left'; nights: KnownEvent[] }
  | { kind: 'partial'; missing: number; of: number }
  | { kind: 'none' }

export function nightsThatLeft(input: {
  sourceId: string
  known: readonly KnownEvent[]
  /** The event ids this read's plans name (it carried them). */
  carried: ReadonlySet<string>
  /** The furthest start this read carried, as an instant; null when it carried none. */
  furthest: string | null
  now: Date
}): LeftVerdict {
  const { sourceId, known, carried, furthest, now } = input
  if (!furthest) return { kind: 'none' }
  const until = Date.parse(furthest)
  const t = now.getTime()
  const own = known.filter(
    (k) =>
      k.listedPublic === true &&
      (k.sourceIds ?? []).includes(sourceId) &&
      Date.parse(k.startsAt) > t &&
      Date.parse(k.startsAt) <= until,
  )
  const missing = own.filter((k) => !carried.has(k.eventId))
  if (missing.length === 0) return { kind: 'none' }
  if (missing.length > LEFT_AT_ONCE_MAX && missing.length * 2 > own.length) return { kind: 'partial', missing: missing.length, of: own.length }
  return { kind: 'left', nights: missing }
}

/** The open 'left_source' holds this read releases: every night it carried that one holds. Pure. */
export function nightsBackOnTheList(held: readonly { eventId: string }[], carried: ReadonlySet<string>): string[] {
  return held.filter((h) => carried.has(h.eventId)).map((h) => h.eventId)
}
