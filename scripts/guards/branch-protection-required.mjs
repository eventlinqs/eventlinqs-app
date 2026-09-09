/**
 * BRANCH PROTECTION HOLDS THE PRODUCTION PARITY CHECK (close-out C16.2.4,
 * 7 September 2026).
 *
 * Two merges to main on 6 September 2026 went red on main and failed to deploy
 * after passing every pull-request check. The repair is a required check on
 * every pull request that asks whether PRODUCTION carries what the tree needs
 * (the `production parity` job, scripts/ops/production-parity.mjs). A required
 * check is only protection while branch protection requires it, and branch
 * protection is a dashboard setting nobody can diff. This guard reads it back
 * from GitHub on every build and fails when:
 *
 *   1. main has no classic protection, or its required status checks do not
 *      include every context in REQUIRED_CONTEXTS;
 *   2. administrators are not held to it (enforce_admins off), pull requests
 *      are not required, force pushes or deletions are allowed;
 *   3. an active ruleset targeting the default branch requires a check set that
 *      omits a context in REQUIRED_CONTEXTS, or carries a bypass actor, which
 *      is a door around the whole thing.
 *
 * Reads with the GitHub CLI's stored login locally (`gh api`) or GITHUB_TOKEN
 * in CI. Without either it SKIPS and says so in capitals, because a guard that
 * fails on every machine without credentials gets disabled within a week; the
 * CI job that carries GITHUB_TOKEN is where it is a gate.
 *
 * The state it enforces was applied on 7 September 2026 and read back
 * (C:\dev\EVIDENCE\C16\branch-protection-after.json).
 */
import { execFileSync } from 'node:child_process'
import { gitEnv } from '../lib/git-env.mjs'
import { gitAvailability, noGitLine } from './lib/git-availability.mjs'

const TAG = '[branch-protection-required]'

export const REQUIRED_CONTEXTS = ['lint · typecheck · build', 'test (vitest)', 'production parity']

export function repositoryFromEnvOrGit() {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY
  try {
    const url = execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8', env: gitEnv() }).trim()
    const m = url.match(/github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?$/)
    if (m) return `${m[1]}/${m[2]}`
  } catch (error) {
    /*
     * NO REPOSITORY IS NOT A MISSING REMOTE. Close-out F2.4: this used to say
     * "no origin remote could be read", which sends the reader looking for a
     * remote on a host that has no repository at all. One sentence shape, from
     * one module, for every git-reading build-time script.
     */
    if (!gitAvailability().usable) {
      console.warn(noGitLine(TAG, 'the repository name from the origin remote'))
    } else {
      console.warn(`${TAG} no origin remote could be read (${error.message})`)
    }
  }
  return null
}

/** Pure judgement over the API shapes, so it can be tested and drilled without the network. */
export function judgeProtection({ protection, rulesets }) {
  const faults = []
  if (!protection) {
    faults.push('main has no classic branch protection')
  } else {
    const contexts = new Set([...(protection.required_status_checks?.contexts ?? []), ...((protection.required_status_checks?.checks ?? []).map((c) => c.context))])
    for (const c of REQUIRED_CONTEXTS) if (!contexts.has(c)) faults.push(`required status checks are missing "${c}"`)
    if (protection.required_status_checks && protection.required_status_checks.strict === false) faults.push('required status checks are not strict (a stale branch could merge)')
    if (!protection.enforce_admins?.enabled) faults.push('administrators are not held to the protection (enforce_admins is off)')
    if (!protection.required_pull_request_reviews) faults.push('pull requests are not required, so a direct push to main is possible')
    if (protection.allow_force_pushes?.enabled) faults.push('force pushes are allowed')
    if (protection.allow_deletions?.enabled) faults.push('deletions are allowed')
  }
  for (const r of rulesets ?? []) {
    if (r.enforcement !== 'active') continue
    const include = r.conditions?.ref_name?.include ?? []
    const targetsMain = include.includes('~DEFAULT_BRANCH') || include.includes('refs/heads/main')
    if (!targetsMain) continue
    const checksRule = (r.rules ?? []).find((x) => x.type === 'required_status_checks')
    if (checksRule) {
      const have = new Set((checksRule.parameters?.required_status_checks ?? []).map((c) => c.context))
      for (const c of REQUIRED_CONTEXTS) if (!have.has(c)) faults.push(`ruleset "${r.name}" requires a check set that omits "${c}"`)
    }
    if ((r.bypass_actors ?? []).length > 0) faults.push(`ruleset "${r.name}" carries ${r.bypass_actors.length} bypass actor(s), a door around the protection`)
  }
  return faults
}

function readJsonWithGh(path) {
  const out = execFileSync('gh', ['api', path], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  return JSON.parse(out)
}

async function readJsonWithToken(path, token) {
  const res = await fetch(`https://api.github.com${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`GET ${path} answered HTTP ${res.status}`)
  return res.json()
}

export async function readProtection(repo) {
  const token = process.env.GITHUB_TOKEN
  const read = token
    ? (p) => readJsonWithToken(p, token)
    : (p) => {
        try {
          return Promise.resolve(readJsonWithGh(p))
        } catch (err) {
          if (/404|Not Found/.test(String(err.message))) return Promise.resolve(null)
          throw err
        }
      }
  const protection = await read(`/repos/${repo}/branches/main/protection`)
  const list = (await read(`/repos/${repo}/rulesets`)) ?? []
  const rulesets = []
  for (const r of list) rulesets.push(await read(`/repos/${repo}/rulesets/${r.id}`))
  return { protection, rulesets: rulesets.filter(Boolean) }
}

function hasCredentials() {
  if (process.env.GITHUB_TOKEN) return true
  try {
    execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    return true
  } catch (error) {
    // gh is absent or logged out: the caller prints the SKIP with the remedy
    return !error
  }
}

const invokedDirectly = process.argv[1] && /branch-protection-required\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))
if (invokedDirectly) {
  const repo = repositoryFromEnvOrGit()
  if (!repo) {
    console.log(`${TAG} SKIP - no GitHub repository could be determined (no GITHUB_REPOSITORY, no origin remote).`)
    process.exit(0)
  }
  if (!hasCredentials()) {
    console.warn(`${TAG} SKIP - NO GITHUB CREDENTIALS HERE (no GITHUB_TOKEN, no gh login), so main's protection is UNKNOWN, not good.`)
    console.warn(`${TAG}   The CI job carries GITHUB_TOKEN and judges it before any merge. Locally, run gh auth login to make this real.`)
    process.exit(0)
  }
  let state
  try {
    state = await readProtection(repo)
  } catch (err) {
    console.error(`${TAG} FAIL - could not read main's protection on ${repo}: ${err.message}`)
    process.exit(1)
  }
  const faults = judgeProtection(state)
  console.log(`${TAG} did ${1 + (state.rulesets?.length ?? 0)} protection read(s) on ${repo}, ${REQUIRED_CONTEXTS.length} required context(s) checked`)
  console.log(`${TAG} found ${faults.length} protection fault(s)`)
  if (faults.length) {
    console.error(`${TAG} FAIL - main's protection does not hold the merge gate:`)
    for (const f of faults) console.error(`  ${f}`)
    console.error(`${TAG}   Required contexts: ${REQUIRED_CONTEXTS.map((c) => JSON.stringify(c)).join(', ')}; pull requests required; admins held; no force push, no deletion, no bypass actor.`)
    process.exit(1)
  }
  console.log(`${TAG} PASS - main requires ${REQUIRED_CONTEXTS.map((c) => JSON.stringify(c)).join(', ')}, holds admins to it, requires a pull request, and no ruleset carries a bypass.`)
}
