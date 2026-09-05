// WRAPPED LEAVES IN THE GENERATED TYPES.
//
// `supabase gen types` keeps its lines under a width. When a key and its type
// would run past it, the generator leaves a bare `key:` on one line and starts
// the union on the next, each alternative prefixed with `|`:
//
//   venue_geocode_source:
//     | Database["public"]["Enums"]["venue_geocode_source"]
//     | null
//
// The first parser required at least one character after the colon, so a leaf
// written that way was never recorded on EITHER side and never compared. On
// 5 September 2026 that was hiding ten wrapped enums in public.Enums, and it
// reported the enum column 20260905000003 introduces as "removed", because the
// live side still fitted on one line and the committed side did not.
//
// These tests pin both spellings, pin that they compare EQUAL, and pin the
// negative: a wrapped enum that gained a value is still a delta.

import { describe, it, expect } from 'vitest'

import { diffSchemas, parseGeneratedTypes } from '../../../scripts/ci/types-drift-analyse.mjs'

const WRAPPED = `export type Database = {
  public: {
    Tables: {
      events: {
        Row: {
          id: string
          venue_geocode_source:
            | Database["public"]["Enums"]["venue_geocode_source"]
            | null
        }
        Insert: {
          id?: string
          venue_geocode_source?:
            | Database["public"]["Enums"]["venue_geocode_source"]
            | null
        }
      }
    }
    Enums: {
      event_status:
        | "draft"
        | "scheduled"
        | "published"
      venue_geocode_source: "places" | "geocoding" | "manual"
    }
  }
}
`

const SINGLE_LINE = `export type Database = {
  public: {
    Tables: {
      events: {
        Row: {
          id: string
          venue_geocode_source: Database["public"]["Enums"]["venue_geocode_source"] | null
        }
        Insert: {
          id?: string
          venue_geocode_source?: Database["public"]["Enums"]["venue_geocode_source"] | null
        }
      }
    }
    Enums: {
      event_status: "draft" | "scheduled" | "published"
      venue_geocode_source: "places" | "geocoding" | "manual"
    }
  }
}
`

describe('a leaf whose value is entirely on the following | lines', () => {
  it('is recorded, with the leading | stripped', () => {
    const leaves = parseGeneratedTypes(WRAPPED)
    expect(leaves.get('public.Tables.events.Row.venue_geocode_source')).toEqual({
      optional: false,
      type: 'Database["public"]["Enums"]["venue_geocode_source"] | null',
    })
  })

  it('keeps the ? marker on an Insert leaf written the wrapped way', () => {
    const leaves = parseGeneratedTypes(WRAPPED)
    expect(leaves.get('public.Tables.events.Insert.venue_geocode_source')).toEqual({
      optional: true,
      type: 'Database["public"]["Enums"]["venue_geocode_source"] | null',
    })
  })

  it('records a wrapped enum in public.Enums (the blind spot of 5 September 2026)', () => {
    const leaves = parseGeneratedTypes(WRAPPED)
    expect(leaves.get('public.Enums.event_status')).toEqual({
      optional: false,
      type: '"draft" | "scheduled" | "published"',
    })
  })

  it('compares EQUAL to the single-line spelling of the same schema', () => {
    const deltas = diffSchemas(parseGeneratedTypes(WRAPPED), parseGeneratedTypes(SINGLE_LINE))
    expect(deltas).toEqual([])
  })

  it('NEGATIVE: a wrapped enum that gained a value is still a delta', () => {
    const grown = WRAPPED.replace('        | "published"\n', '        | "published"\n        | "archived"\n')
    const deltas = diffSchemas(parseGeneratedTypes(grown), parseGeneratedTypes(WRAPPED))
    expect(deltas.map((d) => [d.path, d.kind])).toEqual([['public.Enums.event_status', 'type-changed']])
  })

  it('NEGATIVE: a wrapped column whose type moved from text to the enum is a type change, not a removal', () => {
    const text = SINGLE_LINE.replace(
      /venue_geocode_source(\??): Database\["public"\]\["Enums"\]\["venue_geocode_source"\] \| null/g,
      'venue_geocode_source$1: string | null',
    )
    const deltas = diffSchemas(parseGeneratedTypes(WRAPPED), parseGeneratedTypes(text))
    const kinds = new Map(deltas.map((d) => [d.path, d.kind]))
    expect(kinds.get('public.Tables.events.Row.venue_geocode_source')).toBe('type-changed')
    expect(kinds.get('public.Tables.events.Insert.venue_geocode_source')).toBe('type-changed')
    expect([...kinds.values()]).not.toContain('removed')
  })
})
