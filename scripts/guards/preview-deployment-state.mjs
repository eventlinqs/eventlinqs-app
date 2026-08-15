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

/**
 * The branch this run is about.
 *
 * `git rev-parse --abbrev-ref HEAD` is right locally and WRONG in CI. GitHub's
 * checkout action leaves a DETACHED HEAD, so that command returns the literal
 * string "HEAD", which matches no `githubCommitRef` on any deployment, so the
 * guard printed "no deployment found for HEAD yet" and exited 0. It would have
 * skipped for ever in the one place it is meant to gate a merge, and the skip
 * line would have read as though the branch simply had no preview yet.
 *
 * GITHUB_HEAD_REF is the source branch of a pull request and is empty otherwise;
 * GITHUB_REF_NAME is the branch on a push. Both are documented on
 * https://docs.github.com/en/actions/reference/variables-reference (fetched
 * 15 August 2026). They are consulted first precisely because git cannot see
 * what they know.
 */
function branch() {
  const fromCi = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME
  if (fromCi) return fromCi
  try {
    const ref = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim()
    return ref === 'HEAD' ? null : ref
  } catch {
    return null
  }
}

const ref = branch()
if (!ref) {
  console.log(
    '[preview-state] SKIP - no branch name available: this is either not a git checkout,\n' +
      '                 or it is a DETACHED HEAD with no GITHUB_HEAD_REF / GITHUB_REF_NAME set.',
  )
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

/*
 * v7, NOT v6. Law 9: never call a superseded version.
 *
 * Vercel's REST reference publishes `GET /v7/deployments` for "List deployments"
 * (https://vercel.com/docs/rest-api/deployments/list-deployments, fetched
 * 14 August 2026). This guard was written against `/v6`, which still appears in
 * Vercel's knowledge base but is not what the reference publishes. The query
 * parameters are identical, so the move costs nothing.
 *
 * UNSOURCED: whether `/v6/deployments` is still supported, and Vercel's
 * deprecation policy for old endpoint versions. No Vercel page stating either
 * could be fetched, so the current version is used rather than the old one on
 * the strength of an assumption that the old one keeps working.
 *
 * `teamId` is still sent because this may be a full-account token, which does
 * require it. Vercel documents that team- and project-scoped tokens do not NEED
 * it; whether they REJECT it is UNSOURCED, so the failure path below reports the
 * body rather than assuming.
 */
const url = `https://api.vercel.com/v7/deployments?projectId=${projectId}&teamId=${teamId}&limit=20`
const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
if (!res.ok) {
  // Print what Vercel actually said. The documented error body is
  // { error: { code, message } } (https://vercel.com/docs/rest-api/errors,
  // fetched 14 August 2026). A bare status code sent somebody hunting the wrong
  // thing once already.
  let detail = ''
  try {
    const body = await res.json()
    if (body?.error) detail = `  ${body.error.code}: ${body.error.message}`
  } catch {
    /* non-JSON body, the status is all there is */
  }
  console.warn(`[preview-state] SKIP - Vercel API answered ${res.status}.${detail ? '\n' + detail : ''}`)
  process.exit(0)
}

const { deployments = [] } = await res.json()
const mine = deployments.filter(d => d?.meta?.githubCommitRef === ref)

if (mine.length === 0) {
  console.log(`[preview-state] no deployment found for ${ref} yet.`)
  process.exit(0)
}

/*
 * READ BOTH `state` AND `readyState`, and be LOUD when neither is present.
 *
 * The v7 reference lists `readyState` among a deployment's required fields and
 * does not mention `state`. This guard was written against `state`. If the field
 * is named differently from what is read here, `settled` is never found, and the
 * old code then printed "still building" and exited 0 FOR EVER: a guard that can
 * never fail, reporting a reassuring message, which is precisely the silent
 * fail-open shape this repository has been closing all week.
 *
 * So both names are accepted, and a deployment carrying NEITHER is reported as a
 * shape mismatch rather than as a build in progress. That distinction is the
 * whole point: "I could not tell" must never render as "it is fine".
 */
const stateOf = d => d?.state ?? d?.readyState ?? null
const SETTLED = new Set(['READY', 'ERROR', 'CANCELED'])

if (mine.every(d => stateOf(d) === null)) {
  console.warn(
    `[preview-state] SKIP - ${mine.length} deployment(s) for ${ref} carry neither a\n` +
      '                 `state` nor a `readyState` field. The API response shape has\n' +
      '                 changed and this guard can no longer read it. It is reporting\n' +
      '                 that plainly rather than reading it as "still building".',
  )
  process.exit(0)
}

// Newest first is the API's order; take the first that has settled.
const settled = mine.find(d => SETTLED.has(stateOf(d)))
if (!settled) {
  console.log(`[preview-state] ${ref}: newest deployment is still building.`)
  process.exit(0)
}

const sha = (settled.meta?.githubCommitSha || '').slice(0, 7)
if (stateOf(settled) === 'ERROR') {
  console.error(
    `\n[preview-state] FAILED: the newest settled deployment for ${ref} is in ERROR (${sha}).\n` +
      `  ${settled.inspectorUrl || settled.url}\n\n` +
      '  The branch alias is serving an OLDER build, so anything "verified on the\n' +
      '  deployed preview" right now was verified against different code.\n' +
      '  Run `npm run build` locally to reproduce it.\n',
  )
  process.exit(1)
}

/*
 * CANCELED is reported, not passed silently. It is "settled" but it is not a
 * successful build, so calling it PASS would let a cancelled deployment stand in
 * for a verified one.
 */
if (stateOf(settled) === 'CANCELED') {
  console.warn(
    `[preview-state] SKIP - newest settled deployment for ${ref} was CANCELED (${sha}).\n` +
      '                 Nothing was built, so there is nothing to verify against.',
  )
  process.exit(0)
}

console.log(`[preview-state] PASS - newest settled deployment for ${ref} is ${stateOf(settled)} (${sha}).`)
