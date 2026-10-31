import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { programToCome, remindMeHeading } from '@/lib/walk-in/remind-me'

/*
 * A PROGRAM IS PROMISED ONLY WHERE ONE IS COMING (the CONTROLLER's 17:55 (6); looked at on live 31 October 2026 at 390:
 * Kaze Karaoke Saturday Nights, a weekly karaoke night, offered 'Program sent when it lands' and 'We send the full
 * timetable when The Cattleyards Inn releases it'; no timetable is coming for a karaoke night). AMCF's guide says its
 * timetable is still to come, so AMCF keeps the promise. Every other walk-in night promises only what is true: one
 * reminder the day before and a note if it is called off. The page and the stored consent use the same rule.
 */
describe('a program still to come', () => {
  it('is promised only when the guide says a program is coming and it is not out yet', () => {
    expect(programToCome({ program_published_at: null, program_note: "Times are AMCF's published festival hours. The full timetable is still to come from AMCF." })).toBe(true)
    expect(programToCome({ program_published_at: '2026-11-10T00:00:00Z', program_note: 'x' })).toBe(false)
    expect(programToCome({ program_published_at: null, program_note: null })).toBe(false)
    expect(programToCome({ program_published_at: null, program_note: '  ' })).toBe(false)
    expect(programToCome(null)).toBe(false)
  })

  it('a night with no program coming reads the reminder words', () => {
    expect(remindMeHeading(!programToCome({ program_published_at: null, program_note: null }))).toBe('Get a reminder the day before')
  })

  it('the page and the server action both judge by it', () => {
    expect(readFileSync('src/components/events/walk-in/walk-in-event-page.tsx', 'utf8')).toMatch(/const programPublished = !programToCome\(guide\)/)
    const action = readFileSync('src/app/actions/event-reminder.ts', 'utf8')
    expect(action).toMatch(/program_published: !programToCome\(guide\)/)
    expect(action).toMatch(/guide:event_guides\(program_published_at, program_note\)/)
  })
})
