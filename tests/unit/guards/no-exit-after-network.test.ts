import { describe, expect, it } from 'vitest'

import {
  declareWorkWithoutOptOut,
  doesNetworkWork,
  entryPoints,
  exitCalls,
  judge,
} from '../../../scripts/guards/no-exit-after-network.mjs'

/**
 * The Windows exit crash (PLATFORM-FIX-1 Task 5): process.exit while a network
 * handle is closing aborts Node with UV_HANDLE_CLOSING (nodejs/node#56645).
 * The guard is drilled red against the real tree; these pin its judgements on
 * the inputs a drill cannot produce.
 */
describe('doesNetworkWork', () => {
  it('sees a fetch, a Supabase client, a pg client and a node:https import', () => {
    expect(doesNetworkWork('const r = await fetch(url)')).toBe(true)
    expect(doesNetworkWork("import { createClient } from '@supabase/supabase-js'\nconst db = createClient(u, k)")).toBe(true)
    expect(doesNetworkWork('const c = new pg.Client(cfg)')).toBe(true)
    expect(doesNetworkWork("import https from 'node:https'")).toBe(true)
  })

  it('does not read a string or a comment naming a client as network work', () => {
    expect(doesNetworkWork("const NEEDLES = [\"from 'pg'\", 'createClient(']")).toBe(false)
    expect(doesNetworkWork('// fetch(url) would be wrong here')).toBe(false)
  })

  it('does not run from one import across a semicolon-free file to a string that spells from pg', () => {
    const src = "import { readFileSync } from 'node:fs'\nconst a = 1\nconst NEEDLES = [\n  \"from 'pg'\",\n]\n"
    expect(doesNetworkWork(src)).toBe(false)
  })
})

describe('exitCalls', () => {
  it('finds a call in code and ignores one inside a string or a comment', () => {
    const src = [
      'process.exit(1)',
      "const child = ['process.exit(0)'].join('')",
      '// process.exit(2) is the thing we avoid',
      'if (x) process . exit(3)',
    ].join('\n')
    expect(exitCalls(src).map((c) => c.line)).toEqual([1, 4])
  })
})

describe('declareWorkWithoutOptOut', () => {
  it('passes a call that opts out and refuses one that does not', () => {
    const src = [
      "declareWork('a', { did: { x: 1 }, exitOnZero: false })",
      "declareWork('b', { did: { x: 1 } })",
      "const ok = declareWork('c', {\n  did: { y: f(2) },\n  exitOnZero: false,\n})",
    ].join('\n')
    expect(declareWorkWithoutOptOut(src).map((c) => c.line)).toEqual([2])
  })
})

describe('the tree', () => {
  it('reads the gate and every guard, and finds network entry points to judge', () => {
    const entries = entryPoints()
    expect(entries).toContain('scripts/ops/pre-push-gate.mjs')
    expect(entries).toContain('scripts/ci/types-drift-guard.mjs')
    const { findings, networkEntries } = judge()
    expect(networkEntries.length).toBeGreaterThan(10)
    expect(findings).toEqual([])
  })
})
