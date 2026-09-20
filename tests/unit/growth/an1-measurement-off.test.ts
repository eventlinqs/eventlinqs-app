import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { measurementIsOff, MEASUREMENT_OFF_VAR } from '@/lib/analytics/measurement-off'
import { ANALYTICS_PROVIDERS } from '@/lib/analytics/providers'

/**
 * AN1's REVERSAL CONDITION: "for the platform, one configuration flag removes
 * all analytics and ad scripts from the build."
 *
 * It was unmet from 14 to 19 September and nobody had adjudicated it, because
 * every earlier closure block listed the four ACCEPTANCE lines and stopped
 * there. What stood in its place was "delete the four provider identifiers",
 * which is four deletions in three Vercel scopes and does not touch Plausible,
 * so "all analytics" was false the moment anybody checked.
 */

describe('AN1 reversal: the failure direction of a kill switch is killed', () => {
  it('is off when the documented value is written', () => {
    expect(measurementIsOff('1')).toBe(true)
  })

  it('is NOT off when absent, which is the normal running state', () => {
    expect(measurementIsOff(undefined)).toBe(false)
    expect(measurementIsOff(null)).toBe(false)
  })

  it('is NOT off when empty, because a Vercel variable set to nothing is not an instruction', () => {
    expect(measurementIsOff('')).toBe(false)
    expect(measurementIsOff('   ')).toBe(false)
  })

  it('is NOT off on the two values that unambiguously mean no', () => {
    expect(measurementIsOff('0')).toBe(false)
    expect(measurementIsOff('false')).toBe(false)
    expect(measurementIsOff('FALSE')).toBe(false)
    expect(measurementIsOff(' False ')).toBe(false)
  })

  it('is off on every other value, so a typo fails safe', () => {
    // The whole reason this is not `=== '1'`. Somebody reaches for this flag in
    // a hurry; if they write `true` and the trackers keep running while they
    // believe they are off, the flag has done the opposite of its job.
    for (const typo of ['true', 'TRUE', 'yes', 'on', 'off', 'y', 'please', '2']) {
      expect(measurementIsOff(typo)).toBe(true)
    }
  })

  it('refuses a non-string rather than guessing', () => {
    expect(measurementIsOff(7 as never)).toBe(false)
    expect(measurementIsOff({} as never)).toBe(false)
  })

  it('names the variable once, so a refusal message and the manifest cannot drift', () => {
    expect(MEASUREMENT_OFF_VAR).toBe('NEXT_PUBLIC_MEASUREMENT_OFF')
  })
})

describe('AN1 reversal: the flag reaches every sender', () => {
  const read = (path: string) => readFileSync(path, 'utf8')

  it('is declared in the environment manifest, so the env guards can see it', () => {
    const manifest = read('src/lib/env/manifest.mjs')
    expect(manifest).toContain(`name: '${MEASUREMENT_OFF_VAR}'`)
  })

  it('is optional on every environment, because absent is the normal state', () => {
    const manifest = read('src/lib/env/manifest.mjs')
    const entry = manifest.slice(manifest.indexOf(`name: '${MEASUREMENT_OFF_VAR}'`))
    const block = entry.slice(0, entry.indexOf('},'))
    expect(block).toContain("optionalOn: ['production', 'preview', 'development']")
    expect(block).toContain('requiredOn: []')
  })

  it('is consulted by the consent gate, before consent and before the identifiers', () => {
    const gate = read('src/components/analytics/gated-analytics.tsx')
    const offAt = gate.indexOf('if (MEASUREMENT_OFF) return null')
    const loadingAt = gate.indexOf('if (loading) return null')
    expect(offAt).toBeGreaterThan(-1)
    expect(offAt).toBeLessThan(loadingAt)
  })

  it('is consulted by the server capture BEFORE it reads the key', () => {
    // A reversal that only takes effect once somebody also deletes the keys is
    // the manual procedure it exists to replace.
    const server = read('src/lib/analytics/funnel-server.ts')
    expect(server.indexOf('if (MEASUREMENT_OFF)')).toBeLessThan(
      server.indexOf('process.env.NEXT_PUBLIC_POSTHOG_KEY'),
    )
  })

  it('is consulted by Plausible, which is outside the banner and inside "all analytics"', () => {
    const plausible = read('src/lib/analytics/plausible.ts')
    expect(plausible).toContain('if (MEASUREMENT_OFF) return')
    const layout = read('src/app/layout.tsx')
    expect(layout).toContain('&& !MEASUREMENT_OFF')
  })

  it('covers every provider in the registry through the one gate', () => {
    // The gate is a single early return, so there is no per-provider list to
    // fall out of step with the registry.
    expect(ANALYTICS_PROVIDERS.length).toBeGreaterThan(0)
    const gate = read('src/components/analytics/gated-analytics.tsx')
    expect(gate.match(/if \(MEASUREMENT_OFF\) return null/g)?.length).toBe(1)
  })
})
