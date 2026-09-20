import { describe, it, expect } from 'vitest'
import {
  judgeAcceptedLoads,
  GATE_SCRIPTS,
  GATE_SCRIPT_IDS,
  THE_COMMAND,
} from '../../../scripts/verify/lib/an1-accepted-loads.mjs'
import { ANALYTICS_PROVIDERS } from '@/lib/analytics/providers'

/**
 * AN1 acceptance 2, the positive half: the judgement the drive makes after
 * somebody accepts.
 *
 * WHY THIS IS A UNIT TEST AND NOT ONLY A DRIVEN CHECK. The branch that matters
 * most is the one that REFUSES, and a driven run against a correctly configured
 * server never reaches it. The version of this judgement that lived inline in
 * the drive passed for five days in a branch that asserted nothing, precisely
 * because the only way to see that branch was to run the drive in the one
 * configuration nobody ran it in. Every branch is exercised here, so the one
 * that refuses cannot quietly become one that passes.
 */

const registry = ANALYTICS_PROVIDERS as unknown as Array<{ id: string; hosts: string[] }>

describe('AN1: what the gate emitted is read from the browser, not from a shell', () => {
  it('names every script element the gate can render', () => {
    expect(GATE_SCRIPT_IDS).toEqual(['el-posthog', 'el-gtag-loader', 'el-gtag-config', 'el-meta-pixel'])
  })

  it('gives the inline gtag config no providers, because it fetches nothing of its own', () => {
    // It renders beside the loader and pushes to dataLayer. Counting it as
    // evidence that the gate opened would let a run prove the positive half
    // with nothing having been requested at all.
    const config = GATE_SCRIPTS.find(s => s.id === 'el-gtag-config')
    expect(config?.providers).toEqual([])
  })

  it('refuses to call the positive half proven when only the inline config rendered', () => {
    const verdict = judgeAcceptedLoads({ emitted: ['el-gtag-config'], requested: [], registry })
    expect(verdict.verdict).toBe('not-proven')
  })

  it('maps the one gtag loader to both Google providers, because it serves both', () => {
    const loader = GATE_SCRIPTS.find(s => s.id === 'el-gtag-loader')
    expect(loader?.providers).toEqual(['ga4', 'google-ads'])
  })

  it('names only providers that exist in the registry', () => {
    const known = new Set(ANALYTICS_PROVIDERS.map(p => p.id))
    for (const script of GATE_SCRIPTS) {
      for (const id of script.providers) expect(known.has(id as never)).toBe(true)
    }
  })

  it('covers every provider in the registry, so none can be emitted unwatched', () => {
    const covered = new Set(GATE_SCRIPTS.flatMap(s => s.providers))
    for (const provider of ANALYTICS_PROVIDERS) expect(covered.has(provider.id)).toBe(true)
  })
})

describe('AN1: an empty gate is a refusal, never a pass', () => {
  it('refuses when the gate rendered nothing, because there is no positive half to prove', () => {
    const verdict = judgeAcceptedLoads({ emitted: [], requested: [], registry })
    expect(verdict.verdict).toBe('not-proven')
  })

  it('says why it proves nothing: it would assert what the refusal check already asserts', () => {
    const verdict = judgeAcceptedLoads({ emitted: [], requested: [], registry })
    expect(verdict.detail).toContain('the refusal check already asserts')
  })

  it('names the one command that makes the meaningful form runnable', () => {
    const verdict = judgeAcceptedLoads({ emitted: [], requested: [], registry })
    expect(verdict.detail).toContain(THE_COMMAND)
    expect(THE_COMMAND).toContain('--measurement-ids')
  })

  it('still refuses when the gate rendered nothing and something reached a tracker anyway', () => {
    // The old inline check PASSED this case whenever its own shell had no
    // identifier: it asserted zero requests, and zero is what it saw, so a
    // tracker loading from outside the gate would have been reported as proof
    // that the gate works.
    const verdict = judgeAcceptedLoads({
      emitted: [],
      requested: ['https://connect.facebook.net/en_US/fbevents.js'],
      registry,
    })
    expect(verdict.verdict).not.toBe('proven')
  })
})

describe('AN1: with the gate open, the judgement is an equality in both directions', () => {
  const allThree = ['el-posthog', 'el-gtag-loader', 'el-meta-pixel']
  const allThreeRequested = [
    'https://us.i.posthog.com/static/array.js',
    'https://www.googletagmanager.com/gtag/js?id=G-LANEBLOCAL0',
    'https://connect.facebook.net/en_US/fbevents.js',
  ]

  it('proves the run when every emitted script asked for one of its own hosts', () => {
    const verdict = judgeAcceptedLoads({ emitted: allThree, requested: allThreeRequested, registry })
    expect(verdict.verdict).toBe('proven')
  })

  it('reports the hosts that were attempted, so the evidence names them', () => {
    const verdict = judgeAcceptedLoads({ emitted: allThree, requested: allThreeRequested, registry })
    expect(verdict.detail).toContain('us.i.posthog.com')
    expect(verdict.detail).toContain('www.googletagmanager.com')
    expect(verdict.detail).toContain('connect.facebook.net')
  })

  it('refuses a script that was emitted and never ran', () => {
    const verdict = judgeAcceptedLoads({
      emitted: allThree,
      requested: allThreeRequested.filter(u => !u.includes('facebook')),
      registry,
    })
    expect(verdict.verdict).toBe('mismatch')
    expect(verdict.detail).toContain('el-meta-pixel')
    expect(verdict.detail).toContain('emitted and never ran')
  })

  it('refuses a tracker host reached by a provider the gate did not emit', () => {
    const verdict = judgeAcceptedLoads({
      emitted: ['el-posthog'],
      requested: ['https://us.i.posthog.com/static/array.js', 'https://connect.facebook.net/en_US/fbevents.js'],
      registry,
    })
    expect(verdict.verdict).toBe('mismatch')
    expect(verdict.detail).toContain('belonging to no script the gate emitted')
  })

  it('accepts the Google pair on either of their hosts, because one loader serves both', () => {
    const verdict = judgeAcceptedLoads({
      emitted: ['el-gtag-loader'],
      requested: ['https://www.googleadservices.com/pagead/conversion.js'],
      registry,
    })
    expect(verdict.verdict).toBe('proven')
  })

  it('proves a partially configured platform, where only PostHog has an identifier', () => {
    const verdict = judgeAcceptedLoads({
      emitted: ['el-posthog'],
      requested: ['https://us.i.posthog.com/static/array.js'],
      registry,
    })
    expect(verdict.verdict).toBe('proven')
  })

  it('refuses a script element it does not know how to judge, rather than ignoring it', () => {
    const verdict = judgeAcceptedLoads({ emitted: ['el-some-new-tracker'], requested: [], registry })
    expect(verdict.verdict).toBe('mismatch')
    expect(verdict.detail).toContain('does not know how to judge')
  })
})

describe('AN1: the judgement throws on a caller that hands it nothing', () => {
  // The AQ3 calibration probe reported that a guard could see while testing the
  // string "undefined" against both matchers. A judgement that answers a
  // question it was not asked is the same fault, and here it would answer
  // "your gate emitted nothing", which reads as a product failure.
  it('throws rather than reporting an empty gate', () => {
    expect(() =>
      judgeAcceptedLoads({ emitted: undefined as never, requested: [], registry }),
    ).toThrow(/needs emitted, requested and registry as arrays/)
  })

  it('throws when the registry is missing, rather than judging against nothing', () => {
    expect(() =>
      judgeAcceptedLoads({ emitted: ['el-posthog'], requested: [], registry: undefined as never }),
    ).toThrow(/needs emitted, requested and registry as arrays/)
  })
})
