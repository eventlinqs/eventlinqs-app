import { formatClock } from '@/lib/walk-in/guide'
import type { SeriesRule } from './occurrences'

/**
 * A HOST'S REGULAR NIGHT IN WORDS (WI2 Part 3a, the venue page: "its regular
 * nights, each with its rule in words ('Every Wednesday, 7pm to 10pm')",
 * docs/walk-in/WI2-PLAN.md section 9). Pure, so the page and its tests say the
 * same sentence. Times are the stored "HH:MM[:SS]" in the series' own zone,
 * written as the walk-in page writes them (formatClock: 7pm, 7:30pm). A night
 * with no stated finish says only when it starts, never an invented end.
 */

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
const ORDINAL: Record<string, string> = { '1': 'First', '2': 'Second', '3': 'Third', '4': 'Fourth' }

export type SeriesForWords = {
  rule: SeriesRule
  /** 0 Sunday to 6 Saturday. */
  day: number
  /** "HH:MM" or "HH:MM:SS". */
  starts_at: string
  ends_at: string | null
  /** "YYYY-MM-DD", the one date of a series that happens once. */
  anchor_date: string
}

const clock = (t: string) => formatClock(t.slice(0, 5))

export function seriesTimesInWords(s: Pick<SeriesForWords, 'starts_at' | 'ends_at'>): string {
  return s.ends_at ? `${clock(s.starts_at)} to ${clock(s.ends_at)}` : `from ${clock(s.starts_at)}`
}

export function seriesRuleInWords(s: SeriesForWords): string {
  const day = DAYS[s.day] ?? ''
  const times = seriesTimesInWords(s)
  switch (s.rule) {
    case 'weekly':
      return `Every ${day}, ${times}`
    case 'fortnightly':
      return `Every second ${day}, ${times}`
    case 'monthly-last':
      return `Last ${day} of the month, ${times}`
    case 'once': {
      const date = new Date(`${s.anchor_date}T12:00:00Z`)
      const when = new Intl.DateTimeFormat('en-AU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(date)
      return `${when}, ${times}`
    }
    default: {
      const nth = ORDINAL[s.rule.slice('monthly-'.length)]
      return `${nth} ${day} of the month, ${times}`
    }
  }
}

/** "Last checked 18 October", from the stored "YYYY-MM-DD", or null when never checked. */
export function lastCheckedInWords(isoDate: string | null): string | null {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null
  const date = new Date(`${isoDate}T12:00:00Z`)
  return `Last checked ${new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(date)}`
}
