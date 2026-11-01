// CITY FIRST, DIRECTIVE 3 (the CONTROLLER's 1 November 2026 15:32; C:\dev\EVIDENCE\CITY-FIRST-1NOV\data-model.md):
// a place is read from the venue's point by the ABS's own boundaries, never from a label; each city's Urban Centre,
// surroundings and tourism region are data, not code. These tests keep the model in the tree; the database behaviour is
// proved on TEST by scripts/verify/city-geography-proof.sql.

import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

const dir = resolve(process.cwd(), 'supabase/migrations')
const THE_MODEL = '20261101160001_city_geography.sql'
const sql = () => readFileSync(resolve(dir, THE_MODEL), 'utf8').replace(/\r\n/g, '\n')

describe('the city geography model', () => {
  test('each guide city is a row of ABS codes, read from the ABS service, none typed from memory', () => {
    const s = sql()
    expect(s).toMatch(/create table if not exists public\.city_geography/)
    for (const row of [
      /\('geelong', '203003', array\['22750'\], null, '2R140'/,
      /\('ballarat', '203001', array\['20570'\], null, '2R170'/,
      /\('bendigo', '203002', array\['22620'\], null, '2R060'/,
      /\('melbourne', '201001', array\[\]::text\[\], '2GMEL', '2R010'/,
    ]) expect(s).toMatch(row)
  })

  test('a venue carries its placement and the point it was placed from', () => {
    const s = sql()
    for (const col of ['abs_ucl_code', 'abs_lga_code', 'abs_sal_name', 'abs_gccsa_code', 'abs_tr_code', 'abs_placed_at', 'abs_placed_latitude', 'abs_placed_longitude']) {
      expect(s).toContain(`add column if not exists ${col}`)
    }
  })

  test('the relation is derived in one function: city, surrounding, region, outside or unplaced', () => {
    const s = sql()
    expect(s).toMatch(/create or replace function public\.venue_city_relation\(p_city text, p_venue uuid\)/)
    for (const word of ["'city'", "'surrounding'", "'region'", "'outside'", "'unplaced'"]) expect(s).toContain(word)
    expect(s).toMatch(/a placement taken from an older point is not a placement/i)
  })

  test('no city name is decided in application code', () => {
    const files = readdirSync(resolve(process.cwd(), 'src/lib/geography'), { withFileTypes: true }).filter((f) => f.isFile())
    for (const f of files) {
      const text = readFileSync(resolve(process.cwd(), 'src/lib/geography', f.name), 'utf8')
      expect(text, f.name).not.toMatch(/['"](geelong|ballarat|bendigo|melbourne)['"]/i)
    }
  })
})
