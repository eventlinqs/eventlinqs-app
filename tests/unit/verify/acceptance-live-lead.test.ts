/**
 * LAW 16'S CHECK JUDGES A NIGHT BY THE SAME LEAD AS THE GUIDE (WINDOW 5A, 10 November 2026).
 *
 * acceptance-live.mjs on www read 'FAIL law16-reachable (geelong): 177 of 178 listings ... MISSING 1: disaster
 * preparation at home|geelong west library' at 11:26:00 on 10 November. That night ended at 11:30, and every public list
 * drops a night LIST_END_LEAD_MS before its end (car 43, src/lib/events/listing-window.ts), so the guide was right and the
 * check, which judged against now(), was wrong. The check now reads the lead from its one source and demands only the
 * nights with more than the lead to run after each guide was read; no-ended-night keeps the true end.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LIST_END_LEAD_MS } from '@/lib/events/listing-window'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n')
const CHECK = read('scripts/verify/acceptance-live.mjs')

describe("acceptance-live's law 16 check and the guide share one lead", () => {
  it('reads LIST_END_LEAD_MS from listing-window.ts, and its pattern evaluates to the exported value', () => {
    expect(CHECK).toContain("join(process.cwd(), 'src', 'lib', 'events', 'listing-window.ts')")
    const pattern = CHECK.match(/src\.match\((\/export const LIST_END_LEAD_MS = [^/]+\/)\)/)
    expect(pattern).not.toBeNull()
    const declared = read('src/lib/events/listing-window.ts').match(/export const LIST_END_LEAD_MS = ([0-9][0-9 *]*)/)
    expect(declared).not.toBeNull()
    const value = declared![1].split('*').reduce((a, x) => a * Number(x.trim()), 1)
    expect(value).toBe(LIST_END_LEAD_MS)
  })

  it('demands only nights with more than the lead to run after the guide was read', () => {
    expect(CHECK).toMatch(/const readAt = Date\.now\(\)/)
    expect(CHECK).toMatch(/Date\.parse\(n\.until\) >= pageData\[city\]\.readAt \+ LEAD_MS/)
  })

  it('keeps the true end for no-ended-night: the listed set is still judged against now()', () => {
    expect(CHECK).toMatch(/at time zone coalesce\(e\.timezone, 'Australia\/Melbourne'\)\)\) >= now\(\)`\)/)
    expect(CHECK).toMatch(/const ended = pageData\[city\]\.linked\.filter\(\(s\) => !bySlug\.has\(s\)\)/)
  })
})
