import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { asksTheWords } from '@/lib/listings/verifier-verdict'

/*
 * THE VERIFIER ASKS THE PAGE'S WORDS WHENEVER NO NIGHT IT CARRIES IS AT THE STORED MINUTE (run 42251873336, 7 November 2026,
 * the first engine verifier on ubuntu-24.04). Here & Now Lounge's Sunday Improv page carries one Event at the weekly listing's
 * FIRST date, Sun 11 Oct; the verifier asked the words only when no found night carried the title, and failed Sun 8 Nov 6:30
 * pm against that first date, though the page's words state Sun 8 and Sun 22 November at 6:30 pm.
 */
describe('when the verifier asks the page in words', () => {
  const stored = '2026-11-08T07:30:00.000Z' // Sun 8 Nov 6:30 pm Melbourne
  it('a page carrying the listing only at its first date: ask the words', () => {
    expect(asksTheWords([{ startsAt: '2026-10-11T07:30:00.000Z' }], stored)).toBe(true)
  })
  it('a page carrying no night at all: ask the words, as before', () => {
    expect(asksTheWords([], stored)).toBe(true)
  })
  it('a page carrying this night at its minute: its own night is the reading, no words needed', () => {
    expect(asksTheWords([{ startsAt: '2026-10-11T07:30:00.000Z' }, { startsAt: stored }], stored)).toBe(false)
  })
  it('the verifier decides through this one rule, never its own count of found nights', () => {
    const src = readFileSync('scripts/verify/engine-verifier.mts', 'utf8')
    expect(src).toMatch(/asksTheWords\(mine, n\.start_date\)/)
    expect(src).not.toMatch(/mine\.length === 0 \? statedInWords/)
  })
})
