import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * THE SESSION-LOG BRANCH MUST NOT BUILD.
 *
 * WHY. `ops/session-log` is an orphan branch that holds only markdown: the
 * build log, the review queue, the ledger. Every push to it triggered a build
 * of the production Vercel project, which failed at prebuild because there is
 * no package.json on that branch, and six of the twenty most recent deployments
 * on 3 September 2026 were exactly that: ERROR rows with no application behind
 * them. The completion brief pushes the log after every item, so left alone
 * this would have manufactured dozens more red deployments and buried the one
 * red deployment that mattered (the blocked production build of 48fe08f7).
 *
 * The fix is one key in vercel.json (git.deploymentEnabled, per
 * https://vercel.com/docs/project-configuration/git-configuration, fetched
 * 2026-09-03). This pins it so a later hand edit of vercel.json cannot quietly
 * drop it: the crons block gets edited often and a merge could lose the sibling.
 */
const ROOT = join(__dirname, '..', '..', '..')

function readConfig(): {
  regions?: string[]
  git?: { deploymentEnabled?: Record<string, boolean> | boolean }
  crons?: { path: string; schedule: string }[]
} {
  return JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'))
}

describe('vercel.json git deployment control', () => {
  test('ops/session-log never triggers a deployment', () => {
    const cfg = readConfig()
    expect(cfg.git).toBeDefined()
    expect(typeof cfg.git?.deploymentEnabled).toBe('object')
    expect((cfg.git?.deploymentEnabled as Record<string, boolean>)['ops/session-log']).toBe(false)
  })

  test('application branches are not disabled by the same block', () => {
    const cfg = readConfig()
    const enabled = cfg.git?.deploymentEnabled as Record<string, boolean>
    // Only the log branch is named. Naming main or integration/launch here as
    // false would silently stop production and preview deployments.
    expect(Object.keys(enabled)).toEqual(['ops/session-log'])
  })

  test('the Sydney region and the cron fleet survived the edit', () => {
    const cfg = readConfig()
    expect(cfg.regions).toEqual(['syd1'])
    expect(Array.isArray(cfg.crons)).toBe(true)
    expect((cfg.crons ?? []).length).toBeGreaterThanOrEqual(17)
    for (const c of cfg.crons ?? []) {
      expect(c.path.startsWith('/api/cron/')).toBe(true)
      expect(c.schedule.trim().split(/\s+/).length).toBe(5)
    }
  })
})
