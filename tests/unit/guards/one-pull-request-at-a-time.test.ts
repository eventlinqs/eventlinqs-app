import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { judgeOpenPullRequests, MAX_ACTIVE } from '../../../scripts/guards/one-pull-request-at-a-time.mjs'

/**
 * ONE OPEN PULL REQUEST AT A TIME (close-out PR5).
 *
 * The guard's judgement is pure and exported so every shape can be driven here
 * without the network, the way judgeProtection is. What is being protected is
 * not only the count: it is the REVIEWED RECORD that makes the count survivable.
 * Three of the pull requests open on 9 September 2026 are held on purpose, so a
 * bare threshold would have failed the build on the day it was written. The
 * record is what makes parking legitimate, and these tests are what stop the
 * record becoming an unexamined allowlist.
 */

const ROOT = join(__dirname, '..', '..', '..')
const RECORD_PATH = join(ROOT, 'scripts', 'guards', 'lib', 'parked-pull-requests.json')

const pr = (number: number, branch: string) => ({ number, branch, title: `pull request ${number}`, draft: false })

describe('judgeOpenPullRequests', () => {
  test('zero open passes, and so does exactly one active', () => {
    expect(judgeOpenPullRequests({ open: [], parked: [] }).faults).toEqual([])
    const one = judgeOpenPullRequests({ open: [pr(200, 'feat/the-item')], parked: [] })
    expect(one.faults).toEqual([])
    expect(one.active).toHaveLength(1)
  })

  test('two active fails and names both, because that is the rule PR5 states', () => {
    const { faults, active } = judgeOpenPullRequests({ open: [pr(200, 'feat/a'), pr(201, 'feat/b')], parked: [] })
    expect(active).toHaveLength(2)
    expect(faults.join('\n')).toMatch(/2 pull requests are open and unaccounted for/)
    expect(faults.join('\n')).toMatch(/#200 \(feat\/a\)/)
    expect(faults.join('\n')).toMatch(/#201 \(feat\/b\)/)
    expect(MAX_ACTIVE).toBe(1)
  })

  test('many parked plus one active passes: parking is what makes the rule survivable', () => {
    const parked = [
      { number: 104, branch: 'docs/marketing', why: 'holds files main does not have', unblockedBy: 'the positioning re-read' },
      { number: 97, branch: 'chore/photo', why: 'holds the shot list', unblockedBy: 'photo day' },
      { number: 69, branch: 'feat/genre', why: 'parked by CLAUDE.md', unblockedBy: 'the post-photos taxonomy mission' },
    ]
    const open = [pr(104, 'docs/marketing'), pr(97, 'chore/photo'), pr(69, 'feat/genre'), pr(205, 'feat/the-item')]
    const result = judgeOpenPullRequests({ open, parked })
    expect(result.faults).toEqual([])
    expect(result.active.map((p) => p.number)).toEqual([205])
    expect(result.parkedOpen).toHaveLength(3)
  })

  test('all parked and two active still fails: parking never buys a second active slot', () => {
    const parked = [{ number: 69, branch: 'feat/genre', why: 'parked by CLAUDE.md', unblockedBy: 'the taxonomy mission' }]
    const open = [pr(69, 'feat/genre'), pr(205, 'feat/a'), pr(206, 'feat/b')]
    expect(judgeOpenPullRequests({ open, parked }).faults.join('\n')).toMatch(/2 pull requests are open and unaccounted for/)
  })

  test('a parked entry for a pull request that is no longer open is a fault, not a tidy-up', () => {
    const parked = [{ number: 69, branch: 'feat/genre', why: 'parked', unblockedBy: 'the taxonomy mission' }]
    const faults = judgeOpenPullRequests({ open: [], parked }).faults
    expect(faults.join('\n')).toMatch(/names #69 \(feat\/genre\) and that pull request is not open any more/)
  })

  test('a parked entry whose branch has moved is a fault: the entry is about something else now', () => {
    const parked = [{ number: 69, branch: 'feat/genre', why: 'parked', unblockedBy: 'the taxonomy mission' }]
    const faults = judgeOpenPullRequests({ open: [pr(69, 'feat/genre-rewritten')], parked }).faults
    expect(faults.join('\n')).toMatch(/names branch "feat\/genre" and the open pull request is on "feat\/genre-rewritten"/)
  })

  test('a parked entry with no why, or no unblockedBy, is a fault', () => {
    const noWhy = judgeOpenPullRequests({ open: [pr(69, 'b')], parked: [{ number: 69, branch: 'b', why: '   ', unblockedBy: 'a day' }] })
    expect(noWhy.faults.join('\n')).toMatch(/has no "why"/)
    const noEnd = judgeOpenPullRequests({ open: [pr(69, 'b')], parked: [{ number: 69, branch: 'b', why: 'a reason', unblockedBy: '' }] })
    expect(noEnd.faults.join('\n')).toMatch(/has no "unblockedBy"/)
  })

  test('every faults path still returns the active list, so a caller can report as well as refuse', () => {
    const result = judgeOpenPullRequests({ open: [pr(1, 'a'), pr(2, 'b')], parked: [{ number: 3, branch: 'c', why: 'x', unblockedBy: 'y' }] })
    expect(result.active).toHaveLength(2)
    expect(result.parkedOpen).toEqual([])
    expect(result.faults).toHaveLength(2)
  })
})

describe('the shipped parked record', () => {
  const record = JSON.parse(readFileSync(RECORD_PATH, 'utf8'))

  test('every entry carries a number, a branch, a why and an unblockedBy', () => {
    expect(Array.isArray(record.parked)).toBe(true)
    for (const entry of record.parked) {
      expect(typeof entry.number).toBe('number')
      expect(String(entry.branch).trim().length).toBeGreaterThan(0)
      expect(String(entry.why).trim().length).toBeGreaterThan(0)
      expect(String(entry.unblockedBy).trim().length).toBeGreaterThan(0)
    }
  })

  test('the record judges itself clean when every entry is open, which is the state it was written in', () => {
    const open = record.parked.map((e: { number: number; branch: string }) => pr(e.number, e.branch))
    expect(judgeOpenPullRequests({ open, parked: record.parked }).faults).toEqual([])
  })

  test('the record says when it was audited, so its age is visible rather than assumed', () => {
    expect(record._audited).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
