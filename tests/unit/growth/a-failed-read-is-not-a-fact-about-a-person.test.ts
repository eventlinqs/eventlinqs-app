import { describe, expect, it } from 'vitest'
import { ReadFailed } from '@/lib/supabase/read-or-throw'
import { filterPermittedRecipients, resolveSend } from '@/lib/consent/resolver'
import { findSubjectByToken, readSubjectHistory } from '@/lib/consent/ledger'
import { FACILITATED_MARKETING_PURPOSE } from '@/lib/consent/purposes'
import {
  CALIBRATION_PROBE,
  awaitedDestructures,
  calibrationFault,
  judgeFile,
} from '../../../scripts/guards/a-failed-read-is-not-a-fact-about-a-person.mjs'

/**
 * A READ THAT FAILED IS NOT A FACT ABOUT A PERSON.
 *
 * WHAT THESE TESTS ARE AGAINST, stated so the assertions are readable as
 * evidence rather than as shapes. On 19 September 2026 forty-eight reads across
 * the marketing send path discarded their error, and each failure already had a
 * false sentence written and waiting for it:
 *
 *   "the audience row this admission points at no longer exists"
 *   "this address has no consent record carrying an unsubscribe token"
 *   "the step names a template that does not exist"      (every recipient)
 *   "unknown tenant platform"                            (stored as evidence)
 *   "This link is not valid"                             (the unsubscribe page)
 *
 * The first three are written into public.marketing_send_skip, which is
 * append-only, and counted onto /admin/campaigns. So these tests assert the
 * SENTENCE and not merely the outcome: a refusal that fails closed for the
 * wrong stated reason is the defect, and an assertion on `permitted === false`
 * alone would pass over it exactly as the old code did.
 *
 * THE ERROR USED IS DELIBERATELY NOT TRANSIENT. `withBuildRetry` recognises
 * "fetch failed", ECONNRESET, ETIMEDOUT and pool exhaustion and retries them
 * with backoff, which is correct in production and would make every test here
 * sleep for 1.75 seconds. One test below uses a transient error on purpose, to
 * prove the retry is reached rather than assumed.
 */

const NOT_TRANSIENT = { message: 'permission denied for table', code: '42501' }

/**
 * A supabase-js builder that answers the same way however it is chained.
 *
 * It is a PROXY rather than a hand-written double because the modules under
 * test chain a different set of methods each (.eq, .in, .order, .limit,
 * .range, .maybeSingle, .single), and a double that has to list them would
 * start passing for the wrong reason the day a call site adds one.
 */
function clientAnswering(result: { data: unknown; error: unknown }) {
  const calls: string[] = []
  const builder: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve: (v: unknown) => unknown) => resolve(result)
        }
        return (...args: unknown[]) => {
          if (typeof prop === 'string') calls.push(`${prop}(${args.length})`)
          return builder
        }
      },
    },
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { admin: { from: () => builder } as any, calls }
}

describe('the consent resolver, when the ledger cannot be read', () => {
  it('refuses the send and names the READ, not a tenant that has existed since GA1', async () => {
    const { admin } = clientAnswering({ data: null, error: NOT_TRANSIENT })

    const verdict = await resolveSend(admin, {
      email: 'lane-b-readfail@example.com',
      purpose: FACILITATED_MARKETING_PURPOSE,
      channel: 'email',
    })

    expect(verdict.permitted).toBe(false)
    expect(verdict.reason).toBe('the consent ledger could not be read, so the message is refused')
    // The sentence the discarded error used to produce. It is stored as the
    // detail of a marketing_send_skip row and read back as evidence.
    expect(verdict.reason).not.toMatch(/unknown tenant/)
  })

  it('refuses every address on a list for the same true reason', async () => {
    const { admin } = clientAnswering({ data: null, error: NOT_TRANSIENT })

    const out = await filterPermittedRecipients(
      admin,
      ['lane-b-one@example.com', 'lane-b-two@example.com'],
      { purpose: FACILITATED_MARKETING_PURPOSE, channel: 'email' },
    )

    expect(out.permitted).toEqual([])
    expect(out.refused).toHaveLength(2)
    for (const refusal of out.refused) {
      expect(refusal.reason).toBe('the consent ledger could not be read, so the message is refused')
      expect(refusal.reason).not.toMatch(/unknown tenant/)
    }
  })

  /*
   * THE RETRY IS REACHED, PROVEN RATHER THAN ASSUMED. A dropped keep-alive
   * socket is the commonest cause of all of this and it is exactly what
   * `readOrThrow` is supposed to ask again about. If the door were ever swapped
   * for a bare throw this test would still pass on the verdict and fail on the
   * call count, which is why the count is asserted.
   */
  it('asks again before giving up when the fault is a dropped socket', async () => {
    const { admin, calls } = clientAnswering({ data: null, error: { message: 'fetch failed' } })

    const verdict = await resolveSend(admin, {
      email: 'lane-b-blink@example.com',
      purpose: FACILITATED_MARKETING_PURPOSE,
      channel: 'email',
    })

    expect(verdict.permitted).toBe(false)
    expect(calls.filter(c => c.startsWith('select')).length).toBeGreaterThan(1)
  }, 20_000)

  it('still permits a transactional message without reading anything at all', async () => {
    const { admin, calls } = clientAnswering({ data: null, error: NOT_TRANSIENT })

    const verdict = await resolveSend(admin, {
      email: 'lane-b-ticket@example.com',
      purpose: 'ticket_delivery',
      channel: 'email',
    })

    expect(verdict.permitted).toBe(true)
    expect(calls).toEqual([])
  })
})

describe('the unsubscribe facility, when the token lookup cannot be read', () => {
  /*
   * THIS IS THE ONE THE SPAM ACT IS ABOUT. null from findSubjectByToken makes
   * /marketing/preferences/[token] render "This link is not valid" to somebody
   * who pressed unsubscribe in a real message. A read that failed is not
   * evidence about their token.
   */
  it('raises rather than telling a person their live unsubscribe link is not valid', async () => {
    const { admin } = clientAnswering({ data: null, error: NOT_TRANSIENT })
    await expect(
      findSubjectByToken(admin, '3f2504e0-4f89-41d3-9a0c-0305e82c3301'),
    ).rejects.toBeInstanceOf(ReadFailed)
  })

  it('still answers null for a token that is not even shaped like one, with no read at all', async () => {
    const { admin, calls } = clientAnswering({ data: null, error: NOT_TRANSIENT })
    await expect(findSubjectByToken(admin, 'not-a-uuid')).resolves.toBeNull()
    expect(calls).toEqual([])
  })

  it('raises rather than answering a privacy request with an empty history', async () => {
    const { admin } = clientAnswering({ data: null, error: NOT_TRANSIENT })
    await expect(
      readSubjectHistory(admin, 'lane-b-history@example.com'),
    ).rejects.toBeInstanceOf(ReadFailed)
  })

  it('still answers an empty history for an address that is not an address', async () => {
    const { admin } = clientAnswering({ data: null, error: NOT_TRANSIENT })
    await expect(readSubjectHistory(admin, '   ')).resolves.toEqual({
      email: '',
      consents: [],
      suppressions: [],
    })
  })
})

/**
 * THE GUARD'S OWN JUDGEMENT, TESTED WHERE THE DRILLS CANNOT REACH.
 *
 * scripts/verify/guard-failure-drills.mjs proves the guard FAILS on seven real
 * regressions. What it cannot show cheaply is the matcher's behaviour on the
 * spellings that do NOT appear in the tree today, and those are precisely where
 * the sibling guard was blind.
 */
describe('the guard matcher', () => {
  it('reads its own calibration probe correctly', () => {
    expect(calibrationFault()).toBeNull()
  })

  it('sees an ARRAY destructure, which the sibling guard in src/lib/proof cannot', () => {
    const found = awaitedDestructures(CALIBRATION_PROBE).filter(d => d.shape === 'array')
    expect(found).toHaveLength(2)
    expect(found.map(d => d.element)).toEqual([1, 2])
    expect(found.map(d => d.handled)).toEqual([false, true])
  })

  it.each([
    ['const { data } = await', 'const { data } = await q.select()', true],
    ['let, not const', 'let { data } = await q.select()', true],
    ['an alias', 'const { data: rows } = await q.select()', true],
    ['error bound', 'const { data, error } = await q.select()', false],
    ['error aliased', 'const { data: rows, error: rowsError } = await q.select()', false],
    ['no data bound at all', 'const { count } = await q.select()', false],
    ['through a door', 'const rows = await readOrThrow("x", () => q.select())', false],
  ])('%s', (_label, source, shouldFail) => {
    const problems = judgeFile('probe.ts', source, 'a permanent skip row')
    expect(problems.length > 0).toBe(shouldFail)
  })

  it('names the element of an array destructure that is at fault, not just the line', () => {
    const problems = judgeFile(
      'probe.ts',
      'const [{ data: a }, { data: b, error: bErr }] = await Promise.all([p, q])',
      'a permanent skip row',
    )
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatch(/element 1 of an array destructure/)
  })

  it('does not judge a comment that happens to look like a read', () => {
    expect(judgeFile('probe.ts', '// const { data } = await q.select()', 'x')).toEqual([])
  })
})
