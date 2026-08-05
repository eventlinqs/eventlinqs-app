// THE AGGREGATION CONTRACT TEST.
//
// On 2026-08-05 the Lighthouse gate failed PR #110 with "found 0.74" from run
// values 0.72, 0.74, 0.71. The median of those is 0.72. 0.74 is the MAXIMUM.
// The single number was read as a median, and hours went into chasing a
// regression on a branch that had changed zero bytes of runtime code on the
// failing route. The gate was aggregating best-of-three while lighthouserc.json's
// own commentary and every human reading it assumed median.
//
// A comment alone cannot prevent that recurring, because a comment and the
// config it describes drift apart silently. This test binds them: the config
// declares its aggregation contract in `_aggregationContract`, every category
// floor must carry that exact method explicitly, and the prose must name it.
// Change one without the other and this test fails.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

type Assertion = string | [string, Record<string, unknown>]

type MatrixEntry = {
  matchingUrlPattern?: string
  assertions?: Record<string, Assertion>
}

const config = JSON.parse(
  readFileSync(join(process.cwd(), 'lighthouserc.json'), 'utf8'),
) as {
  ci: {
    assert: {
      _aggregationContract?: { categoryFloors?: string; _note?: string }
      assertMatrix?: MatrixEntry[]
    }
  }
}

const contract = config.ci.assert._aggregationContract
const matrix = config.ci.assert.assertMatrix ?? []

/** Every categories:* assertion that carries an options object. */
function categoryAssertions(): Array<{
  pattern: string
  name: string
  options: Record<string, unknown>
}> {
  const out: Array<{ pattern: string; name: string; options: Record<string, unknown> }> = []
  for (const entry of matrix) {
    const pattern = entry.matchingUrlPattern ?? '(no pattern)'
    for (const [name, value] of Object.entries(entry.assertions ?? {})) {
      if (!name.startsWith('categories:')) continue
      // "off" switches an assertion off entirely; there is nothing to aggregate.
      if (!Array.isArray(value)) continue
      const options = value[1]
      if (!options || typeof options !== 'object') continue
      out.push({ pattern, name, options })
    }
  }
  return out
}

describe('lighthouse aggregation contract', () => {
  it('declares a contract at all', () => {
    expect(contract, 'lighthouserc.json ci.assert._aggregationContract is missing').toBeDefined()
    expect(contract?.categoryFloors, 'contract does not name a method').toBeTruthy()
  })

  it('only declares a method LHCI actually implements', () => {
    // Guards against a typo like "medium" silently meaning "fall back to the
    // default", which is exactly the class of bug this file exists to stop.
    expect(['median', 'optimistic', 'pessimistic']).toContain(contract?.categoryFloors)
  })

  it('pins every category floor to the declared method, explicitly', () => {
    const found = categoryAssertions()
    expect(found.length, 'no category assertions found; has the config moved?').toBeGreaterThan(0)

    const offenders = found.filter((a) => a.options.aggregationMethod !== contract?.categoryFloors)

    expect(
      offenders.map((o) => `${o.pattern} -> ${o.name} = ${String(o.options.aggregationMethod)}`),
      `every categories:* floor must set aggregationMethod: "${contract?.categoryFloors}" explicitly. ` +
        'An unset method silently defaults to optimistic, which for minScore is Math.max: the BEST run, not the median.',
    ).toEqual([])
  })

  it('the prose names the same method the config uses, so they cannot drift', () => {
    const note = contract?._note ?? ''
    expect(note.length, 'the contract carries no explanatory note').toBeGreaterThan(200)
    expect(
      note.toLowerCase(),
      `the note must name "${contract?.categoryFloors}" so a reader of the prose and a reader of the config get the same answer`,
    ).toContain(String(contract?.categoryFloors).toLowerCase())
  })

  it('states plainly that numeric assertions aggregate differently', () => {
    // The trap has two halves. Under optimistic, minScore takes Math.max and
    // maxNumericValue takes Math.min. Both are "the best run", which is why the
    // event-detail budget pins median on its numeric assertions. A note that
    // only explains the category half leaves the other half to be rediscovered.
    const note = (contract?._note ?? '').toLowerCase()
    expect(note).toContain('numeric')
    expect(note).toContain('median')
  })

  it('keeps the event-detail numeric budget pinned to median', () => {
    const eventEntry = matrix.find((e) => e.matchingUrlPattern === '/events/[^/]+$')
    expect(eventEntry, 'the event-detail budget entry has moved or been removed').toBeDefined()

    const numeric = Object.entries(eventEntry?.assertions ?? {}).filter(
      ([name]) => !name.startsWith('categories:'),
    )
    expect(numeric.length).toBeGreaterThan(0)

    for (const [name, value] of numeric) {
      const options = Array.isArray(value) ? value[1] : undefined
      expect(
        options?.aggregationMethod,
        `${name} must pin aggregationMethod: "median". Without it the budget looks strict and behaves loosely.`,
      ).toBe('median')
    }
  })
})
