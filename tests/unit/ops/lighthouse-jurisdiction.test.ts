import { describe, expect, test, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { LIGHTHOUSE_CI_CHECK, judgeLighthouseJurisdiction, rulesetCoversMain } from '../../../scripts/ops/lighthouse-jurisdiction.mjs'
import { lighthouseStep } from '../../../scripts/ops/pre-push-gate.mjs'
import { inspectLighthouseJurisdiction } from '../../../scripts/guards/pre-push-gate-wired.mjs'

/**
 * The founder ruling of 25 September 2026: page speed is judged by the
 * Lighthouse CI check on GitHub while main requires it, and by this machine
 * whenever it does not, or whenever that cannot be established.
 */

const ROOT = join(__dirname, '..', '..', '..')
const required = { protection: { required_status_checks: { contexts: ['lint · typecheck · build', LIGHTHOUSE_CI_CHECK] } }, rulesets: [] }
const notRequired = { protection: { required_status_checks: { contexts: ['lint · typecheck · build'] } }, rulesets: [] }

describe('judgeLighthouseJurisdiction', () => {
  test('the check GitHub names is the measuring job, not the preview resolver', () => {
    const workflow = readFileSync(join(ROOT, '.github', 'workflows', 'lighthouse.yml'), 'utf8')
    expect(LIGHTHOUSE_CI_CHECK).toBe('Lighthouse mobile gate')
    expect(workflow).toContain(`name: ${LIGHTHOUSE_CI_CHECK}`)
  })

  test('required by classic protection, in contexts or in checks: GitHub judges', () => {
    expect(judgeLighthouseJurisdiction(required).judgedHere).toBe(false)
    const viaChecks = { protection: { required_status_checks: { contexts: [], checks: [{ context: LIGHTHOUSE_CI_CHECK, app_id: 15368 }] } }, rulesets: [] }
    expect(judgeLighthouseJurisdiction(viaChecks).judgedHere).toBe(false)
  })

  test('not required, no protection at all, unreadable, or no answer: this machine judges', () => {
    expect(judgeLighthouseJurisdiction(notRequired).judgedHere).toBe(true)
    expect(judgeLighthouseJurisdiction({ protection: null, rulesets: [] }).judgedHere).toBe(true)
    expect(judgeLighthouseJurisdiction({ error: 'HTTP 401' }).judgedHere).toBe(true)
    expect(judgeLighthouseJurisdiction(null).judgedHere).toBe(true)
  })

  test('the Resolve Vercel preview job alone does not count', () => {
    const resolverOnly = { protection: { required_status_checks: { contexts: ['Resolve Vercel preview'] } }, rulesets: [] }
    expect(judgeLighthouseJurisdiction(resolverOnly).judgedHere).toBe(true)
  })

  const ruleset = (over: Record<string, unknown>) => ({
    name: 'main',
    enforcement: 'active',
    conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } },
    rules: [{ type: 'required_status_checks', parameters: { required_status_checks: [{ context: LIGHTHOUSE_CI_CHECK }] } }],
    ...over,
  })

  test('an active ruleset on main that requires it: GitHub judges', () => {
    expect(judgeLighthouseJurisdiction({ protection: null, rulesets: [ruleset({})] }).judgedHere).toBe(false)
  })

  test('a ruleset that is evaluate-only, excludes branches, or targets another branch never waives the local step', () => {
    expect(judgeLighthouseJurisdiction({ protection: null, rulesets: [ruleset({ enforcement: 'evaluate' })] }).judgedHere).toBe(true)
    expect(
      judgeLighthouseJurisdiction({ protection: null, rulesets: [ruleset({ conditions: { ref_name: { include: ['~ALL'], exclude: ['refs/heads/main'] } } })] }).judgedHere,
    ).toBe(true)
    expect(
      judgeLighthouseJurisdiction({ protection: null, rulesets: [ruleset({ conditions: { ref_name: { include: ['refs/heads/release/*'], exclude: [] } } })] }).judgedHere,
    ).toBe(true)
    expect(rulesetCoversMain(ruleset({ conditions: { ref_name: { include: ['~ALL'], exclude: [] } } }))).toBe(true)
  })
})

describe('lighthouseStep', () => {
  test('required: prints NOT JUDGED HERE, names the check, does not run, does not block', async () => {
    const run = vi.fn(async () => 1)
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const out = await lighthouseStep({}, { ask: () => required, run })
    const printed = log.mock.calls.map((c) => String(c[0])).join('\n')
    log.mockRestore()
    expect(run).not.toHaveBeenCalled()
    expect(out).toEqual({ code: 0, label: 'NOT JUDGED' })
    expect(printed).toContain('NOT JUDGED HERE')
    expect(printed).toContain(`"${LIGHTHOUSE_CI_CHECK}"`)
  })

  test.each([
    ['not required', notRequired],
    ['unreadable', { error: 'gh: HTTP 401 Bad credentials' }],
    ['no answer', null],
  ])('%s: runs the local step and returns exactly its exit code, so a red run blocks as before', async (_label, state) => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const red = await lighthouseStep({}, { ask: () => state, run: async () => 1 })
    const green = await lighthouseStep({}, { ask: () => state, run: async () => 0 })
    log.mockRestore()
    expect(red).toBe(1)
    expect(green).toBe(0)
  })
})

describe('pre-push-gate-wired, clause 4', () => {
  const gate = readFileSync(join(ROOT, 'scripts', 'ops', 'pre-push-gate.mjs'), 'utf8')

  test('the real gate and the real judgement pass', () => {
    expect(inspectLighthouseJurisdiction(gate)).toEqual([])
  })

  test('a judgement that waives on doubt is refused', () => {
    const lenient = () => ({ judgedHere: false })
    expect(inspectLighthouseJurisdiction(gate, lenient).join('\n')).toContain('waives the local step when protection could not be read')
  })

  test('a gate whose lighthouse step no longer asks is refused', () => {
    const bypassed = gate.replace('run: (env) => lighthouseStep(env),', 'run: () => 0,')
    expect(inspectLighthouseJurisdiction(bypassed).join('\n')).toContain('no longer routes its lighthouse step through lighthouseStep')
  })
})
