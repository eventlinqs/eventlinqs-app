import { describe, expect, test } from 'vitest'
import { timeLabel } from '@/components/stream/stream-room'

/**
 * The room stamps every message in the EVENT's zone (Scope v5 3.11, the watch
 * page). The first version formatted in the runtime's zone, which is UTC on
 * the server and the reader's in the browser, and the platform's
 * no-clock-during-render test caught it. These pin the zone the label uses.
 */
const NINE_OH_FIVE_UTC = '2026-09-04T09:05:00.000Z'
const flat = (s: string) => s.replace(/\s+/g, ' ').toLowerCase()

describe('timeLabel', () => {
  test('formats the instant in the zone it is given, not the runtime zone', () => {
    expect(flat(timeLabel(NINE_OH_FIVE_UTC, 'Australia/Melbourne'))).toBe('7:05 pm')
    expect(flat(timeLabel(NINE_OH_FIVE_UTC, 'Australia/Perth'))).toBe('5:05 pm')
  })

  test('two zones disagree about the same instant, which is why the zone is threaded', () => {
    expect(timeLabel(NINE_OH_FIVE_UTC, 'Australia/Melbourne')).not.toBe(timeLabel(NINE_OH_FIVE_UTC, 'Australia/Perth'))
  })

  test('an unreadable stamp renders as nothing rather than throwing in the room', () => {
    expect(timeLabel('not a date', 'Australia/Melbourne')).toBe('')
    expect(timeLabel(NINE_OH_FIVE_UTC, 'Not/AZone')).toBe('')
  })
})
