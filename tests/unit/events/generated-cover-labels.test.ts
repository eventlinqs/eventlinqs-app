// THE DESIGNED COVER PRINTS THE ORGANISER'S CURRENT DETAILS, not the saved row.
//
// A cover carrying stale details is worse than no cover, so the wizard sends
// the values as they stand in the form and the renderer formats them. The form
// holds a LOCAL wall clock (`2026-09-12T20:00`, straight out of a datetime-local
// input) and the card prints "Saturday 12 September" and "8:00 pm".
//
// NO ZONE CONVERSION HAPPENS, and that is the property under test. The wall
// clock in the event's own zone is what everyone standing in that room reads.
// Converting it to an instant and back would put a 9pm Perth event on the wrong
// DAY for a machine in Sydney, which is the exact class of defect
// src/lib/dates/event-time.ts exists to remove.

import { describe, it, expect } from 'vitest'

import { labelsFromLocal } from '@/lib/events/generated-cover'

describe('the designed cover date labels', () => {
  it('reads a local wall clock in the card language', () => {
    expect(labelsFromLocal('2026-09-12T20:00')).toEqual({
      dateLabel: 'Saturday 12 September',
      timeLabel: '8:00 pm',
    })
  })

  it('does not shift the day, whatever zone the machine is in', () => {
    // 00:05 is the case a zone conversion would move to the previous day.
    expect(labelsFromLocal('2026-09-12T00:05')).toEqual({
      dateLabel: 'Saturday 12 September',
      timeLabel: '12:05 am',
    })
    // 23:55 is the case it would move to the next.
    expect(labelsFromLocal('2026-09-12T23:55').dateLabel).toBe('Saturday 12 September')
  })

  it('accepts a space separator as well as a T', () => {
    expect(labelsFromLocal('2026-09-12 20:00').dateLabel).toBe('Saturday 12 September')
  })

  it('returns empty labels rather than throwing on nothing usable', () => {
    // The renderer falls back to the saved row when a label is empty, so an
    // empty string is the correct answer and an exception is not: a half-filled
    // form must never stop an organiser making a cover.
    expect(labelsFromLocal(null)).toEqual({ dateLabel: '', timeLabel: '' })
    expect(labelsFromLocal(undefined)).toEqual({ dateLabel: '', timeLabel: '' })
    expect(labelsFromLocal('')).toEqual({ dateLabel: '', timeLabel: '' })
    expect(labelsFromLocal('not a date')).toEqual({ dateLabel: '', timeLabel: '' })
  })
})
