/**
 * A SECOND CALLER-SUPPLIED ID MUST BE RESOLVED, NOT TRUSTED.
 *
 * THE DEFECT THIS PINS (15 August 2026, found by adjudicating the six
 * RED-IDOR-RISK entry points rather than accepting the scanner's verdict).
 *
 * `saveSeatMap(venueId, seatMapId, ...)` gates `venueId` properly:
 * requireVenueSeatingAccess selects the venue, reads its organisation_id off the
 * row, and tests the caller against it with explicit owner or member filters.
 * That check is sound.
 *
 * `seatMapId` is a SEPARATE id and the gate says nothing about it. The update
 * carried `.eq('id', mapId).eq('venue_id', venueId)`, which correctly refuses to
 * overwrite a foreign map's layout. But a PostgREST update matching ZERO rows
 * returns no error, so execution continued with the caller's foreign id still in
 * `mapId`, and the section upsert underneath runs on the SERVICE-ROLE client,
 * which bypasses RLS. `seat_map_sections.seat_map_id` is only FK-constrained to
 * `seat_maps(id)`, so an organiser who owned venue A could pass their own
 * venueId with another organisation's seatMapId and insert or update section
 * rows on that organisation's chart. Those rows are read straight onto the
 * victim's public event page legend and their seats dashboard.
 *
 * The class is general and worth naming: an authorisation check on ONE id does
 * not authorise a SECOND id in the same call, and "no error" is not "a row was
 * written".
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(__dirname, '../../..')
const ACTIONS = readFileSync(
  path.join(ROOT, 'src/app/(dashboard)/dashboard/venues/[id]/seat-maps/actions.ts'),
  'utf8',
)

/** The saveSeatMap body only, so a guard in a sibling action cannot satisfy this. */
function saveSeatMapBody(): string {
  const start = ACTIONS.indexOf('export async function saveSeatMap')
  expect(start, 'saveSeatMap not found; this test is pinned to the wrong file').toBeGreaterThan(-1)
  const next = ACTIONS.indexOf('export async function', start + 10)
  return ACTIONS.slice(start, next === -1 ? undefined : next)
}

describe('saveSeatMap cannot write across tenants', () => {
  const body = saveSeatMapBody()

  it('constrains the seat map to the verified venue on the update', () => {
    expect(
      /\.eq\(\s*['"]venue_id['"]\s*,\s*venueId\s*\)/.test(body),
      'the seat_maps update must be constrained to the venue the caller was authorised for',
    ).toBe(true)
  })

  it('makes the zero-row case VISIBLE, which is the actual defect', () => {
    // Without .select() a PostgREST update that matches nothing looks identical
    // to one that matched, because `error` is null either way.
    expect(
      /\.eq\(\s*['"]venue_id['"]\s*,\s*venueId\s*\)\s*\.select\(/.test(body),
      'the seat_maps update must .select() so a zero-row match can be detected. ' +
        'Without it, a foreign seatMapId passes silently and reaches the ' +
        'service-role section upsert.',
    ).toBe(true)
  })

  it('refuses when the update matched no row', () => {
    expect(
      /updated\.length === 0|!updated\?\.length|updated\.length < 1/.test(body),
      'saveSeatMap must return an error when the update matched zero rows',
    ).toBe(true)
  })

  it('reassigns mapId from the row the DATABASE returned, never the caller', () => {
    expect(
      /mapId\s*=\s*updated\[0\]/.test(body),
      'after the update, mapId must come from the returned row so it can only ever ' +
        'be a seat map inside the verified venue',
    ).toBe(true)
  })

  it('still writes sections through the id it resolved', () => {
    // Guards against a future edit that reintroduces the caller's id here.
    expect(
      /seat_map_id:\s*mapId/.test(body),
      'the section upsert must use the resolved mapId',
    ).toBe(true)
    expect(
      /seat_map_id:\s*seatMapId/.test(body),
      'the section upsert must NEVER use the raw caller-supplied seatMapId',
    ).toBe(false)
  })
})
