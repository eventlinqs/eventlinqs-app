import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ACQUISITION_STATES, STATE_WORDS, isAcquisitionState } from '@/lib/outreach/acquisition-states'

// The screen's words for the acquisition states are held to the database's own list
// (supabase/migrations/20261030034001_organiser_acquisition_state.sql, organisers_acquisition_state_known), so a
// state added to one and not the other fails here.

const migration = readFileSync('supabase/migrations/20261030034001_organiser_acquisition_state.sql', 'utf8')
const known = /organisers_acquisition_state_known check \(acquisition_state in \(([^)]*)\)\)/.exec(migration.replace(/\s+/g, ' '))?.[1]

describe('the acquisition states', () => {
  it('are the database\'s sixteen, in its order', () => {
    expect(known).toBeDefined()
    const fromDb = (known ?? '').split(',').map((s) => s.trim().replace(/^'|'$/g, ''))
    expect(fromDb).toHaveLength(16)
    expect([...ACQUISITION_STATES]).toEqual(fromDb)
  })

  it('each have plain words, and only they are states', () => {
    for (const s of ACQUISITION_STATES) expect(STATE_WORDS[s].trim().length).toBeGreaterThan(3)
    expect(isAcquisitionState('recurring')).toBe(true)
    expect(isAcquisitionState('claimed')).toBe(false)
  })
})
