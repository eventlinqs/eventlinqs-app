/**
 * MINT, STORE AND HAND OVER BOOKEDPROOF_CONNECTOR_SECRET (E51, "the won
 * organiser"), THEN PROVE THE ENDPOINT ANSWERS UNDER IT.
 *
 * The secret signs Bookedproof's read of the organisers it found
 * (POST /api/connect/bookedproof/organisers, the contract at
 * C:\dev\EVIDENCE\WI1\EL-BOOKEDPROOF-ORGANISER-READ-CONTRACT.md). Both sides
 * hold the same value: EventLinqs in Vercel, Bookedproof in its own store. A
 * rotation is this script run again with --rotate.
 *
 * LAW 10. The founder's irreducible acts are being logged in to the Vercel CLI
 * and, for production, typing APPLY after Lawal has ruled on the privacy
 * disclosure (the contract's section 7). Everything else is here: minting a
 * value of the declared shape, storing it, writing the handover file Bookedproof
 * reads, and observing the endpoint answer a signed request.
 *
 * THE OPERATING RULES OF 25 SEPTEMBER 2026 (rule 4): DRY RUN BY DEFAULT. Nothing
 * is stored without --apply, production is never written without the founder
 * typing APPLY at the prompt, and every production write is logged in
 * C:\dev\PRODUCTION-WRITES.txt.
 *
 * THE REFUSALS, before it acts.
 *   1. Not logged in to the Vercel CLI, or linked to a project other than
 *      eventlinqs-app.
 *   2. --apply with no --handoff, or a --handoff inside a git working tree
 *      (a secret written into a checkout is one `git add .` from history).
 *   3. A minted value that does not satisfy SHAPES.strongSecret32, the shape
 *      the manifest declares and the environment guards enforce.
 *
 * IDEMPOTENT. Run again with the same --handoff and no --rotate, it stores the
 * value already handed over rather than minting a new one, so Bookedproof's
 * copy and ours never part company by accident.
 *
 * THE SECRET IS NEVER PRINTED, and never passed as a process argument (where
 * any process listing would show it): it goes to the CLI on stdin, per the
 * documented `vercel env add [name] [environment] < [file]`
 * (https://vercel.com/docs/cli/env, fetched 2026-10-23, which also documents
 * --sensitive and --force on `vercel env add`). Only its length and an
 * eight-character fingerprint are shown, the two facts the guards print.
 *
 * Usage (PowerShell):
 *
 *   node scripts/ops/mint-bookedproof-connector-secret.mjs --scope preview
 *       (dry run: says what it would do)
 *   node scripts/ops/mint-bookedproof-connector-secret.mjs --scope preview --apply --handoff C:\dev\EVIDENCE\WI1\secrets\bookedproof-connector-secret.preview
 *   node scripts/ops/mint-bookedproof-connector-secret.mjs --prove https://<deployment> --handoff <same file>
 *       (after the next deploy: signs a request with the handed-over value and
 *        expects 200, which is the only proof the deployment holds it)
 *
 * --scope preview|production   which Vercel environment (default preview)
 * --apply                      store it; without this nothing is written
 * --handoff <file>             where Bookedproof's copy is written (and read back)
 * --rotate                     mint a new value even when the handoff file exists
 * --prove <origin>             only prove: sign and send one request, expect 200
 */
import { spawnSync } from 'node:child_process'
import { randomBytes, createHash, createHmac } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, readSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SHAPES } from '../../src/lib/env/manifest.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..', '..')
const VAR = 'BOOKEDPROOF_CONNECTOR_SECRET'
const EXPECTED_PROJECT = 'eventlinqs-app'
const WRITES_LOG = 'C:\\dev\\PRODUCTION-WRITES.txt'
const PROOF_ADDRESS = 'bp-connector-proof@bookedproof.test'

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const opt = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const SCOPE = opt('--scope') ?? 'preview'
const APPLY = flag('--apply')
const ROTATE = flag('--rotate')
const HANDOFF = opt('--handoff') ? resolve(opt('--handoff')) : null
const PROVE = opt('--prove')?.replace(/\/$/, '')

const fingerprint = (v) => createHash('sha256').update(v).digest('hex').slice(0, 8)

function fail(msg) {
  console.error(`FAIL: ${msg}`)
  process.exit(1)
}

/* The Vercel CLI's own JS entry, run under this Node with no shell (see
 * repair-order-access-secret.mjs for why the .cmd shim is only a fallback). */
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
  const r = spawnSync(file, argv, { cwd: cwd ?? REPO, input, encoding: 'utf8', shell, windowsHide: true, maxBuffer: 16 * 1024 * 1024 })
  const stdout = r.stdout ?? ''
  const stderr = r.stderr ?? ''
  return { status: r.status, stdout, stderr, text: `${stdout}\n${stderr}` }
}

/** One line from the terminal, read synchronously (a readline left open hangs the child process that follows). */
function askLine(question) {
  process.stdout.write(question)
  const buf = Buffer.alloc(256)
  let line = ''
  for (;;) {
    let n = 0
    try {
      n = readSync(0, buf, 0, buf.length, null)
    } catch {
      return line
    }
    if (n <= 0) return line
    line += buf.subarray(0, n).toString('utf8')
    if (line.includes('\n')) return line.split(/\r?\n/)[0]
  }
}

function insideGitTree(file) {
  const dir = dirname(file)
  mkdirSync(dir, { recursive: true })
  return run('git', ['-C', dir, 'rev-parse', '--is-inside-work-tree']).stdout.trim() === 'true'
}

function readHandoff() {
  if (!HANDOFF || !existsSync(HANDOFF)) return null
  const value = readFileSync(HANDOFF, 'utf8').trim()
  return value.length > 0 ? value : null
}

async function prove(origin, secret) {
  const body = JSON.stringify({ emails: [PROOF_ADDRESS], pages: [], since: null })
  const timestamp = String(Math.floor(Date.now() / 1000))
  const signature = `v1=${createHmac('sha256', secret).update(`${timestamp}.${body}`, 'utf8').digest('hex')}`
  const headers = { 'content-type': 'application/json', 'x-eventlinqs-timestamp': timestamp, 'x-eventlinqs-signature': signature }
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) headers['x-vercel-protection-bypass'] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
  const res = await fetch(`${origin}/api/connect/bookedproof/organisers`, { method: 'POST', headers, body, redirect: 'manual' })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    /* reported below */
  }
  const entry = json?.organisers?.[0]
  const ok = res.status === 200 && json?.version === 1 && entry?.email === PROOF_ADDRESS && entry?.found === false
  console.log(`  prove               ${origin} answered ${res.status}${json?.error ? ` ${json.error}` : ''}`)
  if (!ok) {
    const why =
      res.status === 503 ? 'the deployment does not hold the secret yet (redeploy after storing it)'
      : res.status === 401 ? `the deployment holds a DIFFERENT value (${json?.error ?? 'refused'}); the handoff file and Vercel have parted`
      : `an unexpected answer: ${text.slice(0, 200)}`
    fail(why)
  }
  console.log('  proved              the endpoint verified a request signed with the handed-over value')
}

if (PROVE) {
  const secret = readHandoff()
  if (!secret) fail('--prove needs --handoff <file> holding the value to sign with.')
  console.log(`mint-bookedproof-connector-secret: prove against ${PROVE} (fp ${fingerprint(secret)})`)
  await prove(PROVE, secret)
  process.exit(0)
}

if (!['preview', 'production'].includes(SCOPE)) fail(`--scope must be preview or production, not ${SCOPE}.`)
console.log(`mint-bookedproof-connector-secret: ${VAR} on ${SCOPE}${APPLY ? '' : ' (dry run)'}`)

/* 1. Logged in, and linked to this project. */
const who = run('vercel', ['whoami'])
if (who.status !== 0) fail('the Vercel CLI is not logged in. Run `vercel login` (this one is yours) and rerun.')
console.log(`  vercel account      ${who.stdout.trim().split(/\r?\n/).filter(Boolean).pop()}`)
const linkPath = resolve(REPO, '.vercel', 'project.json')
if (!existsSync(linkPath)) fail('.vercel/project.json is missing; run `vercel link` first.')
const link = JSON.parse(readFileSync(linkPath, 'utf8'))
if (link.projectName !== EXPECTED_PROJECT) fail(`linked project is ${link.projectName}, expected ${EXPECTED_PROJECT}.`)
console.log(`  linked project      ${link.projectName}`)

/* 2. Where Bookedproof's copy goes. */
if (APPLY && !HANDOFF) fail('--apply needs --handoff <file>: Bookedproof must receive the same value, and it is never printed.')
if (HANDOFF && insideGitTree(HANDOFF)) fail(`${HANDOFF} is inside a git working tree; choose a folder outside any checkout.`)

/* 3. The value: the one already handed over, or a new one. */
const existing = ROTATE ? null : readHandoff()
const value = existing ?? randomBytes(32).toString('hex')
const shape = SHAPES.strongSecret32
if (!new RegExp(shape.pattern).test(value) || value.length < (shape.minLength ?? 32) || /\s/.test(value)) {
  fail('the value does not satisfy SHAPES.strongSecret32; refusing to store it.')
}
console.log(`  value               ${existing ? 'the one already handed over' : 'newly minted'}, length ${value.length}, fp ${fingerprint(value)}`)

if (!APPLY) {
  console.log('dry run: nothing stored, nothing written. Add --apply --handoff <file> to store it.')
  process.exit(0)
}

/* 4. Production waits for the founder's typed APPLY, after the privacy ruling. */
if (SCOPE === 'production') {
  console.log('')
  console.log('  PRODUCTION. This switches on the organiser read for Bookedproof on the live site.')
  console.log('  Only after Lawal has ruled on the privacy disclosure (the contract, section 7).')
  const typed = askLine('  Type APPLY to store it on production: ')
  if (typed.trim() !== 'APPLY') fail('not applied: APPLY was not typed.')
}

/* 5. Store it on stdin, overwriting a previous value (a rotation). */
const add = run('vercel', ['env', 'add', VAR, SCOPE, '--sensitive', '--force', '--yes'], { input: value })
if (add.status !== 0) {
  console.error(add.text.replace(value, '<value>'))
  fail(`vercel env add exited ${add.status}.`)
}
console.log('  stored              vercel env add succeeded')

/* 6. Hand Bookedproof its copy, then observe both facts rather than trusting the calls. */
writeFileSync(HANDOFF, `${value}\n`, { encoding: 'utf8', mode: 0o600 })
if (readHandoff() !== value) fail(`the handoff file ${HANDOFF} does not read back the stored value.`)
console.log(`  handed over         ${HANDOFF} (fp ${fingerprint(value)})`)
const ls = run('vercel', ['env', 'ls', SCOPE])
if (!new RegExp(`^\\s*${VAR}\\s`, 'm').test(ls.stdout)) {
  console.error(ls.text)
  fail(`${VAR} is not listed on ${SCOPE} after storing it.`)
}
console.log(`  listed on ${SCOPE.padEnd(10)} yes`)

if (SCOPE === 'production') {
  const stamp = new Date().toLocaleString('sv-SE', { timeZone: 'Australia/Melbourne' }).slice(0, 16)
  appendFileSync(WRITES_LOG, `${stamp}  founder typed APPLY: APPLIED: ${VAR} stored on production, fp ${fingerprint(value)} (E51 the won organiser; scripts/ops/mint-bookedproof-connector-secret.mjs)\n`)
  console.log(`  logged              ${WRITES_LOG}`)
}

console.log('')
console.log('The value takes effect on the next deployment of that environment. Then prove it with:')
console.log(`  node scripts/ops/mint-bookedproof-connector-secret.mjs --prove <deployment origin> --handoff ${HANDOFF}`)
