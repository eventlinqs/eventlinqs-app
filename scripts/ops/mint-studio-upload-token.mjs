/**
 * MINT, STORE AND HAND OVER STUDIO_UPLOAD_TOKEN (car T, T4, the PM's 02:05 of 28 November 2026), THEN PROVE THE
 * ENDPOINT TAKES IT.
 *
 * The token proves the cloud studio sending a rendered slide to POST /api/studio/uploads
 * (src/app/api/studio/uploads/route.ts). Both sides hold the same value: EventLinqs in Vercel, the studio in its cloud
 * environment's secrets, where Lawal sets it (the PM's order: "the token is his to hold"). A rotation is this script run
 * again with --rotate.
 *
 * LAW 10. The founder's irreducible acts are being logged in to the Vercel CLI, typing APPLY for production, and pasting
 * the handed-over value into the studio's cloud environment beside the allowed domain www.eventlinqs.com.au. Everything
 * else is here: minting a value of the declared shape, storing it, writing the handover file, and observing the
 * endpoint take it.
 *
 * THE OPERATING RULES OF 25 SEPTEMBER 2026 (rule 4): DRY RUN BY DEFAULT. Nothing is stored without --apply, production
 * is never written without APPLY typed at the prompt, and every production write is logged in
 * C:\dev\PRODUCTION-WRITES.txt.
 *
 * THE REFUSALS, before it acts: not logged in to the Vercel CLI, or linked to a project other than eventlinqs-app;
 * --apply with no --handoff, or a --handoff inside a git working tree (a secret in a checkout is one `git add .` from
 * history); a minted value that does not satisfy SHAPES.strongSecret32, the shape the manifest declares.
 *
 * IDEMPOTENT. Run again with the same --handoff and no --rotate, it stores the value already handed over rather than
 * minting a new one, so the studio's copy and ours never part company by accident.
 *
 * THE TOKEN IS NEVER PRINTED, and never passed as a process argument: it goes to the CLI on stdin, per the documented
 * `vercel env add [name] [environment] < [file]` (https://vercel.com/docs/cli/env, fetched 2026-10-23 for
 * scripts/ops/mint-bookedproof-connector-secret.mjs, which documents --sensitive and --force). Only its length and an
 * eight character fingerprint are shown.
 *
 * Usage (PowerShell):
 *
 *   node scripts/ops/mint-studio-upload-token.mjs --scope production
 *       (dry run: says what it would do)
 *   node scripts/ops/mint-studio-upload-token.mjs --scope production --apply --handoff C:\dev\EVIDENCE\EL-27NOV\secrets\studio-upload-token.production
 *   node scripts/ops/mint-studio-upload-token.mjs --prove https://www.eventlinqs.com.au --handoff <same file>
 *       (after the next deploy: sends one request with the handed-over value and an empty form, and expects the
 *        endpoint to take the token and refuse the form with 400, which writes nothing)
 */
import { spawnSync } from 'node:child_process'
import { randomBytes, createHash } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, readSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SHAPES } from '../../src/lib/env/manifest.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..', '..')
const VAR = 'STUDIO_UPLOAD_TOKEN'
const EXPECTED_PROJECT = 'eventlinqs-app'
const WRITES_LOG = 'C:\\dev\\PRODUCTION-WRITES.txt'

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
  process.exitCode = 1
  throw new Error(msg)
}

/* The Vercel CLI's own JS entry, run under this Node with no shell (as the connector secret's script does). */
function vercelEntry() {
  const candidates = [
    process.env.APPDATA ? resolve(process.env.APPDATA, 'npm', 'node_modules', 'vercel', 'dist', 'vc.js') : null,
    '/usr/local/lib/node_modules/vercel/dist/vc.js',
    '/usr/lib/node_modules/vercel/dist/vc.js',
  ].filter(Boolean)
  return candidates.find((p) => existsSync(p)) ?? null
}
const VERCEL_JS = vercelEntry()

function run(cmd, cmdArgs, { input } = {}) {
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
  const r = spawnSync(file, argv, { cwd: REPO, input, encoding: 'utf8', shell, windowsHide: true, maxBuffer: 16 * 1024 * 1024 })
  return { status: r.status, stdout: r.stdout ?? '', text: `${r.stdout ?? ''}\n${r.stderr ?? ''}` }
}

/** One line from the terminal, read synchronously. */
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

/** The token taken, the empty form refused: 400 naming piece_key. Nothing is written. */
async function prove(origin, token) {
  const headers = { authorization: `Bearer ${token}` }
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) headers['x-vercel-protection-bypass'] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
  const res = await fetch(`${origin}/api/studio/uploads`, { method: 'POST', headers, body: new FormData(), redirect: 'manual' })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    /* reported below */
  }
  console.log(`  prove               ${origin} answered ${res.status}${json?.error ? ` ${json.error}` : ''}`)
  if (!(res.status === 400 && json?.error === 'bad-request' && /^piece_key/.test(json?.reason ?? ''))) {
    const why =
      res.status === 503 ? 'the deployment does not hold the token yet (redeploy after storing it)'
      : res.status === 401 ? 'the deployment holds a DIFFERENT value; the handoff file and Vercel have parted'
      : `an unexpected answer: ${text.slice(0, 200)}`
    fail(why)
  }
  console.log('  proved              the endpoint took the handed-over token and refused the empty form, writing nothing')
}

async function main() {
  if (PROVE) {
    const token = readHandoff()
    if (!token) fail('--prove needs --handoff <file> holding the value to send.')
    console.log(`mint-studio-upload-token: prove against ${PROVE} (fp ${fingerprint(token)})`)
    await prove(PROVE, token)
    return
  }
  if (!['preview', 'production'].includes(SCOPE)) fail(`--scope must be preview or production, not ${SCOPE}.`)
  console.log(`mint-studio-upload-token: ${VAR} on ${SCOPE}${APPLY ? '' : ' (dry run)'}`)

  const who = run('vercel', ['whoami'])
  if (who.status !== 0) fail('the Vercel CLI is not logged in. Run `vercel login` (this one is yours) and rerun.')
  console.log(`  vercel account      ${who.stdout.trim().split(/\r?\n/).filter(Boolean).pop()}`)
  const linkPath = resolve(REPO, '.vercel', 'project.json')
  if (!existsSync(linkPath)) fail('.vercel/project.json is missing; run `vercel link` first.')
  const link = JSON.parse(readFileSync(linkPath, 'utf8'))
  if (link.projectName !== EXPECTED_PROJECT) fail(`linked project is ${link.projectName}, expected ${EXPECTED_PROJECT}.`)
  console.log(`  linked project      ${link.projectName}`)

  if (APPLY && !HANDOFF) fail('--apply needs --handoff <file>: the studio must receive the same value, and it is never printed.')
  if (HANDOFF && insideGitTree(HANDOFF)) fail(`${HANDOFF} is inside a git working tree; choose a folder outside any checkout.`)

  const existing = ROTATE ? null : readHandoff()
  const value = existing ?? randomBytes(32).toString('hex')
  const shape = SHAPES.strongSecret32
  if (!new RegExp(shape.pattern).test(value) || value.length < (shape.minLength ?? 32) || /\s/.test(value)) {
    fail('the value does not satisfy SHAPES.strongSecret32; refusing to store it.')
  }
  console.log(`  token               ${existing ? 'the one already handed over' : 'newly minted'}, length ${value.length}, fp ${fingerprint(value)}`)

  if (!APPLY) {
    console.log('dry run: nothing stored, nothing written. Add --apply --handoff <file> to store it.')
    return
  }
  if (SCOPE === 'production') {
    console.log('')
    console.log('  PRODUCTION. This switches on the cloud studio\'s direct upload on the live site.')
    const typed = askLine('  Type APPLY to store it on production: ')
    if (typed.trim() !== 'APPLY') fail('not applied: APPLY was not typed.')
  }

  const add = run('vercel', ['env', 'add', VAR, SCOPE, '--sensitive', '--force', '--yes'], { input: value })
  if (add.status !== 0) {
    console.error(add.text.replace(value, '<value>'))
    fail(`vercel env add exited ${add.status}.`)
  }
  console.log('  stored              vercel env add succeeded')

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
    appendFileSync(WRITES_LOG, `${stamp}  founder typed APPLY: APPLIED: ${VAR} stored on production, fp ${fingerprint(value)} (car T, T4, the studio upload; scripts/ops/mint-studio-upload-token.mjs)\r\n`)
    console.log(`  logged              ${WRITES_LOG}`)
  }
  console.log('')
  console.log('It takes effect on the next deployment of that environment. Then prove it with:')
  console.log(`  node scripts/ops/mint-studio-upload-token.mjs --prove <deployment origin> --handoff ${HANDOFF}`)
}

// No process.exit() after a fetch: on Node 24 for Windows it trips libuv's UV_HANDLE_CLOSING assertion while the socket
// closes (scripts/guards/no-exit-after-network.mjs); the exit code rides process.exitCode.
main().catch((e) => {
  if (process.exitCode !== 1) console.error(`FAIL: ${e instanceof Error ? e.message : String(e)}`)
  process.exitCode = 1
})
