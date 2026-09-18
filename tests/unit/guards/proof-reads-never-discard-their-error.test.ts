import { describe, expect, test } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { awaitedDestructures, judgeFile, readsThroughMustRead } from '../../../scripts/guards/proof-reads-never-discard-their-error.mjs'

const ROOT = join(__dirname, '..', '..', '..')
const PROOF = join(ROOT, 'src', 'lib', 'proof')

/**
 * THE LAW THIS HOLDS. The campaign proof page defends a fee with numbers, and
 * its stated rule is that a figure which cannot name its source renders as
 * words, never as a zero. A supabase read written `const { data } = await ...`
 * cannot tell a failure from an absence, so on 15 September 2026 a
 * ConnectTimeoutError to Supabase made that page answer 404 for a campaign that
 * exists, and the orders read of the same shape would have printed zero revenue.
 *
 * The guard is drilled red against the real file in
 * scripts/verify/guard-failure-drills.mjs. These hold its reading of source
 * honest in milliseconds, in both directions.
 */
describe('awaitedDestructures', () => {
  test('a read that binds only data is unhandled', () => {
    const found = awaitedDestructures("const { data: slot } = await admin.from('ledger_slots').select('id')")
    expect(found).toHaveLength(1)
    expect(found[0].handled).toBe(false)
  })

  test('a read that binds error alongside data is handled', () => {
    const found = awaitedDestructures("const { data: slot, error: slotError } = await admin.from('x').select('id')")
    expect(found).toHaveLength(1)
    expect(found[0].handled).toBe(true)
  })

  test('a destructure with no data in it is not a read this rule is about', () => {
    expect(awaitedDestructures('const { id, name } = await somethingElse()')).toEqual([])
  })

  test('a comment quoting the defect is not the defect', () => {
    const src = [
      '/* this file used to write `const { data } = await admin...` and drop the error */',
      "const { data, error } = await admin.from('x').select('id')",
    ].join('\n')
    expect(judgeFile('read.ts', src)).toEqual([])
  })
})

describe('judgeFile', () => {
  test('names the line, and says what the failure would print', () => {
    const problems = judgeFile('read.ts', "const { data: orderRows } = await admin.from('orders').select('total_cents')")
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('read.ts:1')
    expect(problems[0]).toContain('never binds `error`')
  })

  test('a read routed through mustRead needs no destructure at all', () => {
    const src = "const sendRows = await mustRead('the sends', () => admin.from('marketing_send').select('id'))"
    expect(judgeFile('read.ts', src)).toEqual([])
    expect(readsThroughMustRead(src)).toBe(1)
  })
})

describe('the shipped proof surface', () => {
  test('every read in src/lib/proof can tell a failure from an absence', () => {
    const files = readdirSync(PROOF).filter((f) => f.endsWith('.ts'))
    expect(files.length).toBeGreaterThan(0)
    const problems = files.flatMap((f) => judgeFile(f, readFileSync(join(PROOF, f), 'utf8')))
    expect(problems).toEqual([])
  })

  test('the reads that feed a printed figure go through mustRead, and there are several', () => {
    const src = readFileSync(join(PROOF, 'read.ts'), 'utf8')
    // The campaign, the event, the organisation, the orders, both attribution
    // reads, the sends, the channel costs and the currency: nine.
    expect(readsThroughMustRead(src)).toBeGreaterThanOrEqual(9)
  })
})
