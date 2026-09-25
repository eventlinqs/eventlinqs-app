/**
 * WHERE IS PAGE SPEED JUDGED? The pre-push gate asks branch protection, on every
 * push, and does not decide it from memory (founder ruling, 25 September 2026).
 *
 * WHY. On 25 September 2026 this laptop measured a Lighthouse BenchmarkIndex of
 * 1844 to 2102 against the 2700 the floors were confirmed at, and the local
 * Lighthouse step missed six pages by small margins. The same pages, on the same
 * tree, passed the Lighthouse CI job `Lighthouse mobile gate` against the Vercel
 * preview on pull request 159 (runs of 30m38s and 28m47s). The judge is where
 * the code runs.
 *
 * THE RULE, and the reversal condition, evaluated by the machine every time:
 *
 *   - main's protection REQUIRES the check named LIGHTHOUSE_CI_CHECK (classic
 *     protection, or an active ruleset on the default branch): the local step
 *     prints NOT JUDGED HERE, names that check, and does not block. The pull
 *     request cannot merge until GitHub has judged it, so nothing is skipped.
 *   - it is NOT required, or protection cannot be read (no credentials, no
 *     network, an API error): the local step runs and blocks exactly as it did
 *     before this ruling. Doubt runs the gate; it never waives it.
 *
 * Read on 25 September 2026 (gh api repos/eventlinqs/eventlinqs-app/branches/main/protection):
 *   "contexts":["lint · typecheck · build","test (vitest)","production parity","Lighthouse mobile gate"]
 *
 * No floor lives here and none is touched: lighthouserc.json and
 * scripts/guards/lighthouse-floor-ratchet.mjs are the floors, and the CI job
 * asserts them.
 */
import { execFileSync } from 'node:child_process'
import { gitEnv } from '../lib/git-env.mjs'

/** The job name in .github/workflows/lighthouse.yml that measures and asserts. Not `Resolve Vercel preview`. */
export const LIGHTHOUSE_CI_CHECK = 'Lighthouse mobile gate'

/**
 * Pure judgement over the two API shapes, so it is tested without a network.
 * `state` is null when protection could not be read at all.
 */
export function judgeLighthouseJurisdiction(state, check = LIGHTHOUSE_CI_CHECK) {
  if (!state || state.error) {
    return { judgedHere: true, reason: `main's protection could not be read (${state?.error ?? 'no answer'}), so this machine judges` }
  }
  const { protection, rulesets } = state
  const classic = new Set([
    ...(protection?.required_status_checks?.contexts ?? []),
    ...((protection?.required_status_checks?.checks ?? []).map((c) => c.context)),
  ])
  if (classic.has(check)) {
    return { judgedHere: false, reason: `main's branch protection requires "${check}"`, requiredBy: 'branch protection' }
  }
  for (const r of rulesets ?? []) {
    if (r?.enforcement !== 'active') continue
    if (!rulesetCoversMain(r)) continue
    const rule = (r.rules ?? []).find((x) => x.type === 'required_status_checks')
    const have = (rule?.parameters?.required_status_checks ?? []).map((c) => c.context)
    if (have.includes(check)) {
      return { judgedHere: false, reason: `the active ruleset "${r.name}" on main requires "${check}"`, requiredBy: `ruleset ${r.name}` }
    }
  }
  return { judgedHere: true, reason: `"${check}" is not a required check on main, so this machine judges` }
}

/**
 * Does a ruleset's ref condition cover main? Only the three spellings that
 * certainly do count; a glob or an exclusion that might not is read as "does
 * not cover", because a wrong "covers" would waive the local step for a branch
 * GitHub never judges, and a wrong "does not cover" only runs the local step.
 */
export function rulesetCoversMain(ruleset) {
  const include = ruleset?.conditions?.ref_name?.include ?? []
  const exclude = ruleset?.conditions?.ref_name?.exclude ?? []
  const names = ['~DEFAULT_BRANCH', 'refs/heads/main']
  if (exclude.length > 0) return false
  return include.includes('~ALL') || names.some((n) => include.includes(n))
}

function repository() {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY
  try {
    const url = execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8', env: gitEnv(), stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    const m = url.match(/github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?$/)
    return m ? `${m[1]}/${m[2]}` : null
  } catch (error) {
    // no origin remote: the caller says "could not read" and the local step runs
    void error
    return null
  }
}

/**
 * gh in a CHILD process, never fetch in this one: the gate must not hold a
 * network handle of its own (the Windows UV_HANDLE_CLOSING exit, nodejs/node#56645).
 * A 404 means "no such protection", which is an answer; anything else is "could not read".
 */
function ghJson(path) {
  try {
    return { value: JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 })) }
  } catch (error) {
    const text = `${error.stderr ?? ''} ${error.message ?? ''}`
    if (/HTTP 404|Not Found/.test(text)) return { value: null }
    return { error: text.trim().split(/\r?\n/)[0] || 'gh failed' }
  }
}

/**
 * Reads main's protection, and the rulesets only when classic protection does
 * not already require the check. Never throws; an unreadable answer is { error }.
 */
export function readMainProtection() {
  const repo = repository()
  if (!repo) return { error: 'no GitHub repository could be determined from GITHUB_REPOSITORY or the origin remote' }
  const protection = ghJson(`repos/${repo}/branches/main/protection`)
  if (protection.error) return { error: `gh api .../branches/main/protection: ${protection.error}` }
  if (!judgeLighthouseJurisdiction({ protection: protection.value, rulesets: [] }).judgedHere) {
    return { repo, protection: protection.value, rulesets: [] }
  }
  const list = ghJson(`repos/${repo}/rulesets`)
  if (list.error) return { error: `gh api .../rulesets: ${list.error}` }
  const rulesets = []
  for (const r of list.value ?? []) {
    const one = ghJson(`repos/${repo}/rulesets/${r.id}`)
    if (one.error) return { error: `gh api .../rulesets/${r.id}: ${one.error}` }
    if (one.value) rulesets.push(one.value)
  }
  return { repo, protection: protection.value, rulesets }
}
