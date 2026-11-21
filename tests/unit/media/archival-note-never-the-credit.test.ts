import { describe, expect, it } from 'vitest'
import { archivalNote } from '@/lib/media/photo-credits'

/*
 * NO PHOTO CREDIT ON EVENT PAGES AND CARDS, BUT AN ARCHIVAL PHOTOGRAPH STILL SAYS SO (law 17 (d) as narrowed by Lawal,
 * 19 November 2026, 11:36: "You don't put no photo credit"; the project manager's ruling of 29 October 2026, 15:56: an
 * archival photograph says it is from a past festival wherever it is drawn). The register's words 'AMCF, past festival'
 * print as 'From a past festival': never the name, never 'Photo:'.
 */
describe('archivalNote', () => {
  it('keeps only that the photograph is from a past one, never the name', () => {
    expect(archivalNote('AMCF, past festival')).toBe('From a past festival')
    expect(archivalNote('Photo: AMCF, past festival (2024)')).toBe('From a past festival (2024)')
    expect(archivalNote('The Comic\'s Lounge, past event')).toBe('From a past event')
  })

  it('speaks of a set in the plural', () => {
    expect(archivalNote('AMCF, past festival', { plural: true })).toBe('From past festivals')
    expect(archivalNote('Yoga studio, past class', { plural: true })).toBe('From past classes')
    expect(archivalNote('AMCF, past festivals', { plural: true })).toBe('From past festivals')
  })

  it('prints nothing for a credit that is only a name', () => {
    expect(archivalNote('EventLinqs Test Organiser (acceptance tests)')).toBeNull()
    expect(archivalNote('African Music and Cultural Festival')).toBeNull()
    expect(archivalNote('Photo: the organiser')).toBeNull()
    expect(archivalNote(null)).toBeNull()
    expect(archivalNote('')).toBeNull()
  })

  it('never carries a credit prefix or the name it was given', () => {
    for (const c of ['AMCF, past festival', 'Photos: Bird\'s Basement, past show (2023)']) {
      const note = archivalNote(c) ?? ''
      expect(note).not.toMatch(/Photos?:/)
      expect(note).not.toMatch(/AMCF|Bird/)
    }
  })
})
