/**
 * preview-deployment-state.mjs
 *
 * FAILS when the deployment of THE COMMIT UNDER TEST is in ERROR, and in CI
 * waits for that deployment to settle before judging it.
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
 * WHAT WAS WRONG WITH THE FIRST VERSION, found 7 September 2026 (close-out
 * C16). It judged "the newest SETTLED deployment for the branch". Vercel and
 * GitHub Actions start at the same push; a production build of this project
 * takes 2m12s to 2m32s to reach READY (four merges measured,
 * C:\dev\EVIDENCE\C16\probe-deployments-by-sha.txt), a failing one settles in
 * 1m01s, and this guard runs 2m02s to 2m28s into the CI job. So while the
 * commit's own build was still running, the guard fell through to the PREVIOUS
 * commit's deployment and judged that instead. Every green run of CI on main
 * since 5 September passed on an older commit's READY (the C3 merge passed on
 * 9f530a4's, ten seconds before its own went READY), and both red runs on
 * 6 September were caught only because a failing build settles faster than
 * the job reaches this guard. Two consequences, both wrong:
 *
 *   - The merge after a red one is judged by the red one for as long as its
 *     own build is running, so main goes red AGAIN on the very commit that
 *     repairs it, and the owner receives one more failed-run email.
 *   - A build that fails slower than about two and a half minutes is passed on
 *     the strength of the previous commit's READY: a false green on the one
 *     check that exists to refuse it.
 *
 * NOW the deployment judged is the one carrying the commit under test, read
 * through the endpoint's own `sha` filter (GET /v7/deployments, query `sha`;
 * `readyState` is a required field of every deployment and `state` mirrors it;
 * https://vercel.com/docs/rest-api/deployments/list-deployments, last updated
 * 2026-09-06, fetched 2026-09-07). In CI the guard WAITS for it to settle: up
 * to PREVIEW_STATE_WAIT_SECONDS (default 600) polling every 15 s, and up to
 * PREVIEW_STATE_CREATE_GRACE_SECONDS (default 90) for Vercel to create it at
 * all. READY passes; ERROR or BLOCKED fails; CANCELED or DELETED skips loudly;
 * still building past the wait FAILS, because a build nobody has seen finish
 * is exactly the fiction the ruling names. Outside CI nothing waits: the
 * commit at HEAD has normally not been pushed yet, so "no deployment" is the
 * honest state, and the pre-push gate is never stalled for a build that cannot
 * exist.
 *
 * THE COMMIT UNDER TEST. On a push, GITHUB_SHA is the tip commit pushed. On a
 * pull request GITHUB_SHA is the MERGE commit on refs/pull/N/merge, which
 * Vercel never builds; the head commit is `pull_request.head.sha` in the event
 * payload at GITHUB_EVENT_PATH
 * (https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows,
 * fetched 2026-09-07). Locally it is git's HEAD, and a checkout without git
 * (Vercel's build container) reads as "no commit", never as a wrong one.
 *
 * Needs a token to ask: VERCEL_TOKEN (the repository secret in CI), otherwise
 * the login the Vercel CLI keeps on this machine (scripts/lib/vercel-login.mjs,
 * never printed). Without either it SKIPS rather than fails, and says so
 * loudly, because a guard that fails on every machine without credentials gets
 * disabled within a week and then protects nothing. The skip is the honest
 * state, not a pass.
 *
 * Env:
 *   VERCEL_TOKEN                        the token; absent means the CLI login, then a loud skip
 *   VERCEL_PROJECT_ID / VERCEL_ORG_ID   default to .vercel/project.json
 *   PREVIEW_STATE_WAIT_SECONDS          CI only: how long to wait for the commit's deployment to settle (600)
 *   PREVIEW_STATE_CREATE_GRACE_SECONDS  CI only: how long to wait for Vercel to create it (90)
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

import { gitEnv } from '../lib/git-env.mjs'
import { gitAvailability, noGitLine } from './lib/git-availability.mjs'
import { resolveVercelToken } from '../lib/vercel-login.mjs'
import { declareWork } from '../lib/work-report.mjs'

const TAG = '[preview-state]'
const PROJECT_JSON = '.vercel/project.json'

export const DEFAULT_WAIT_SECONDS = 600
export const DEFAULT_CREATE_GRACE_SECONDS = 90
export const POLL_INTERVAL_MS = 15_000

const short = (sha) => (typeof sha === 'string' ? sha.slice(0, 7) : '(none)')

/**
 * The branch this run is about.
 *
 * `git rev-parse --abbrev-ref HEAD` is right locally and WRONG in CI. GitHub's
 * checkout action leaves a DETACHED HEAD, so that command returns the literal
 * string "HEAD". GITHUB_HEAD_REF is the source branch of a pull request and is
 * empty otherwise; GITHUB_REF_NAME is the branch on a push. Both are documented
 * on https://docs.github.com/en/actions/reference/variables-reference (fetched
 * 15 August 2026). They are consulted first precisely because git cannot see
 * what they know. The branch is reported, never judged: the judgement is by
 * commit.
 * @param {Record<string, string | undefined>} [env]
 * @param {() => string | null} [gitBranch]
 */
export function branchUnderTest(env = process.env, gitBranch = gitHeadBranch) {
  const fromCi = env.GITHUB_HEAD_REF || env.GITHUB_REF_NAME
  if (fromCi) return fromCi
  return gitBranch()
}

function gitHeadBranch() {
  try {
    const ref = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8', env: gitEnv() }).trim()
    return ref === 'HEAD' ? null : ref
  } catch (error) {
    // Close-out F2.4: one sentence shape for the absent repository, and the
    // ordinary error only when there IS one.
    if (!gitAvailability().usable) console.log(noGitLine(TAG, 'the branch under test'))
    else console.log(`${TAG} git could not name the branch here (${error.message}); the branch is reported only, never judged`)
    return null
  }
}

function gitHeadSha() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', env: gitEnv() }).trim() || null
  } catch (error) {
    if (!gitAvailability().usable) console.log(noGitLine(TAG, 'the commit under test'))
    else console.log(`${TAG} git could not name the commit here (${error.message}): there is a repository, and it could not answer`)
    return null
  }
}

function readEventPayload(path) {
  if (!path || !existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    console.warn(`${TAG} the event payload at ${path} could not be read (${error.message})`)
    return null
  }
}

/**
 * The commit whose deployment is judged, and where that answer came from.
 * Pure over its inputs so the pull-request case is tested without GitHub.
 * @param {Record<string, string | undefined>} [env]
 * @param {(path: string | undefined) => any} [readPayload]
 * @param {() => string | null} [gitHead]
 * @returns {{ sha: string | null, source: string }}
 */
export function commitUnderTest(env = process.env, readPayload = readEventPayload, gitHead = gitHeadSha) {
  if (env.GITHUB_EVENT_NAME === 'pull_request') {
    const head = readPayload(env.GITHUB_EVENT_PATH)?.pull_request?.head?.sha
    if (typeof head === 'string' && head.length > 0) return { sha: head, source: 'pull_request.head.sha from the event payload' }
    return { sha: null, source: 'a pull_request event whose payload carries no head sha (GITHUB_SHA is the merge commit, which Vercel never builds)' }
  }
  if (typeof env.GITHUB_SHA === 'string' && env.GITHUB_SHA.length > 0) return { sha: env.GITHUB_SHA, source: 'GITHUB_SHA' }
  const head = gitHead()
  return head ? { sha: head, source: 'git HEAD' } : { sha: null, source: 'no GITHUB_SHA and no git checkout' }
}

/*
 * READ BOTH `state` AND `readyState`, and be LOUD when neither is present.
 *
 * The v7 reference lists `readyState` among a deployment's required fields and
 * `state` beside it with the same enum. A deployment carrying NEITHER is
 * reported as a shape mismatch rather than as a build in progress, because "I
 * could not tell" must never render as "it is fine".
 */
export const stateOf = (d) => d?.state ?? d?.readyState ?? null

const PASSING = new Set(['READY'])
const FAILING = new Set(['ERROR', 'BLOCKED'])
const VOID = new Set(['CANCELED', 'DELETED'])

const newestFirst = (a, b) => (Number(b?.createdAt ?? b?.created ?? 0) || 0) - (Number(a?.createdAt ?? a?.created ?? 0) || 0)

/**
 * Judge the deployments Vercel lists for ONE commit. The newest is the one
 * that counts (a redeploy of the same commit is a newer deployment of it).
 * Pure, so every verdict is tested without the network.
 * @returns {{ verdict: 'none' | 'shape' | 'pass' | 'fail' | 'void' | 'unsettled', deployment?: any, state?: string | null }}
 */
export function judgeCommitDeployments(mine) {
  if (!Array.isArray(mine) || mine.length === 0) return { verdict: 'none' }
  if (mine.every((d) => stateOf(d) === null)) return { verdict: 'shape', deployment: mine[0], state: null }
  const newest = [...mine].sort(newestFirst)[0]
  const state = stateOf(newest)
  if (PASSING.has(state)) return { verdict: 'pass', deployment: newest, state }
  if (FAILING.has(state)) return { verdict: 'fail', deployment: newest, state }
  if (VOID.has(state)) return { verdict: 'void', deployment: newest, state }
  return { verdict: 'unsettled', deployment: newest, state }
}

/**
 * v7, NOT v6 (Law 9: never call a superseded version), filtered by the commit
 * itself so the branch's other deployments never enter the judgement.
 * `teamId` is sent because this may be a full-account token, which requires it.
 */
export function deploymentsUrl({ projectId, teamId, sha, limit = 10 }) {
  return `https://api.vercel.com/v7/deployments?projectId=${encodeURIComponent(projectId)}&teamId=${encodeURIComponent(teamId)}&sha=${encodeURIComponent(sha)}&limit=${limit}`
}

/**
 * The wait, as a pure loop. `list(sha)` lists the commit's deployments (or
 * throws); `now()` and `sleep(ms)` are injected so the loop is proven with a
 * fake clock. In CI it polls until the commit's deployment settles, giving
 * Vercel `graceMs` to create it and `waitMs` in all to settle it. Outside CI
 * it asks once: an absent deployment is `none` and a running one is
 * `building`, both skips, because the commit is normally not pushed yet and a
 * gate must never wait for a build that cannot exist.
 * @returns {Promise<{ verdict: 'none' | 'shape' | 'pass' | 'fail' | 'void' | 'building' | 'timeout', polls: number, waitedMs: number, deployment?: any, state?: string | null }>}
 */
export async function settleVerdict({
  list,
  sha,
  inCi,
  waitMs = DEFAULT_WAIT_SECONDS * 1000,
  graceMs = DEFAULT_CREATE_GRACE_SECONDS * 1000,
  intervalMs = POLL_INTERVAL_MS,
  now = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  onPoll = () => {},
}) {
  const started = now()
  let polls = 0
  for (;;) {
    polls += 1
    const judged = judgeCommitDeployments(await list(sha))
    const waitedMs = now() - started
    onPoll(polls, judged, waitedMs)
    if (judged.verdict === 'none') {
      if (!inCi || waitedMs >= graceMs) return { ...judged, polls, waitedMs }
    } else if (judged.verdict !== 'unsettled') {
      return { ...judged, polls, waitedMs }
    } else if (!inCi) {
      return { ...judged, verdict: 'building', polls, waitedMs }
    } else if (waitedMs >= waitMs) {
      return { ...judged, verdict: 'timeout', polls, waitedMs }
    }
    await sleep(intervalMs)
  }
}

function vercelIds(env) {
  let projectId = env.VERCEL_PROJECT_ID
  let teamId = env.VERCEL_ORG_ID
  if ((!projectId || !teamId) && existsSync(PROJECT_JSON)) {
    try {
      const cfg = JSON.parse(readFileSync(PROJECT_JSON, 'utf8'))
      projectId = projectId || cfg.projectId
      teamId = teamId || cfg.orgId
    } catch (error) {
      console.warn(`${TAG} ${PROJECT_JSON} could not be read (${error.message}); only VERCEL_PROJECT_ID and VERCEL_ORG_ID remain`)
    }
  }
  return { projectId, teamId }
}

function seconds(raw, fallback) {
  const n = Number.parseInt(raw ?? '', 10)
  return Number.isInteger(n) && n >= 0 ? n : fallback
}

const whereToLook = (d) => d?.inspectorUrl || d?.url || '(no inspector url on the record)'

async function main() {
  const env = process.env
  const inCi = env.GITHUB_ACTIONS === 'true'
  const ref = branchUnderTest(env)
  const { sha, source } = commitUnderTest(env)
  if (!sha) {
    console.log(`${TAG} SKIP - no commit to judge: ${source}.`)
    return 0
  }

  const resolved = resolveVercelToken(env)
  if (!resolved.token) {
    console.warn(
      `${TAG} SKIP - ${resolved.reason}, so the state of ${short(sha)}'s deployment is UNKNOWN, not good.\n` +
        '                 Set VERCEL_TOKEN (CI) or `vercel login` once on this machine to make this guard real.\n' +
        '                 Until then, check the deployment state by hand before believing any preview-based claim.',
    )
    return 0
  }
  const { projectId, teamId } = vercelIds(env)
  if (!projectId || !teamId) {
    console.warn(`${TAG} SKIP - no project/team id available (VERCEL_PROJECT_ID, VERCEL_ORG_ID or ${PROJECT_JSON}).`)
    return 0
  }

  const waitMs = seconds(env.PREVIEW_STATE_WAIT_SECONDS, DEFAULT_WAIT_SECONDS) * 1000
  const graceMs = seconds(env.PREVIEW_STATE_CREATE_GRACE_SECONDS, DEFAULT_CREATE_GRACE_SECONDS) * 1000
  let inspected = 0
  const list = async (commit) => {
    const res = await fetch(deploymentsUrl({ projectId, teamId, sha: commit }), { headers: { Authorization: `Bearer ${resolved.token}` } })
    if (!res.ok) {
      // Print what Vercel actually said. The documented error body is
      // { error: { code, message } } (https://vercel.com/docs/rest-api/errors,
      // fetched 14 August 2026). A bare status code sent somebody hunting the
      // wrong thing once already.
      let detail = ''
      try {
        const body = await res.json()
        if (body?.error) detail = ` (${body.error.code}: ${body.error.message})`
      } catch (error) {
        detail = ` (non-JSON body: ${error.message})`
      }
      throw new Error(`Vercel API answered ${res.status}${detail}`)
    }
    const { deployments = [] } = await res.json()
    const mine = deployments.filter((d) => !d?.meta?.githubCommitSha || d.meta.githubCommitSha === commit)
    inspected = Math.max(inspected, mine.length)
    return mine
  }

  console.log(
    `${TAG} judging the deployment of ${short(sha)} (${source}) on ${ref ?? 'an unknown branch'} with ${resolved.source}` +
      (inCi ? `; waiting up to ${waitMs / 1000}s for it to settle (${graceMs / 1000}s for Vercel to create it)` : '; not waiting, this is not CI'),
  )
  let result
  try {
    result = await settleVerdict({
      list,
      sha,
      inCi,
      waitMs,
      graceMs,
      onPoll: (n, judged, waitedMs) => {
        if (judged.verdict === 'unsettled') console.log(`${TAG}   poll ${n} at ${Math.round(waitedMs / 1000)}s: ${judged.state} (${whereToLook(judged.deployment)})`)
        else if (judged.verdict === 'none') console.log(`${TAG}   poll ${n} at ${Math.round(waitedMs / 1000)}s: Vercel lists no deployment for ${short(sha)} yet`)
      },
    })
  } catch (error) {
    console.warn(`${TAG} SKIP - ${error.message}. The state of ${short(sha)}'s deployment is UNKNOWN, not good.`)
    return 0
  }

  const { verdict, deployment, state, polls, waitedMs } = result
  const declared = (notReady) =>
    declareWork('preview-state', {
      did: { 'deployment inspected for this commit': inspected, 'poll of the Vercel API': polls },
      found: { 'settled deployment that is not READY': notReady },
      exitOnZero: false,
    })

  switch (verdict) {
    case 'pass':
      declared(0)
      console.log(`${TAG} PASS - the deployment of ${short(sha)} on ${ref ?? '?'} is READY (${whereToLook(deployment)}), settled after ${Math.round(waitedMs / 1000)}s.`)
      return 0
    case 'fail':
      declared(1)
      console.error(
        `\n${TAG} FAILED: the deployment of ${short(sha)} on ${ref ?? '?'} is in ${state}.\n` +
          `  ${whereToLook(deployment)}\n\n` +
          '  The branch alias is serving an OLDER build, so anything "verified on the\n' +
          '  deployed preview" right now was verified against different code.\n' +
          '  Run `npm run build` locally to reproduce it.\n',
      )
      return 1
    case 'timeout':
      declared(1)
      console.error(
        `\n${TAG} FAILED: the deployment of ${short(sha)} on ${ref ?? '?'} has not settled after ${Math.round(waitedMs / 1000)}s (still ${state}).\n` +
          `  ${whereToLook(deployment)}\n\n` +
          '  A build nobody has seen finish is not a verified build. Re-run this job once\n' +
          '  it settles, or raise PREVIEW_STATE_WAIT_SECONDS if Vercel is genuinely slower now.\n',
      )
      return 1
    case 'building':
      console.log(`${TAG} SKIP - the deployment of ${short(sha)} is still ${state} (${whereToLook(deployment)}); not waiting outside CI.`)
      return 0
    case 'void':
      console.warn(`${TAG} SKIP - the deployment of ${short(sha)} was ${state} (${whereToLook(deployment)}). Nothing was built, so there is nothing to verify against.`)
      return 0
    case 'shape':
      console.warn(
        `${TAG} SKIP - the deployment(s) for ${short(sha)} carry neither a \`state\` nor a \`readyState\` field.\n` +
          '                 The API response shape has changed and this guard can no longer read it.\n' +
          '                 It is reporting that plainly rather than reading it as "still building".',
      )
      return 0
    case 'none':
    default:
      if (inCi) {
        console.warn(
          `${TAG} SKIP - Vercel lists no deployment for ${short(sha)} after ${Math.round(waitedMs / 1000)}s. It did not build this commit,\n` +
            '                 so the branch alias serves an OLDER build and nothing here is verified against this commit.',
        )
      } else {
        console.log(`${TAG} SKIP - Vercel lists no deployment for ${short(sha)} yet (not pushed, or not built); nothing to verify against.`)
      }
      return 0
  }
}

const invokedDirectly = process.argv[1] && /preview-deployment-state\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))
if (invokedDirectly) {
  // exitCode rather than process.exit: on Windows, exiting while a fetch
  // socket is still closing trips a libuv assertion and the code reads 127.
  process.exitCode = await main()
}
