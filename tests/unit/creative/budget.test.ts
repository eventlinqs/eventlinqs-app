import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/ai/client', () => ({
  anthropicOrganisation: () => 'org-0000-test',
  getAnthropicClient: () => {
    throw new Error('the real API is never called in a test')
  },
}))

import { budgetVerdict, creativeCall, cycleStart, NO_SETTING, type CreativeCaller } from '@/lib/creative/budget'
import { estimateCostMicroUsd } from '@/lib/ai/config'

/*
 * THE CREATIVE BUDGET (the PM's 13:20 and 13:21 of 23 November 2026). Every generation or review call records its model,
 * its tokens from the API's own usage fields and its cost; the cap is held where a logged production write sets it, zero
 * until then, so generation is off; at the cap generation stops for the credit month, is logged, and leaves the PM one
 * record; the generation call is off and mocked here; and nothing buys credit or turns on auto reload.
 */
type Row = Record<string, unknown>

function budgetDb(budget: Row[], calls: Row[] = []) {
  const lessons: Row[] = []
  const db = {
    from: (table: string) => {
      if (table === 'creative_budget') {
        const q = { select: () => q, order: () => q, limit: () => Promise.resolve({ data: [...budget].sort((a, b) => String(b.set_at).localeCompare(String(a.set_at))).slice(0, 1), error: null }) }
        return q
      }
      if (table === 'creative_calls') return { insert: async (row: Row) => (calls.push(row), { error: null }) }
      if (table === 'ops_lessons') {
        return {
          insert: async (row: Row) => {
            if (lessons.some((l) => l.source_key === row.source_key)) return { error: { code: '23505', message: 'duplicate' } }
            lessons.push(row)
            return { error: null }
          },
        }
      }
      throw new Error(`the budget read a table it should not: ${table}`)
    },
    rpc: async (name: string, args: Row) => {
      if (name !== 'creative_spent_since') throw new Error(`unexpected function ${name}`)
      const from = Date.parse(String(args.p_from))
      return { data: calls.filter((c) => Date.parse(String(c.called_at)) >= from).reduce((s, c) => s + Number(c.cost_micro_usd), 0), error: null }
    },
  }
  return { db: db as never, calls, lessons }
}

const NOW = new Date('2026-11-23T12:00:00.000Z')
const ON = (cap: number): Row => ({ cap_usd: cap, generation_on: true, month_starts_day: 7, set_at: '2026-11-23T11:00:00.000Z' })
const answer: CreativeCaller<string> = async () => ({ value: 'design', model: 'claude-opus-5-5', usage: { input_tokens: 1000, output_tokens: 500, cache_creation_input_tokens: 100, cache_read_input_tokens: 1000 }, requestId: 'msg_01' })

describe('the creative budget', () => {
  it('starts each credit month on the day the credit renews, on UTC\'s clock', () => {
    expect(cycleStart(new Date('2026-12-06T23:59:00.000Z'), 7).toISOString()).toBe('2026-11-07T00:00:00.000Z')
    expect(cycleStart(new Date('2026-12-07T00:00:00.000Z'), 7).toISOString()).toBe('2026-12-07T00:00:00.000Z')
    expect(cycleStart(new Date('2027-01-03T00:00:00.000Z'), 7).toISOString()).toBe('2026-12-07T00:00:00.000Z')
  })

  it('is off with no setting: a zero cap and the switch off, so nothing is generated', () => {
    expect(NO_SETTING).toEqual({ capUsd: 0, generationOn: false, monthStartsDay: 1, setAt: null })
    expect(budgetVerdict(NO_SETTING, 0)).toMatchObject({ ok: false, atCap: false })
    expect(budgetVerdict({ ...NO_SETTING, generationOn: true }, 0)).toMatchObject({ ok: false, atCap: false, reason: expect.stringContaining('cap is zero') })
    expect(budgetVerdict({ ...NO_SETTING, capUsd: 200 }, 0)).toMatchObject({ ok: false, reason: expect.stringContaining('is off') })
  })

  it('stops at the cap, and before a call whose own reserve would pass it', () => {
    const s = { capUsd: 200, generationOn: true, monthStartsDay: 7, setAt: null }
    expect(budgetVerdict(s, 199_000_000)).toEqual({ ok: true })
    expect(budgetVerdict(s, 200_000_000)).toMatchObject({ ok: false, atCap: true })
    expect(budgetVerdict(s, 199_000_000, 2_000_000)).toMatchObject({ ok: false, atCap: true })
  })

  it('never makes the call while no logged write has set a cap, or while the switch is off', async () => {
    for (const rows of [[], [{ ...ON(200), generation_on: false }], [ON(0)]]) {
      const { db, calls } = budgetDb(rows)
      const call = vi.fn(answer)
      const out = await creativeCall(db, { purpose: 'generation', now: NOW }, call)
      expect(out.state).toBe('refused')
      expect(call).not.toHaveBeenCalled()
      expect(calls).toHaveLength(0)
    }
  })

  it("records each call's model, its tokens from the API's usage fields, its cost and the key's organisation", async () => {
    const { db, calls } = budgetDb([ON(200)])
    const out = await creativeCall(db, { purpose: 'review', now: NOW, briefId: '9e8d7c6b-5a49-4382-a716-b5c4d3e2f1a0' }, answer)
    // 1,000 in at US$4 and 500 out at US$20 a million, a cache write of 100 at twice the input price and a read of 1,000 at a tenth.
    const cost = 1000 * 4 + 500 * 20 + 100 * 2 * 4 + 1000 * 0.1 * 4
    expect(out).toEqual({ state: 'called', value: 'design', costMicroUsd: cost, recorded: true })
    expect(calls).toEqual([
      expect.objectContaining({ purpose: 'review', model: 'claude-opus-5-5', input_tokens: 1000, output_tokens: 500, cache_write_tokens: 100, cache_read_tokens: 1000, cost_micro_usd: cost, organisation: 'org-0000-test', request_id: 'msg_01' }),
    ])
  })

  it('at the cap stops for the credit month, logs it, and leaves the PM one record however often it is asked', async () => {
    const spent = [{ called_at: '2026-11-10T00:00:00.000Z', cost_micro_usd: 200_000_000 }]
    const { db, lessons } = budgetDb([ON(200)], spent)
    const call = vi.fn(answer)
    const first = await creativeCall(db, { purpose: 'generation', now: NOW }, call)
    const second = await creativeCall(db, { purpose: 'generation', now: NOW }, call)
    expect(first).toMatchObject({ state: 'refused', atCap: true })
    expect(second).toMatchObject({ state: 'refused', atCap: true })
    expect(call).not.toHaveBeenCalled()
    expect(lessons).toHaveLength(1)
    expect(lessons[0]).toMatchObject({ source: 'engine', source_key: 'creative-cap-reached-2026-11-07' })
    // The next credit month starts again from nothing spent.
    const next = await creativeCall(db, { purpose: 'generation', now: new Date('2026-12-07T01:00:00.000Z') }, call)
    expect(next.state).toBe('called')
  })
})

describe('the prices, from Anthropic\'s own page', () => {
  it('price each current model as the page states, never under the dearer of two', () => {
    expect(estimateCostMicroUsd('claude-opus-5-5', 1_000_000, 1_000_000)).toBe(24_000_000)
    expect(estimateCostMicroUsd('claude-opus-5', 1_000_000, 1_000_000)).toBe(30_000_000)
    expect(estimateCostMicroUsd('claude-opus-4-8', 1_000_000, 1_000_000)).toBe(30_000_000)
    expect(estimateCostMicroUsd('claude-sonnet-5-5', 1_000_000, 1_000_000)).toBe(12_000_000)
    expect(estimateCostMicroUsd('claude-sonnet-4-6', 1_000_000, 1_000_000)).toBe(18_000_000)
    expect(estimateCostMicroUsd('claude-haiku-5-5', 1_000_000, 1_000_000)).toBe(3_000_000)
    expect(estimateCostMicroUsd('claude-fable-5-2', 1_000_000, 1_000_000)).toBe(48_000_000)
    expect(estimateCostMicroUsd('claude-fable-5-1', 1_000_000, 1_000_000)).toBe(60_000_000)
  })

  it('cite the pricing page beside every price', () => {
    const config = readFileSync(join(process.cwd(), 'src', 'lib', 'ai', 'config.ts'), 'utf8')
    const rows = config.split('\n').filter((l) => /\{ prefix: 'claude-/.test(l))
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) expect(row, row).toContain('https://platform.claude.com/docs/en/about-claude/pricing')
  })
})

/** Every .ts or .tsx file under a folder, comments stripped. */
function sources(dir: string): { file: string; code: string }[] {
  const out: { file: string; code: string }[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...sources(full))
    else if (/\.(ts|tsx)$/.test(name)) out.push({ file: full, code: readFileSync(full, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '') })
  }
  return out
}

describe('what no code may do', () => {
  const src = sources(join(process.cwd(), 'src'))

  it('buys credit or turns on auto reload, anywhere in the engine', () => {
    const buys = src.filter((s) => /auto[_-]?reload|autoReload|credit[_-]?purchase|purchase[_-]?credits?|buy[_-]?credits?|\/v1\/organizations\/[^'"`]*\/billing/i.test(s.code))
    expect(buys.map((s) => s.file)).toEqual([])
  })

  it('writes the cap or the switch: only a logged production write does, and the service role may only read it', () => {
    const writes = src.filter((s) => /from\(\s*'creative_budget'\s*\)\s*\.\s*(insert|update|upsert|delete)/.test(s.code))
    expect(writes.map((s) => s.file)).toEqual([])
    const sql = readFileSync(join(process.cwd(), 'supabase', 'migrations', '20261124030002_creative_budget.sql'), 'utf8')
    expect(sql).toContain('grant select on public.creative_budget to service_role;')
    expect(sql).not.toMatch(/insert into public\.creative_budget/i)
  })

  it('holds a post already approved for the budget: the publishing path never reads it', () => {
    for (const file of ['src/lib/social/store.ts', 'src/lib/social/publish-run.ts', 'src/lib/social/meta-wiring.ts']) {
      expect(readFileSync(join(process.cwd(), file), 'utf8'), file).not.toMatch(/creative\/budget|creative_budget|creativeCall/)
    }
  })
})
