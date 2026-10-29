import { describe, expect, test } from 'vitest'
import { STEPS } from '../../../scripts/ops/pre-push-gate.mjs'
import { judgeReach, probe, reachTargets } from '../../../scripts/ops/reach-check.mjs'

/**
 * THE GATE ASKS WHETHER IT CAN REACH WHAT IT JUDGES, BEFORE IT JUDGES ANYTHING.
 *
 * Release checklist J3 (28 October 2026). At 01:52 that morning train/el-final-2's
 * gate stopped at guards, 12 minutes in, "16 of 222 guard(s) FAILED", every one
 * "fetch failed (3 attempt(s) over 5.6s). This is a transport failure and says
 * NOTHING about what the database contains" (C:\dev\EVIDENCE\WI1\push-elfinal2.log).
 * The internet was down. The disk floor was already step 1; reach was nobody's
 * step, so the outage read as twelve minutes of work and sixteen red guards.
 *
 * Pinned here: any HTTP answer is reach (a 401 is a server talking); only a
 * thrown fetch is a transport failure; the verdict names the network, not the
 * code; and the step runs straight after disk, before the first step that
 * reads TEST.
 */

const answer = (status: number) => async () => new Response('', { status })
const down = async () => {
  throw new TypeError('fetch failed')
}

describe('probe: an answer of any status is reach, only a thrown fetch is not', () => {
  test('a 401 from the server is reach', async () => {
    const r = await probe({ name: 'TEST', url: 'https://example.supabase.co/rest/v1/' }, { fetchImpl: answer(401), pauseMs: 0 })
    expect(r).toMatchObject({ name: 'TEST', ok: true, status: 401, attempts: 1 })
  })

  test('a fetch that throws every time is tried three times, then reported as unreached', async () => {
    let calls = 0
    const fetchImpl = async () => {
      calls += 1
      return down()
    }
    const r = await probe({ name: 'TEST', url: 'https://example.supabase.co/rest/v1/' }, { fetchImpl, pauseMs: 0 })
    expect(calls).toBe(3)
    expect(r).toMatchObject({ name: 'TEST', ok: false, attempts: 3 })
    expect(r.error).toContain('fetch failed')
  })

  test('a fetch that recovers on the second try is reach', async () => {
    let calls = 0
    const fetchImpl = async () => {
      calls += 1
      return calls === 1 ? down() : new Response('', { status: 200 })
    }
    const r = await probe({ name: 'GitHub', url: 'https://github.com/' }, { fetchImpl, pauseMs: 0 })
    expect(r).toMatchObject({ ok: true, status: 200, attempts: 2 })
  })
})

describe('judgeReach: the verdict names the network, never the code', () => {
  test('every target answered: pass', () => {
    const v = judgeReach([
      { name: 'TEST', url: 'u', ok: true, status: 401, attempts: 1 },
      { name: 'GitHub', url: 'g', ok: true, status: 200, attempts: 1 },
    ])
    expect(v.pass).toBe(true)
  })

  test('one target unreached: fail, naming it and saying it is the network', () => {
    const v = judgeReach([
      { name: 'TEST', url: 'u', ok: false, attempts: 3, error: 'fetch failed' },
      { name: 'GitHub', url: 'g', ok: true, status: 200, attempts: 1 },
    ])
    expect(v.pass).toBe(false)
    expect(v.lines.join('\n')).toContain('TEST')
    expect(v.lines.join('\n')).toMatch(/network, not the code/)
  })

  test('no targets at all is not a pass by silence', () => {
    expect(judgeReach([]).pass).toBe(false)
  })
})

describe('reachTargets: what the gate goes on to read', () => {
  test('TEST from the local env, the Management API, and GitHub', () => {
    const t = reachTargets({ NEXT_PUBLIC_SUPABASE_URL: 'https://vkapkibzokmfaxqogypq.supabase.co' })
    expect(t.map((x) => x.name)).toEqual(['TEST', 'Supabase Management API', 'GitHub'])
    expect(t[0].url).toBe('https://vkapkibzokmfaxqogypq.supabase.co/rest/v1/')
  })

  test('with no TEST url the TEST target is left out and said so, not invented', () => {
    const t = reachTargets({})
    expect(t.map((x) => x.name)).toEqual(['Supabase Management API', 'GitHub'])
  })
})

describe('the gate runs it straight after disk, before anything reads TEST', () => {
  test('reach is step 2, with the local env', () => {
    const ids = STEPS.map((s) => s.id)
    expect(ids.indexOf('reach')).toBe(ids.indexOf('disk') + 1)
    expect(ids.indexOf('reach')).toBeLessThan(ids.indexOf('guards'))
    expect(STEPS.find((s) => s.id === 'reach')?.env).toBe('local')
  })
})
