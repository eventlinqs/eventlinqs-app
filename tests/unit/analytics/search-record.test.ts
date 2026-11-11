import { describe, expect, test, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { recordSearch, searchTerm, searchToRecord } from '../../../src/lib/analytics/search-record'

/**
 * Internal searches recorded first party (the PM's order 3 of 11 November 2026, addition 1): the term normalised and
 * nothing that reads as a person's details, crawlers refused, written after /events answers, never thrown.
 */

const root = join(__dirname, '..', '..', '..')
const PERSON = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'

describe('the term kept', () => {
  test('lower case, single spaces, at most 80 characters', () => {
    expect(searchTerm('  Live   MUSIC  Geelong ')).toBe('live music geelong')
    expect(searchTerm('x'.repeat(120))).toHaveLength(80)
  })

  test('nothing, an empty or a missing query keeps nothing', () => {
    expect(searchTerm('')).toBeNull()
    expect(searchTerm('    ')).toBeNull()
    expect(searchTerm(undefined)).toBeNull()
    expect(searchTerm(null)).toBeNull()
  })

  test('a term that reads as an email, a phone number or a web address is never kept', () => {
    expect(searchTerm('jane@example.com')).toBeNull()
    expect(searchTerm('call 0412 345 678')).toBeNull()
    expect(searchTerm('+61 3 5221 4584')).toBeNull()
    expect(searchTerm('https://tickets.example.com/x')).toBeNull()
    expect(searchTerm('www.eventlinqs.com.au')).toBeNull()
    expect(searchTerm('boyz ii men 2026')).toBe('boyz ii men 2026')
  })

  test('a crawler\'s search is never recorded; a person\'s is', () => {
    expect(searchToRecord('comedy', 'Googlebot/2.1 (+http://www.google.com/bot.html)')).toBeNull()
    expect(searchToRecord('comedy', null)).toBeNull()
    expect(searchToRecord('comedy', PERSON)).toBe('comedy')
  })
})

describe('the write', () => {
  test('one row with the term, the count and the surface, nothing more', async () => {
    const insert = vi.fn(async () => ({ error: null }))
    await recordSearch({ from: () => ({ insert }) } as never, 'comedy', 12)
    expect(insert).toHaveBeenCalledWith({ term: 'comedy', results: 12, surface: 'events' })
  })

  test('a refused write is logged, never thrown', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await expect(recordSearch({ from: () => ({ insert: async () => ({ error: { message: 'permission denied' } }) }) } as never, 'comedy', null)).resolves.toBeUndefined()
    expect(err).toHaveBeenCalledWith(expect.stringMatching(/permission denied/))
    err.mockRestore()
  })
})

describe('where it is wired', () => {
  test('/events records a search only when a query is present, and only after it has answered', () => {
    const page = readFileSync(join(root, 'src', 'app', 'events', 'page.tsx'), 'utf8').replace(/\r\n/g, '\n')
    const at = page.indexOf('if (searchQuery) {')
    expect(at).toBeGreaterThan(0)
    const block = page.slice(at, at + 500)
    expect(block).toContain('searchToRecord(searchQuery, (await headers()).get(\'user-agent\'))')
    expect(block).toContain('after(async () => {')
    expect(block).toContain('recordSearch(createAdminClient(), term, result ? result.total : null)')
  })

  test('the table keeps no identifier and only the service role reaches it', () => {
    const sql = readFileSync(join(root, 'supabase', 'migrations', '20261111010001_site_searches.sql'), 'utf8')
    const table = sql.slice(sql.indexOf('create table'), sql.indexOf(');', sql.indexOf('create table')))
    expect(table).not.toMatch(/\b(ip|user_agent|user_id|session|email|visitor)\b/)
    expect(sql).toContain('revoke all on public.site_searches from anon, authenticated, service_role;')
    expect(sql).toContain('grant select, insert on public.site_searches to service_role;')
    expect(sql).toContain('enable row level security')
  })
})
