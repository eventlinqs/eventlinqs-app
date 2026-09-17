import { describe, expect, it } from 'vitest'
import {
  ACCESSIBILITY_FLAGS,
  accessibilityColumns,
  accessibilityInputFrom,
  accessibilityItems,
  hasAccessibilityInfo,
} from '@/lib/accessibility/fields'

/**
 * ACCESSIBILITY (close-out SEO5 step 4), the derivation.
 *
 * The item names `accessibility_section_hidden_when_empty`; the rendering half
 * of that name is proven in `tests/component/seo5-states.test.tsx`, which
 * mounts the real section and asserts it produces no DOM. This file holds the
 * derivation underneath it, where the rule actually lives: what counts as
 * "filled", what counts as "stated", and the fact that a false is never a no.
 */

describe('accessibility_section_hidden_when_empty', () => {
  it('a row with nothing said has nothing to show', () => {
    const info = accessibilityItems({}, 'event')
    expect(info.flags).toEqual([])
    expect(info.notes).toBeNull()
    expect(info.contact).toBeNull()
    expect(hasAccessibilityInfo(info)).toBe(false)
  })

  it('a row from BEFORE the migration, where the columns do not exist, has nothing to show', () => {
    // This is the state of every production row until the founder applies
    // docs/migrations-pending/20260914000002_accessibility_fields.sql. Every
    // property is undefined and the page must render exactly as it does now.
    const preMigrationRow = { id: 'e1', title: 'Lane C night', start_date: '2026-10-10' }
    expect(hasAccessibilityInfo(accessibilityItems(preMigrationRow, 'event'))).toBe(false)
    expect(hasAccessibilityInfo(accessibilityItems(preMigrationRow, 'venue'))).toBe(false)
  })

  it('a row with every flag FALSE still has nothing to show', () => {
    // The columns are NOT NULL DEFAULT false, so this is what an untouched row
    // looks like after the migration. `false` means NOT STATED, so the section
    // must stay hidden rather than appear with an empty body.
    const untouched: Record<string, unknown> = { accessibility_notes: null, accessibility_contact: null }
    for (const flag of ACCESSIBILITY_FLAGS) untouched[flag.column] = false
    expect(hasAccessibilityInfo(accessibilityItems(untouched, 'event'))).toBe(false)
  })

  it('whitespace in a text field is not content', () => {
    expect(
      hasAccessibilityInfo(accessibilityItems({ accessibility_notes: '   \n  ' }, 'event')),
    ).toBe(false)
  })

  it('one true flag is enough to show it', () => {
    const info = accessibilityItems({ wheelchair_accessible: true }, 'event')
    expect(info.flags.map(f => f.column)).toEqual(['wheelchair_accessible'])
    expect(hasAccessibilityInfo(info)).toBe(true)
  })

  it('notes alone, with no flag, is enough to show it', () => {
    const info = accessibilityItems({ accessibility_notes: 'Ring the bell at the laneway door.' }, 'event')
    expect(info.flags).toEqual([])
    expect(hasAccessibilityInfo(info)).toBe(true)
  })

  it('a contact alone is enough to show it', () => {
    expect(
      hasAccessibilityInfo(accessibilityItems({ accessibility_contact: '03 9000 0000' }, 'venue')),
    ).toBe(true)
  })

  it('a null row, which is what an unreadable read returns, shows nothing', () => {
    expect(hasAccessibilityInfo(accessibilityItems(null, 'venue'))).toBe(false)
    expect(hasAccessibilityInfo(accessibilityItems(undefined, 'event'))).toBe(false)
  })
})

describe('a false is never rendered as a no', () => {
  it('returns only the true flags, never the false ones', () => {
    const info = accessibilityItems(
      { wheelchair_accessible: true, hearing_loop: false, quiet_space: true },
      'event',
    )
    expect(info.flags.map(f => f.column).sort()).toEqual(['quiet_space', 'wheelchair_accessible'])
  })

  it('no label or detail anywhere in the vocabulary denies an access feature', () => {
    /*
     * THE FIRST VERSION OF THIS ASSERTION WAS A BLUNT "no word 'no' anywhere",
     * and it was wrong in both directions. It failed on "at no extra charge",
     * which is the Companion Card's whole point and is a POSITIVE, and it would
     * have failed "without steps", which is also a positive. A rule that bans a
     * word rather than a claim gets rewritten into uselessness the first time
     * somebody writes a true sentence.
     *
     * What must never appear is a negation ATTACHED TO A FEATURE: "no hearing
     * loop", "not wheelchair accessible", "accessible parking unavailable".
     * Those are claims about a building nobody asked about. The whole
     * vocabulary is swept rather than a sample, because the defect would be one
     * entry somebody added later.
     */
    // `step` is deliberately NOT in this list: the feature is "step-free", so
    // "without steps" is a POSITIVE and the first version of the rule failed on
    // it. Only the names of things a venue HAS belong here.
    const FEATURE = 'wheelchair|hearing|accessible|quiet|assistance|auslan|audio|companion|toilet|parking'
    const DENIES = new RegExp(`\\b(?:no|not|none|without|lacks?)\\s+(?:${FEATURE})`, 'i')
    const UNAVAILABLE = new RegExp(`(?:${FEATURE})[^.]{0,30}\\b(?:unavailable|not available)\\b`, 'i')
    for (const flag of ACCESSIBILITY_FLAGS) {
      for (const text of [flag.label, flag.detail]) {
        expect(text).not.toMatch(DENIES)
        expect(text).not.toMatch(UNAVAILABLE)
      }
    }
  })

  it('a truthy non-boolean is not a claim', () => {
    // A '1' or a 'true' arriving from a CSV import or a future serialiser must
    // never become a promise of a ramp nobody built.
    const info = accessibilityItems(
      { wheelchair_accessible: 'true', hearing_loop: 1, quiet_space: 'yes' },
      'event',
    )
    expect(info.flags).toEqual([])
  })
})

describe('the two scopes stay different, because a building cannot be interpreted', () => {
  it('an event may be Auslan interpreted or audio described', () => {
    const info = accessibilityItems({ auslan_interpreted: true, audio_described: true }, 'event')
    expect(info.flags.map(f => f.column)).toEqual(['auslan_interpreted', 'audio_described'])
  })

  it('a venue may not, even when the column says so', () => {
    const info = accessibilityItems({ auslan_interpreted: true, audio_described: true }, 'venue')
    expect(info.flags).toEqual([])
  })

  it('the venue column list is the event list minus the per-performance services', () => {
    const event = accessibilityColumns('event')
    const venue = accessibilityColumns('venue')
    expect(event).toContain('auslan_interpreted')
    expect(venue).not.toContain('auslan_interpreted')
    expect(venue).not.toContain('audio_described')
    for (const column of venue) expect(event).toContain(column)
  })

  it('both lists carry the two text columns', () => {
    for (const scope of ['event', 'venue'] as const) {
      expect(accessibilityColumns(scope)).toContain('accessibility_notes')
      expect(accessibilityColumns(scope)).toContain('accessibility_contact')
    }
  })
})

describe('the edit panel starts from every box, not only the ticked ones', () => {
  it('returns a false for a flag that is absent, so the checkbox is controlled', () => {
    const input = accessibilityInputFrom({ wheelchair_accessible: true }, 'event')
    expect(input.flags.wheelchair_accessible).toBe(true)
    expect(input.flags.hearing_loop).toBe(false)
    expect(Object.keys(input.flags)).toHaveLength(
      ACCESSIBILITY_FLAGS.filter(f => f.scopes.includes('event')).length,
    )
  })

  it('carries the text fields through, trimmed', () => {
    const input = accessibilityInputFrom(
      { accessibility_notes: '  Ring the bell.  ', accessibility_contact: '  access@venue.au ' },
      'venue',
    )
    expect(input.notes).toBe('Ring the bell.')
    expect(input.contact).toBe('access@venue.au')
  })
})

describe('the vocabulary itself', () => {
  it('has no duplicate column, which would render a row twice', () => {
    const columns = ACCESSIBILITY_FLAGS.map(f => f.column)
    expect(new Set(columns).size).toBe(columns.length)
  })

  it('is Australian English and carries no exclamation mark or dash', () => {
    for (const flag of ACCESSIBILITY_FLAGS) {
      for (const text of [flag.label, flag.detail]) {
        expect(text).not.toContain('!')
        expect(text).not.toContain('—')
        expect(text).not.toContain('–')
      }
    }
  })

  it('names the Australian Companion Card, which is the Australia-smart field', () => {
    const companion = ACCESSIBILITY_FLAGS.find(f => f.column === 'companion_card_accepted')
    expect(companion?.label).toBe('Companion Card accepted')
    expect(companion?.scopes).toContain('event')
    expect(companion?.scopes).toContain('venue')
  })
})
