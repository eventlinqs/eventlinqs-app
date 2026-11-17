import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { pageViewKeyParts } from '@/lib/ledger/page-view-key'

/*
 * A PAGE VIEW'S KEY IS READ ONE WAY (WINDOW 5A, 17 November 2026, found reading the proof counts for the PM's 21:45).
 * The demand route writes `<event id>:<visitor>:<day>` (src/app/api/ledger/demand/route.ts) and the ledger adapter stores
 * it as `demand:page_view:<event id>:<visitor>:<day>` (src/lib/ledger/adapter.ts). Two readers split the stored key by
 * hand as if it had no prefix: readNightViewers (the after event report and the day 4 and 10 follow ups) took part 1,
 * the word 'page_view', so every night counted at most one viewer; the growth page's keyParts took 'demand' as the
 * event and 'page_view' as the visitor. Production, read at 22:12:44: every key starts 'demand:page_view:'.
 */
const EVENT = '8d4b11e7-63ff-4cf6-9bfa-807afa395e3d'
const V1 = '0123456789abcdef0123456789abcdef'
const V2 = 'fedcba9876543210fedcba9876543210'

describe('pageViewKeyParts', () => {
  it('reads the key as the ledger stores it', () => {
    expect(pageViewKeyParts(`demand:page_view:${EVENT}:${V1}:2026-11-17`)).toEqual({ eventId: EVENT, visitor: V1, day: '2026-11-17' })
  })

  it('reads the key as the demand route writes it, before the adapter prefixes it', () => {
    expect(pageViewKeyParts(`${EVENT}:${V2}:2026-11-16`)).toEqual({ eventId: EVENT, visitor: V2, day: '2026-11-16' })
  })

  it('refuses a key of another action or a broken one, never guessing', () => {
    expect(pageViewKeyParts(`demand:checkout_started:${EVENT}`)).toBeNull()
    expect(pageViewKeyParts('demand:page_view:')).toBeNull()
    expect(pageViewKeyParts(`demand:page_view:${EVENT}::2026-11-17`)).toBeNull()
    expect(pageViewKeyParts('')).toBeNull()
  })
})

describe('no reader splits a ledger occurrence key by hand', () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const p = join(dir, name)
      return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx|mts|mjs)$/.test(name) ? [p] : []
    })

  it('every page view key is read through pageViewKeyParts', () => {
    const faults = files(join(process.cwd(), 'src'))
      .filter((f) => !f.replace(/\\/g, '/').endsWith('src/lib/ledger/page-view-key.ts'))
      .filter((f) => /(occurrence_key|occurrenceKey)\s*\.split\(/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(process.cwd(), f).replace(/\\/g, '/'))
    expect(faults).toEqual([])
  })
})
