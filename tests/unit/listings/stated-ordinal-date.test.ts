import { describe, expect, it } from 'vitest'
import { statedInWords } from '@/lib/listings/stated-words'

/*
 * THE CONTROLLER's 17:05 BAR, Carols by Candlelight Geelong (carolsbycandlelightgeelong.org.au/about, read 7 November 2026
 * through the polite reader, C:\dev\EVIDENCE\ENGINE-P0\readers-62\carols.txt): 'DATE: WEDNESDAY 23RD DECEMBER 2026',
 * 'Childrens Entertainment 4.30pm - 7:30pm', 'Carols by Candlelight Geelong kicks off at 7:30pm'. Ours: Wednesday 23
 * December from 4.30 pm. The date reader knew '23 December' and '23 Dec' but never '23rd December', so a person's plain
 * reading was called 'no reader of ours finds a night'.
 */
const ZONE = 'Australia/Melbourne'
const CAROLS = `<main><p>DATE: WEDNESDAY 23RD DECEMBER 2026</p><p>Childrens Entertainment 4.30pm - 7:30pm</p>
<p>Carols by Candlelight Geelong kicks off at 7:30pm</p><p>Santa arrives 8.15pm</p></main>`

describe('a date written with its ordinal', () => {
  it("reads 'WEDNESDAY 23RD DECEMBER 2026' and its 4.30pm", () => {
    // Wednesday 23 December 2026, 4.30 pm in Melbourne
    expect(statedInWords(CAROLS, '2026-12-23T05:30:00Z', ZONE)).toBe('both')
  })
  it('every ordinal: 1st, 2nd, 3rd, 11th, 21st, 22nd', () => {
    const page = (s: string) => `<p>${s}, doors 7pm</p>`
    expect(statedInWords(page('Tuesday 1st December'), '2026-12-01T08:00:00Z', ZONE)).toBe('both')
    expect(statedInWords(page('2nd December'), '2026-12-02T08:00:00Z', ZONE)).toBe('both')
    expect(statedInWords(page('3rd Dec'), '2026-12-03T08:00:00Z', ZONE)).toBe('both')
    expect(statedInWords(page('11th December'), '2026-12-11T08:00:00Z', ZONE)).toBe('both')
    expect(statedInWords(page('21st December'), '2026-12-21T08:00:00Z', ZONE)).toBe('both')
    expect(statedInWords(page('22nd December'), '2026-12-22T08:00:00Z', ZONE)).toBe('both')
  })
  it('another day with an ordinal is never this one', () => {
    expect(statedInWords(CAROLS, '2026-12-22T05:30:00Z', ZONE)).toBe(null)
  })
})
