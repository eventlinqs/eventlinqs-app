/**
 * reach-check.mjs - can this machine reach what the gate is about to judge?
 *
 * WHY (release checklist J3, 28 October 2026). At 01:52 that morning a full
 * gate stopped at guards, 12 minutes in, with "16 of 222 guard(s) FAILED", every
 * one "fetch failed (3 attempt(s) over 5.6s). This is a transport failure and
 * says NOTHING about what the database contains". The internet was down for
 * nine hours. The disk floor was already the gate's first step; reach was no
 * step at all, so an outage read as twelve minutes of work and sixteen reds.
 *
 * WHAT IT ASKS. One request to each thing the gate goes on to read: the TEST
 * project (NEXT_PUBLIC_SUPABASE_URL from .env.local, which guards and the suite
 * read), the Supabase Management API (types-drift and production parity), and
 * GitHub (the push itself). ANY HTTP answer is reach: a 401 is a server talking.
 * Only a fetch that throws, three times over about six seconds (the same count
 * scripts/guards/lib/db-read.mjs uses), is a transport failure.
 *
 * WHAT IT CANNOT SEE, said plainly: whether a credential is accepted, whether a
 * table holds what a guard expects, or whether the network holds for the next
 * forty minutes. It answers one question, before anything else is paid for.
 *
 * Local only: skipped on Vercel, which has its own network and never pushes.
 * Run: node --env-file=.env.local scripts/ops/reach-check.mjs
 */
import { pathToFileURL } from 'node:url'

const TAG = '[reach]'
const ATTEMPTS = 3
const TIMEOUT_MS = 10_000

/** The things the gate reads after this step, from the env it runs with. */
export function reachTargets(env) {
  const targets = []
  const testUrl = env.NEXT_PUBLIC_SUPABASE_URL
  if (testUrl) targets.push({ name: 'TEST', url: `${testUrl.replace(/\/+$/, '')}/rest/v1/` })
  targets.push({ name: 'Supabase Management API', url: 'https://api.supabase.com/v1/projects' })
  targets.push({ name: 'GitHub', url: 'https://github.com/' })
  return targets
}

/** One target, up to three tries. Any HTTP status is reach; only a throw is not. */
export async function probe(target, { fetchImpl = fetch, pauseMs = 2_000 } = {}) {
  let error = ''
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const res = await fetchImpl(target.url, { method: 'GET', signal: AbortSignal.timeout(TIMEOUT_MS) })
      await res.body?.cancel()
      return { ...target, ok: true, status: res.status, attempts: attempt }
    } catch (e) {
      const cause = e && typeof e === 'object' && 'cause' in e && e.cause ? `: ${e.cause.code ?? e.cause.message ?? e.cause}` : ''
      error = `${e instanceof Error ? e.message : String(e)}${cause}`
      if (attempt < ATTEMPTS && pauseMs > 0) await new Promise((r) => setTimeout(r, pauseMs))
    }
  }
  return { ...target, ok: false, attempts: ATTEMPTS, error }
}

/** The verdict. Nothing probed is not a pass. */
export function judgeReach(results) {
  if (results.length === 0) return { pass: false, lines: [`${TAG} FAIL: nothing was probed, so reach was not shown.`] }
  const lines = results.map((r) =>
    r.ok
      ? `${TAG}   reached  ${r.name}  (HTTP ${r.status}, attempt ${r.attempts})  ${r.url}`
      : `${TAG}   NOT REACHED  ${r.name}  (${r.attempts} attempts: ${r.error})  ${r.url}`,
  )
  const missed = results.filter((r) => !r.ok).map((r) => r.name)
  if (missed.length === 0) {
    lines.push(`${TAG} PASS - ${results.length} of ${results.length} reached; the steps that read them may run.`)
    return { pass: true, lines }
  }
  lines.push(
    `${TAG} FAIL - not reached: ${missed.join(', ')}. This is the network, not the code: nothing in the tree was judged.`,
    `${TAG} Wait for the connection, then run the gate again; a guard run now would only report transport failures.`,
  )
  return { pass: false, lines }
}

async function main() {
  if (process.env.VERCEL || process.env.VERCEL_ENV) return
  const targets = reachTargets(process.env)
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) console.log(`${TAG} NOT JUDGED: TEST, no NEXT_PUBLIC_SUPABASE_URL in this env.`)
  const results = await Promise.all(targets.map((t) => probe(t)))
  const verdict = judgeReach(results)
  for (const line of verdict.lines) (verdict.pass ? console.log : console.error)(line)
  process.exitCode = verdict.pass ? 0 : 1
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main()
