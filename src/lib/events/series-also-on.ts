import { formatEventDateShort, type EventTimeZone } from '@/lib/dates/event-time'

/**
 * THE LATER NIGHTS OF A SERIES, ON ITS ONE CARD (the photo system's P4: a recurring series is one event, "its later
 * dates named on that card"; src/lib/events/one-card-per-event.ts gathers them). On the date line: the next night named,
 * the rest counted, so a card in a rail keeps the height of every other; every date in full in the line's title.
 */
export function seriesAlsoOn(alsoOn: readonly string[] | undefined, timezone: EventTimeZone): { words: string; every: string } | null {
  if (!alsoOn || alsoOn.length === 0) return null
  const dates = alsoOn.map((iso) => formatEventDateShort(iso, timezone))
  const rest = dates.length - 1
  return {
    words: `also ${dates[0]}${rest > 0 ? ` and ${rest} more` : ''}`,
    // Each date already carries its own comma ('Sun, 8 Nov'), so the dates are parted by semicolons.
    every: `Also on ${dates.join('; ')}`,
  }
}
