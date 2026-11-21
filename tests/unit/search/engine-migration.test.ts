import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * THE ONE SEARCH ENGINE'S CONTRACT, held on its migration (the PM's order of 22 November 2026, 05:25). The behaviour was
 * proved on TEST by replaying this file inside a rolled back transaction and probing it (22 November 2026, 05:20 to
 * 05:26: 'comdey' answers comedy as corrected, 'triv' finds the trivia nights as a prefix, 'live music geelong' exact,
 * 'r&b' normalised to 'rnb' and never corrected to a stranger word), then applying it; these tests keep the parts a
 * later edit could quietly undo.
 */
const sql = readFileSync(join(__dirname, '..', '..', '..', 'supabase', 'migrations', '20261122060001_search_engine.sql'), 'utf8').replace(/\r\n/g, '\n')

describe('the search engine migration', () => {
  it("the document follows the pages' own organiser rule: a listing names its host, else its venue", () => {
    expect(sql).toContain("if e.listing_source = 'eventlinqs' or o_slug = 'eventlinqs-listings' then")
    expect(sql).toMatch(/metadata ->> 'host_name'[\s\S]{0,120}nullif\(btrim\(e\.venue_name\), ''\)/)
  })

  it('the document is refreshed on every write that changes what a page shows', () => {
    for (const table of ['events', 'organisations', 'event_artists', 'event_secondary_categories', 'artists']) {
      expect(sql).toContain(`create trigger event_search_refresh after`)
      expect(sql).toMatch(new RegExp(`on public\\.${table}\\b`))
    }
    expect(sql).toContain('select public.event_search_refresh(id) from public.events;')
  })

  it('visitors reach the engine only through search_events; the tables and the inner steps are closed to them', () => {
    expect(sql).toContain('revoke all on public.event_search from anon, authenticated, service_role;')
    expect(sql).toContain('revoke all on public.search_aliases from anon, authenticated, service_role;')
    expect(sql).toContain('grant execute on function public.search_events(text, integer) to anon, authenticated, service_role;')
    for (const fn of ['search_exact(text, integer)', 'search_correct(text)', 'search_relaxed(text, integer)', 'event_search_refresh(uuid)']) {
      expect(sql).toContain(`revoke all on function public.${fn} from public, anon, authenticated;`)
    }
  })

  it('every security definer function pins an empty search_path', () => {
    const definers = sql.match(/security definer[^$]*?\$\$/g) ?? []
    expect(definers.length).toBeGreaterThanOrEqual(8)
    for (const d of definers) expect(d).toContain("set search_path = ''")
  })

  it('raw input can never raise (websearch_to_tsquery), and a draft is never answered', () => {
    expect(sql).toContain("websearch_to_tsquery('english', qn)")
    expect(sql).not.toMatch(/(?<!websearch_)to_tsquery\('english', qn\)/)
    const steps = sql.match(/where ev\.status = 'published' and ev\.end_date > now\(\) - interval '1 day'/g) ?? []
    expect(steps).toHaveLength(2)
  })

  it('the answer says how it matched: exact, corrected (Did you mean) or relaxed', () => {
    expect(sql).toContain("returns table (event_id uuid, score real, matched text, query text)")
    for (const m of ["'exact'::text", "'corrected'::text", "'relaxed'::text"]) expect(sql).toContain(m)
  })
})
