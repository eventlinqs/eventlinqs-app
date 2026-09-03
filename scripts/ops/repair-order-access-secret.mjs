/**
 * REPLACE A MALFORMED ORDER_ACCESS_SECRET ON VERCEL PRODUCTION, THEN PROVE THE
 * DEPLOY THAT IT BLOCKED GOES GREEN.
 *
 * WHAT WENT WRONG, 3 September 2026. Production deployment
 * dpl_8S9zb5QpAZJZyZEXTJSBJBKHrrpb (commit 48fe08f7 from main) failed in
 * prebuild:
 *
 *   ENV_MANIFEST_CONFORMANCE: ORDER_ACCESS_SECRET [production] fails its
 *   declared shape: does not match a single-token secret of at least 32
 *   characters. (length 92, fp bf11e100)
 *
 * The shape is ^\S{32,}$ (src/lib/env/manifest.mjs, SHAPES.strongSecret32), so a
 * 92 character value that fails it contains whitespace: a pasted trailing
 * newline is the usual cause. The variable is optional on preview, which is why
 * the identical commit built READY as a preview and the failure only showed on
 * the production target. Production kept serving the previous release (9cf7d365)
 * and nothing paged anyone, because a build that never starts cannot fail a
 * runtime check.
 *
 * LAW 10. The founder's irreducible act here is being logged in to the Vercel
 * CLI, which mints a session against his account. Everything after that is
 * scripted: minting a value of the right shape, storing it, redeploying the
 * blocked build, and observing the served release marker change.
 *
 * THE REFUSALS, before it acts.
 *   1. Not logged in to the Vercel CLI: refuse.
 *   2. The linked project is not eventlinqs-app: refuse.
 *   3. THE BLAST RADIUS CHECK. The secret signs guest order links
 *      (src/lib/orders/order-access.ts). Rotating it invalidates every link
 *      minted with the old value. So the script reads the release marker the
 *      live site is serving and asks git whether that release contains
 *      order-access.ts. If it does, links may exist and the script refuses
 *      unless --accept-link-invalidation is passed. On 3 September 2026 the
 *      served release was 9cf7d365, which predates the file, so the blast
 *      radius was provably zero.
 *
 * THE SECRET IS NEVER PRINTED. Only its length and a short fingerprint, the
 * same two facts the guard prints when it rejects one.
 *
 * Usage (PowerShell):
 *
 *   $env:Path = "$env:APPDATA\npm;" + $env:Path
 *   node scripts/ops/repair-order-access-secret.mjs --dry-run
 *   node scripts/ops/repair-order-access-secret.mjs --redeploy dpl_8S9zb5QpAZJZyZEXTJSBJBKHrrpb --expect-sha 48fe08f7
 *
 * --redeploy <id|url>   after storing the value, rebuild that deployment for
 *                       the production target and wait for it.
 * --expect-sha <sha>    the commit the live site must serve when done; the
 *                       script polls the sentry-release marker for it.
 * --site <url>          the live origin (default https://www.eventlinqs.com.au).
 */
import { spawnSync } from 'node:child_process'
import { randomBytes, createHash } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SHAPES } from '../../src/lib/env/manifest.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..', '..')
const VAR = 'ORDER_ACCESS_SECRET'
const SCOPE = 'production'
const EXPECTED_PROJECT = 'eventlinqs-app'
const CONSUMER = 'src/lib/orders/order-access.ts'

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const opt = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const DRY_RUN = flag('--dry-run')
const ACCEPT_INVALIDATION = flag('--accept-link-invalidation')
const REDEPLOY = opt('--redeploy')
const EXPECT_SHA = (opt('--expect-sha') ?? '').toLowerCase()
const SITE = (opt('--site') ?? 'https://www.eventlinqs.com.au').replace(/\/$/, '')

const fingerprint = (v) => createHash('sha256').update(v).digest('hex').slice(0, 8)

/* The Vercel CLI is a Node program. On Windows the global install exposes a
 * .cmd shim that Node refuses to spawn without a shell, and a shell concatenates
 * arguments unescaped (DEP0190). So the CLI's own JS entry is run under this
 * Node directly, with no shell anywhere, and the .cmd is only a fallback. */
function vercelEntry() {
  const candidates = [
    process.env.APPDATA ? resolve(process.env.APPDATA, 'npm', 'node_modules', 'vercel', 'dist', 'vc.js') : null,
    '/usr/local/lib/node_modules/vercel/dist/vc.js',
    '/usr/lib/node_modules/vercel/dist/vc.js',
  ].filter(Boolean)
  return candidates.find((p) => existsSync(p)) ?? null
}
const VERCEL_JS = vercelEntry()

function run(cmd, cmdArgs, { input, cwd } = {}) {
  let file = cmd
  let argv = cmdArgs
  let shell = false
  if (cmd === 'vercel') {
    if (VERCEL_JS) {
      file = process.execPath
      argv = [VERCEL_JS, ...cmdArgs]
    } else {
      shell = process.platform === 'win32'
    }
  }
  const r = spawnSync(file, argv, {
    cwd: cwd ?? REPO,
    input,
    encoding: 'utf8',
    shell,
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  })
  const stdout = (r.stdout ?? '').replace(/<claude-code-hint[^>]*>/g, '')
  const stderr = (r.stderr ?? '').replace(/<claude-code-hint[^>]*>/g, '')
  return { status: r.status, stdout, stderr, text: `${stdout}\n${stderr}` }
}

function fail(msg) {
  console.error(`FAIL: ${msg}`)
  process.exit(1)
}

console.log(`repair-order-access-secret: ${VAR} on ${SCOPE}${DRY_RUN ? ' (dry run)' : ''}`)

/* 1. Logged in. */
const who = run('vercel', ['whoami'])
if (who.status !== 0) fail('the Vercel CLI is not logged in. Run `vercel login` (this one is yours) and rerun.')
const username = who.stdout.trim().split(/\r?\n/).filter(Boolean).pop()
console.log(`  vercel account      ${username}`)

/* 2. Linked project. */
const linkPath = resolve(REPO, '.vercel', 'project.json')
if (!existsSync(linkPath)) fail('.vercel/project.json is missing; run `vercel link` first.')
const link = JSON.parse(readFileSync(linkPath, 'utf8'))
if (link.projectName !== EXPECTED_PROJECT) fail(`linked project is ${link.projectName}, expected ${EXPECTED_PROJECT}.`)
console.log(`  linked project      ${link.projectName} (${link.projectId})`)

/* 3. Blast radius. */
let servedSha = null
try {
  const res = await fetch(`${SITE}/`, { headers: { 'user-agent': 'eventlinqs-ops repair-order-access-secret' } })
  const html = await res.text()
  const m = html.match(/sentry-release=([0-9a-f]{7,40})/)
  servedSha = m ? m[1] : null
} catch (err) {
  fail(`could not fetch ${SITE}/ to read the served release: ${err instanceof Error ? err.message : String(err)}`)
}
if (!servedSha) fail(`no sentry-release marker found in ${SITE}/ HTML; cannot judge the blast radius.`)
const consumerPresent = run('git', ['cat-file', '-e', `${servedSha}:${CONSUMER}`]).status === 0
console.log(`  served release      ${servedSha}`)
console.log(`  ${CONSUMER} in it: ${consumerPresent ? 'YES, guest links may exist' : 'NO, no guest link has ever been minted'}`)
if (consumerPresent && !ACCEPT_INVALIDATION) {
  fail('the live release can mint guest order links, so replacing the secret invalidates every outstanding one. Rerun with --accept-link-invalidation if that is the decision.')
}

/* 4. Mint a value of the declared shape and prove it against the manifest. */
const next = randomBytes(48).toString('base64url')
const shape = SHAPES.strongSecret32
if (!new RegExp(shape.pattern).test(next) || next.length < shape.minLength) {
  fail('the minted value does not satisfy SHAPES.strongSecret32; refusing to store it.')
}
if (/\s/.test(next)) fail('the minted value contains whitespace; refusing to store it.')
console.log(`  new value           length ${next.length}, fp ${fingerprint(next)}, matches ${shape.describe}`)

if (DRY_RUN) {
  console.log('dry run: nothing stored, nothing deployed.')
  process.exit(0)
}

/* 5. Store it. The value goes in on stdin with NO trailing newline, which is the
 * exact mistake being repaired. `vercel env update` is the documented path for
 * an existing variable (https://vercel.com/docs/cli/env, and `vercel env update
 * --help` on CLI 55.0.0 lists --sensitive and --yes). */
const upd = run('vercel', ['env', 'update', VAR, SCOPE, '--sensitive', '--yes'], { input: next })
if (upd.status !== 0) {
  console.error(upd.text)
  fail(`vercel env update exited ${upd.status}.`)
}
console.log('  stored              vercel env update succeeded')

/* 6. Observe that the variable row exists on the scope (values are write-only). */
const ls = run('vercel', ['env', 'ls', SCOPE])
if (!new RegExp(`^\\s*${VAR}\\s`, 'm').test(ls.stdout)) {
  console.error(ls.text)
  fail(`${VAR} is not listed on ${SCOPE} after the update.`)
}
console.log(`  listed on ${SCOPE}  yes`)

if (!REDEPLOY) {
  console.log('no --redeploy given. Redeploy the blocked production build with:')
  console.log('  vercel redeploy <deployment-id-or-url> --target production')
  process.exit(0)
}

/* 7. Rebuild the blocked deployment for production and wait for a verdict. */
console.log(`  redeploying         ${REDEPLOY} (target ${SCOPE})`)
const rd = run('vercel', ['redeploy', REDEPLOY, '--target', SCOPE, '--no-wait'])
if (rd.status !== 0) {
  console.error(rd.text)
  fail(`vercel redeploy exited ${rd.status}.`)
}
const urlMatch = rd.text.match(/https:\/\/[a-z0-9-]+\.vercel\.app/)
if (!urlMatch) {
  console.error(rd.text)
  fail('could not read the new deployment URL from vercel redeploy output.')
}
const newUrl = urlMatch[0]
console.log(`  new deployment      ${newUrl}`)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const deadline = Date.now() + 20 * 60 * 1000
let state = 'UNKNOWN'
while (Date.now() < deadline) {
  const insp = run('vercel', ['inspect', newUrl])
  const sm = insp.text.match(/status\s+\S*\s*([A-Za-z]+)/i)
  state = sm ? sm[1].toUpperCase() : 'UNKNOWN'
  if (state === 'READY' || state === 'ERROR' || state === 'CANCELED') break
  process.stdout.write(`  building            ${state.toLowerCase()}\r`)
  await sleep(20000)
}
console.log(`  deployment state    ${state}`)
if (state !== 'READY') {
  console.error('The redeploy did not reach READY. Read its build log:')
  console.error(`  vercel inspect ${newUrl} --logs`)
  process.exit(1)
}

/* 8. The only proof that matters: the live site serves the expected commit. */
if (!EXPECT_SHA) {
  console.log('READY. No --expect-sha given, so the served release was not checked.')
  process.exit(0)
}
const aliasDeadline = Date.now() + 5 * 60 * 1000
let served = null
let lastFetchError = null
while (Date.now() < aliasDeadline) {
  try {
    const res = await fetch(`${SITE}/?repair=${Date.now()}`, {
      headers: { 'user-agent': 'eventlinqs-ops repair-order-access-secret', 'cache-control': 'no-cache' },
    })
    const html = await res.text()
    const m = html.match(/sentry-release=([0-9a-f]{7,40})/)
    served = m ? m[1] : null
    lastFetchError = null
  } catch (err) {
    // A transient fetch failure while the alias moves is expected; it is kept
    // and printed if the poll ends without the release rather than swallowed.
    served = null
    lastFetchError = err instanceof Error ? err.message : String(err)
  }
  if (served && served.startsWith(EXPECT_SHA)) break
  await sleep(15000)
}
console.log(`  served release now  ${served ?? 'unreadable'}`)
if (!served || !served.startsWith(EXPECT_SHA)) {
  if (lastFetchError) console.error(`  last fetch error    ${lastFetchError}`)
  fail(`the live site is not serving ${EXPECT_SHA} yet. The deployment is READY; check the production alias in the Vercel dashboard.`)
}
console.log(`PASS: ${SITE} serves ${served}, ${VAR} on ${SCOPE} is a single-token secret, and the blocked build is green.`)
