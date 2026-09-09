/**
 * The launch readiness adjudication (close-out L5), driven over every shape it
 * can take without the network or the disk.
 *
 * The guard drills prove the guard FAILS on a broken tree. These prove the
 * judgement underneath it is right about WHY, which a drill cannot: a drill that
 * expects a substring passes on any fault that happens to contain it.
 */
import { describe, expect, it } from 'vitest'

import {
  ITEMS,
  L1_ITEM_COUNT,
  OWNER_NEEDS,
  STATES,
  countSentences,
  judgeLaunchReadiness,
  renderMarkdown,
} from '../../../scripts/verify/launch-readiness.mjs'

const always = () => true
const never = () => false

/**
 * A minimal legal set of rows, one per L1 item, so each test can break exactly
 * one thing. Sized from L1_ITEM_COUNT rather than a literal: close-out UX2.5
 * added a seventeenth item and five of these tests failed on a hardcoded 16,
 * which is the drift this now cannot have.
 */
const everyRow = (override: Record<number, unknown> = {}) =>
  Array.from({ length: L1_ITEM_COUNT }, (_, i) => ({
    n: i + 1,
    group: 'PLATFORM',
    requirement: `requirement ${i + 1}`,
    state: 'OWNER BLOCKED',
    needs: 'test-account',
    ...(override[i + 1] as object | undefined),
  }))

describe('countSentences', () => {
  it('counts one sentence as one', () => {
    expect(countSentences('Approval to do the thing, because of the reason.')).toBe(1)
  })

  it('counts two sentences as two', () => {
    expect(countSentences('Approval to do the thing. It would also be convenient.')).toBe(2)
  })

  it('is not fooled by a full stop inside a path or a version', () => {
    expect(countSentences('Approval to read docs/PRICING.md on version 2.116.0 of the CLI.')).toBe(1)
  })
})

describe('judgeLaunchReadiness', () => {
  it('passes the shipped adjudication with its real evidence present', () => {
    const { faults, counts } = judgeLaunchReadiness({ items: ITEMS, evidenceExists: always })
    expect(faults).toEqual([])
    expect(counts.PASS + counts['OWNER BLOCKED'] + counts.FAIL).toBe(L1_ITEM_COUNT)
  })

  it('is NOT launch ready unless every row passes', () => {
    const { launchReady } = judgeLaunchReadiness({ items: ITEMS, evidenceExists: always })
    expect(launchReady).toBe(false)

    const allPass = everyRow(
      Object.fromEntries(
        Array.from({ length: L1_ITEM_COUNT }, (_, i) => [
          i + 1,
          { state: 'PASS', needs: undefined, evidence: ['docs/x.json'], driven: '2026-09-09' },
        ]),
      ),
    )
    // ownerNeeds is empty here, and that is the point rather than a convenience:
    // a launch-ready platform has nothing outstanding for the owner to supply, so
    // a declared need with no row citing it would correctly be a fault.
    expect(judgeLaunchReadiness({ items: allPass, evidenceExists: always, ownerNeeds: {} }).launchReady).toBe(true)
    expect(judgeLaunchReadiness({ items: allPass, evidenceExists: always }).faults.join('\n')).toContain(
      'is declared and no row cites it',
    )
  })

  it('fails a PASS row that cites no evidence', () => {
    const items = everyRow({ 4: { state: 'PASS', needs: undefined, driven: '2026-09-09' } })
    const { faults } = judgeLaunchReadiness({ items, evidenceExists: always })
    expect(faults.join('\n')).toContain('claims PASS and cites no evidence')
  })

  it('fails a PASS row whose evidence is not on disk', () => {
    const items = everyRow({
      4: { state: 'PASS', needs: undefined, evidence: ['docs/gone.json'], driven: '2026-09-09' },
    })
    const { faults } = judgeLaunchReadiness({ items, evidenceExists: never })
    expect(faults.join('\n')).toContain('which is not in the repository')
  })

  it('fails a PASS row with no date driven, which L5 asks for by name', () => {
    const items = everyRow({ 4: { state: 'PASS', needs: undefined, evidence: ['docs/x.json'] } })
    const { faults } = judgeLaunchReadiness({ items, evidenceExists: always })
    expect(faults.join('\n')).toContain('carries no date driven')
  })

  it('fails a PASS row that also names an owner need, which is the C10.4 shape', () => {
    const items = everyRow({
      4: { state: 'PASS', needs: 'real-card', evidence: ['docs/x.json'], driven: '2026-09-09' },
    })
    const { faults } = judgeLaunchReadiness({ items, evidenceExists: always })
    expect(faults.join('\n')).toContain('also names an owner need')
  })

  it('fails an OWNER BLOCKED row that names no need', () => {
    const items = everyRow({ 4: { needs: undefined } })
    const { faults } = judgeLaunchReadiness({ items, evidenceExists: always })
    expect(faults.join('\n')).toContain('names no need')
  })

  it('fails an OWNER BLOCKED row naming a need outside the reviewed list', () => {
    const items = everyRow({ 4: { needs: 'a-pony' } })
    const { faults } = judgeLaunchReadiness({ items, evidenceExists: always })
    expect(faults.join('\n')).toContain('which is not in the reviewed list')
  })

  it('fails an OWNER BLOCKED need written as more than one sentence', () => {
    const items = everyRow({ 4: { needs: 'wordy' } })
    const { faults } = judgeLaunchReadiness({
      items,
      evidenceExists: always,
      ownerNeeds: { ...OWNER_NEEDS, wordy: 'Approval to do it. And also this.' },
    })
    expect(faults.join('\n')).toContain('C10.4 says one')
  })

  it('fails an OWNER BLOCKED row that cites evidence as if it were driven', () => {
    const items = everyRow({ 4: { evidence: ['docs/x.json'] } })
    const { faults } = judgeLaunchReadiness({ items, evidenceExists: always })
    expect(faults.join('\n')).toContain('cites evidence as if it were driven')
  })

  it('fails a FAIL row that says nothing about what failed', () => {
    const items = everyRow({ 4: { state: 'FAIL', needs: undefined } })
    const { faults } = judgeLaunchReadiness({ items, evidenceExists: always })
    expect(faults.join('\n')).toContain('says nothing about what failed')
  })

  it('fails a missing L1 row', () => {
    const items = everyRow().filter((i) => i.n !== 9)
    const { faults } = judgeLaunchReadiness({ items, evidenceExists: always })
    expect(faults.join('\n')).toContain('L1 item 9 has no row')
  })

  it('fails a row outside the declared count', () => {
    const items = [
      ...everyRow(),
      { n: L1_ITEM_COUNT + 1, group: 'X', requirement: 'invented', state: 'PASS', evidence: ['docs/x.json'], driven: '2026-09-09' },
    ]
    const { faults } = judgeLaunchReadiness({ items, evidenceExists: always })
    expect(faults.join('\n')).toContain(`item ${L1_ITEM_COUNT + 1} is outside L1`)
  })

  it('fails a duplicated row rather than silently taking the last one', () => {
    const items = [...everyRow(), everyRow()[3]]
    const { faults } = judgeLaunchReadiness({ items, evidenceExists: always })
    expect(faults.join('\n')).toContain('appears more than once')
  })

  it('refuses a state outside the three', () => {
    const items = everyRow({ 4: { state: 'PROBABLY FINE' } })
    const { faults } = judgeLaunchReadiness({ items, evidenceExists: always })
    expect(faults.join('\n')).toContain('is not one of')
    expect(STATES).toEqual(['PASS', 'OWNER BLOCKED', 'FAIL'])
  })
})

describe('the shipped adjudication', () => {
  it('carries exactly the L1 items, numbered 1 to L1_ITEM_COUNT', () => {
    expect(ITEMS.map((i) => i.n)).toEqual(Array.from({ length: L1_ITEM_COUNT }, (_, i) => i + 1))
  })

  it('states every owner need in exactly one sentence', () => {
    for (const [key, sentence] of Object.entries(OWNER_NEEDS)) {
      expect(countSentences(sentence), `${key} is more than one sentence`).toBe(1)
    }
  })

  it('names where every OWNER BLOCKED journey HAS been driven, so blocked never reads as untested', () => {
    for (const item of ITEMS.filter((i) => i.state === 'OWNER BLOCKED')) {
      expect(String(item.drivenElsewhere ?? '').trim(), `item ${item.n}`).not.toBe('')
    }
  })
})

describe('renderMarkdown', () => {
  const render = () => {
    const { counts, launchReady } = judgeLaunchReadiness({ items: ITEMS, evidenceExists: always })
    return renderMarkdown({ items: ITEMS, counts, launchReady })
  }

  it('is byte-stable, which is what lets the guard compare the file to a fresh render', () => {
    expect(render()).toBe(render())
  })

  it('leads with the verdict and states it as not launch ready while a row is not PASS', () => {
    expect(render()).toContain('## VERDICT: NOT LAUNCH READY')
  })

  it('renders one row per L1 item', () => {
    const md = render()
    for (const item of ITEMS) expect(md).toContain(item.requirement)
  })

  it('says an OWNER BLOCKED row blocks as hard as a FAIL, so the state cannot read as a softening', () => {
    expect(render()).toContain('blocks the launch exactly as hard as a FAIL')
  })

  /*
   * THE CLOSING PARAGRAPH'S NUMBERS ARE DERIVED, and these tests exist because
   * one of them was not and had gone stale. On 9 September 2026 the shipped
   * report said the gap was "exactly three approvals wide" while OWNER_NEEDS held
   * TWO entries: the third had been removed when the anti-rot rule found the list
   * holding a need no row cited, and the prose was never touched. A hand-written
   * count in this document is a second place a claim can live, which is the exact
   * thing the whole report is built to prevent.
   */
  it('counts the approvals from the rows rather than from a sentence somebody typed', () => {
    const distinct = new Set(
      ITEMS.filter((i) => i.state === 'OWNER BLOCKED')
        .map((i) => i.needs)
        .filter(Boolean),
    ).size
    expect(render()).toContain(`exactly ${distinct} approval`)
  })

  it('a third need appearing in the rows moves the sentence, so it cannot go stale again', () => {
    const items = ITEMS.map((i, index) =>
      index === 0 && i.state === 'OWNER BLOCKED' ? { ...i, needs: 'a-third-need' } : i,
    )
    const { counts, launchReady } = judgeLaunchReadiness({
      items,
      evidenceExists: always,
      ownerNeeds: { ...OWNER_NEEDS, 'a-third-need': 'Approval for a third thing, invented by this test.' },
    })
    const md = renderMarkdown({
      items,
      counts,
      launchReady,
      ownerNeeds: { ...OWNER_NEEDS, 'a-third-need': 'Approval for a third thing, invented by this test.' },
    })
    // Derived, not typed: the whole point of the test is that this sentence
    // MOVES with the number of needs. A literal here goes stale the moment a
    // real third need is added, which is exactly what happened on 9 September
    // 2026 when 'release-on-production' joined the map.
    const needCount = Object.keys({ ...OWNER_NEEDS, 'a-third-need': '' }).length
    expect(md).toContain(`exactly ${needCount} approvals wide`)
  })

  it('counts the rows that record where they HAVE been driven, rather than saying twelve', () => {
    const driven = ITEMS.filter((i) => i.state === 'OWNER BLOCKED' && i.drivenElsewhere).length
    expect(render()).toContain(`${driven} of them carr`)
  })
})

describe('the reviewed owner-need list cannot rot', () => {
  it('fails a declared need that no row cites', () => {
    const items = everyRow()
    const { faults } = judgeLaunchReadiness({
      items,
      evidenceExists: always,
      ownerNeeds: { ...OWNER_NEEDS, 'a-spare-nobody-uses': 'Approval for something no row asks for.' },
    })
    expect(faults.join('\n')).toContain('is declared and no row cites it')
  })

  it('passes when every declared need is cited by at least one row', () => {
    const { faults } = judgeLaunchReadiness({ items: ITEMS, evidenceExists: always })
    expect(faults).toEqual([])
  })
})
