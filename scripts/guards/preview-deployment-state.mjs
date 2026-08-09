/**
 * preview-deployment-state.mjs
 *
 * FAILS when the newest deployment for the current branch is in ERROR.
 *
 * Founder ruling, 9 August 2026: "A branch whose preview has not built is a
 * branch whose verification is fiction, and nothing should be able to report
 * green while that is true."
 *
 * The finding behind it: feat/public-composer had SIX consecutive preview
 * deployments in ERROR, going back to the act-link commit. The branch alias kept
 * serving the last successful build, so every claim of the form "verified on the
 * deployed preview" on that branch was made against stale code. 1839 unit tests,
 * tsc, eslint and nine guards were all green throughout, because none of them
 * can see a bundler failure.
 *
 * Needs a Vercel token to ask. Without one it SKIPS rather than fails, and says
 * so loudly, because a guard that fails on every machine without credentials
 * gets disabled within a week and then protects nothing. The skip is the honest
 * state, not a pass.
 *
 * Env:
 *   VERCEL_TOKEN     required to query. Absent means skip with a warning.
 *   VERCEL_PROJECT_ID / VERCEL_ORG_ID   default to .vercel/project.json
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const token = process.env.VERCEL_TOKEN
const PROJECT_JSON = '.vercel/project.json'

function branch() {
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

const ref = branch()
if (!ref) {
  console.log('[preview-state] SKIP - not a git checkout.')
  process.exit(0)
}

if (!token) {
  console.warn(
    `[preview-state] SKIP - no VERCEL_TOKEN, so the state of ${ref}'s preview is UNKNOWN, not good.\n` +
      '                 Set VERCEL_TOKEN to make this guard real. Until then, check the\n' +
      '                 deployment state by hand before believing any preview-based claim.',
  )
  process.exit(0)
}

let projectId = process.env.VERCEL_PROJECT_ID
let teamId = process.env.VERCEL_ORG_ID
if ((!projectId || !teamId) && existsSync(PROJECT_JSON)) {
  const cfg = JSON.parse(readFileSync(PROJECT_JSON, 'utf8'))
  projectId = projectId || cfg.projectId
  teamId = teamId || cfg.orgId
}
if (!projectId || !teamId) {
  console.warn('[preview-state] SKIP - no project/team id available.')
  process.exit(0)
}

const url = `https://api.vercel.com/v6/deployments?projectId=${projectId}&teamId=${teamId}&limit=20`
const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
if (!res.ok) {
  console.warn(`[preview-state] SKIP - Vercel API answered ${res.status}.`)
  process.exit(0)
}

const { deployments = [] } = await res.json()
const mine = deployments.filter(d => d?.meta?.githubCommitRef === ref)

if (mine.length === 0) {
  console.log(`[preview-state] no deployment found for ${ref} yet.`)
  process.exit(0)
}

// Newest first is the API's order; take the first that has settled.
const settled = mine.find(d => d.state === 'READY' || d.state === 'ERROR' || d.state === 'CANCELED')
if (!settled) {
  console.log(`[preview-state] ${ref}: newest deployment is still building.`)
  process.exit(0)
}

const sha = (settled.meta?.githubCommitSha || '').slice(0, 7)
if (settled.state === 'ERROR') {
  console.error(
    `\n[preview-state] FAILED: the newest settled deployment for ${ref} is in ERROR (${sha}).\n` +
      `  ${settled.inspectorUrl || settled.url}\n\n` +
      '  The branch alias is serving an OLDER build, so anything "verified on the\n' +
      '  deployed preview" right now was verified against different code.\n' +
      '  Run `npm run build` locally to reproduce it.\n',
  )
  process.exit(1)
}

console.log(`[preview-state] PASS - newest settled deployment for ${ref} is ${settled.state} (${sha}).`)
