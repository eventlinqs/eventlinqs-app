import { describe, expect, test } from 'vitest'
import { judgeProtection, REQUIRED_CONTEXTS } from '../../../scripts/guards/branch-protection-required.mjs'

/**
 * BRANCH PROTECTION HOLDS THE MERGE GATE (close-out C16.2.4): the judgement over
 * GitHub's protection and ruleset shapes, so every way the gate can be lost is
 * named without the network.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const good = (): { protection: any; rulesets: any[] } => ({
  protection: {
    required_status_checks: { strict: true, contexts: [...REQUIRED_CONTEXTS], checks: REQUIRED_CONTEXTS.map((context) => ({ context })) },
    enforce_admins: { enabled: true },
    required_pull_request_reviews: { required_approving_review_count: 0 },
    allow_force_pushes: { enabled: false },
    allow_deletions: { enabled: false },
  },
  rulesets: [
    {
      name: 'main-protection',
      enforcement: 'active',
      conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } },
      rules: [{ type: 'pull_request' }, { type: 'required_status_checks', parameters: { required_status_checks: REQUIRED_CONTEXTS.map((context) => ({ context })) } }],
      bypass_actors: [],
    },
  ],
})

describe('judgeProtection', () => {
  test('the required state passes', () => {
    expect(judgeProtection(good())).toEqual([])
  })

  test('production parity missing from the required checks fails, in the classic protection and in the ruleset', () => {
    const s = good()
    s.protection.required_status_checks.contexts = ['lint · typecheck · build', 'test (vitest)']
    s.protection.required_status_checks.checks = s.protection.required_status_checks.contexts.map((context: string) => ({ context }))
    s.rulesets[0].rules[1].parameters.required_status_checks = [{ context: 'lint · typecheck · build' }]
    const faults = judgeProtection(s)
    expect(faults.join('\n')).toMatch(/required status checks are missing "production parity"/)
    expect(faults.join('\n')).toMatch(/ruleset "main-protection" requires a check set that omits "production parity"/)
  })

  test('admins not held, pull requests not required, force pushes, deletions and a bypass actor each fail', () => {
    const s = good()
    s.protection.enforce_admins.enabled = false
    s.protection.required_pull_request_reviews = null
    s.protection.allow_force_pushes.enabled = true
    s.protection.allow_deletions.enabled = true
    s.rulesets[0].bypass_actors = [{ actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'always' }]
    const text = judgeProtection(s).join('\n')
    expect(text).toMatch(/enforce_admins is off/)
    expect(text).toMatch(/direct push to main is possible/)
    expect(text).toMatch(/force pushes are allowed/)
    expect(text).toMatch(/deletions are allowed/)
    expect(text).toMatch(/bypass actor/)
  })

  test('no protection at all fails, and an inactive or non-main ruleset is ignored', () => {
    expect(judgeProtection({ protection: null, rulesets: [] }).join('\n')).toMatch(/no classic branch protection/)
    const s = good()
    s.rulesets[0].enforcement = 'disabled'
    s.rulesets[0].bypass_actors = [{ actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'always' }]
    expect(judgeProtection(s)).toEqual([])
  })
})
