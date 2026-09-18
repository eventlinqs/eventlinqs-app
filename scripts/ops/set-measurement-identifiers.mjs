/**
 * PUT THE FIVE MEASUREMENT IDENTIFIERS WHERE THE PLATFORM READS THEM, IN ONE
 * COMMAND, AND PROVE THEY ARRIVED.
 *
 * Close-out AN1, and Law 10. AN1 ends with a FOUNDER STEPS line: create the GA4
 * property, the Google Ads account, the Meta pixel and the Search Console
 * property in the owner's own accounts, and paste the identifiers into the
 * environment as the build names them. The first half is genuinely his: those
 * values do not exist until a dashboard in his account mints them, and no
 * credential on this machine can make one. The second half is not his at all.
 *
 * Pasting five values into three Vercel scopes and one local file is fifteen
 * dashboard interactions, and the failure it invites is the quiet one: a value
 * that lands on preview and not production, or lands with a trailing newline
 * that the shape guard then refuses at build time. That is exactly the shape
 * Law 10 exists for, so it is scripted.
 *
 *   THE FOUNDER'S PART   create four properties, copy five strings into a file.
 *   THIS SCRIPT'S PART   validate every one against the manifest's declared
 *                        shape, write them to Vercel production, preview and
 *                        development and to .env.local, skip the ones already
 *                        correct, and read every one back to prove it.
 *
 * THE VALUES ARE NEVER PRINTED AND NEVER PASSED AS ARGUMENTS. They are read
 * from a file, so nothing lands in shell history, and the script prints only a
 * name, a length and a short fingerprint, which is what the env guards print.
 * None of the five is secret (four are published in the page that loads them)
 * but a habit that depends on which value it is holding is a habit that will
 * one day be holding the other kind.
 *
 * THE REFUSALS, before it acts:
 *   1. No input file, or a file naming nothing this script knows: refuse.
 *   2. A value that fails its manifest shape: refuse THAT value by name, with
 *      the shape it failed, and keep going with the others. A malformed id is
 *      the failure this exists to prevent, so it must never be written.
 *   3. Not logged in to the Vercel CLI: refuse, and say which command fixes it.
 *   4. The linked project is not eventlinqs-app: refuse.
 *
 * IT IS IDEMPOTENT. A value already stored and already identical is reported as
 * unchanged and not rewritten, so running it twice costs nothing and proves the
 * state either way.
 *
 * THE INPUT FILE. One NAME=value per line, blank lines and # comments ignored.
 * Only the five names below are accepted; anything else is refused by name
 * rather than silently skipped. Write it, run this, then delete it.
 *
 *   NEXT_PUBLIC_POSTHOG_KEY=phc_...
 *   NEXT_PUBLIC_GA4_MEASUREMENT_ID=G-...
 *   NEXT_PUBLIC_GOOGLE_ADS_ID=AW-...
 *   NEXT_PUBLIC_META_PIXEL_ID=...
 *   GOOGLE_SITE_VERIFICATION=...
 *
 * Usage (PowerShell, from the repository root):
 *
 *   node scripts/ops/set-measurement-identifiers.mjs --from C:\measurement.txt --dry-run
 *   node scripts/ops/set-measurement-identifiers.mjs --from C:\measurement.txt
 *
 * `--dry-run` validates, reports what would change, and writes nothing.
 * `--local-only` writes .env.local and leaves Vercel alone, for a machine that
 * is not logged in.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { ENV_MANIFEST, shapeFor } from '../../src/lib/env/manifest.mjs'

const TAG = '[set-measurement-identifiers]'
const PROJECT = 'eventlinqs-app'
const SCOPES = ['production', 'preview', 'development']

const ACCEPTED = [
  'NEXT_PUBLIC_POSTHOG_KEY',
  'NEXT_PUBLIC_GA4_MEASUREMENT_ID',
  'NEXT_PUBLIC_GOOGLE_ADS_ID',
  'NEXT_PUBLIC_META_PIXEL_ID',
  'GOOGLE_SITE_VERIFICATION',
]

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const localOnly = args.includes('--local-only')
let from = null
for (let i = 0; i < args.length; i += 1) if (args[i] === '--from') from = args[i + 1]

function die(message) {
  console.error(`${TAG} REFUSED: ${message}`)
  process.exit(1)
}

/** Name, length and a short fingerprint. Never the value. */
function describe(value) {
  return `length ${value.length}, fp ${createHash('sha256').update(value).digest('hex').slice(0, 8)}`
}

if (!from) die('--from <file> is required. Write one NAME=value per line, run this, then delete the file.')
if (!existsSync(from)) die(`${from} does not exist.`)

/* ------------------------------------------------ read and validate the input */

const wanted = new Map()
const rejected = []
for (const raw of readFileSync(from, 'utf8').split(/\r?\n/)) {
  const line = raw.trim()
  if (!line || line.startsWith('#')) continue
  const at = line.indexOf('=')
  if (at === -1) {
    rejected.push(`${line.slice(0, 24)}... is not NAME=value`)
    continue
  }
  const name = line.slice(0, at).trim()
  // TRIMMED, because a pasted trailing space is the documented way a value of
  // the right length fails its shape at build time and nobody can see why.
  const value = line.slice(at + 1).trim()
  if (!ACCEPTED.includes(name)) {
    rejected.push(`${name} is not one of the five this script sets`)
    continue
  }
  if (!value) {
    rejected.push(`${name} has an empty value`)
    continue
  }
  wanted.set(name, value)
}

for (const message of rejected) console.error(`${TAG} ignored: ${message}`)
if (wanted.size === 0) die('the file named none of the five identifiers this script sets.')

const shapeFailures = []
for (const [name, value] of wanted) {
  const entry = ENV_MANIFEST.find(e => e.name === name)
  if (!entry) {
    shapeFailures.push(`${name} is not in the environment manifest, so nothing can say what it should look like`)
    continue
  }
  const shape = shapeFor(entry, 'production')
  if (!shape) continue
  const ok = new RegExp(shape.pattern).test(value) && value.length >= (shape.minLength ?? 0)
  if (!ok) shapeFailures.push(`${name} (${describe(value)}) is not ${shape.describe}`)
}
if (shapeFailures.length > 0) {
  for (const failure of shapeFailures) console.error(`${TAG} REFUSED: ${failure}`)
  die(`${shapeFailures.length} value(s) fail the shape the build will check. Nothing was written.`)
}

console.log(`${TAG} ${wanted.size} identifier(s) read and all of them match the manifest shape:`)
for (const [name, value] of wanted) console.log(`${TAG}   ${name}  ${describe(value)}`)

/* --------------------------------------------------------------- .env.local */

function writeLocal() {
  const path = '.env.local'
  if (!existsSync(path)) {
    console.log(`${TAG} .env.local does not exist here, so nothing local was written.`)
    return
  }
  const lines = readFileSync(path, 'utf8').split(/\r?\n/)
  let changed = 0
  for (const [name, value] of wanted) {
    const at = lines.findIndex(l => l.trim().startsWith(`${name}=`))
    const next = `${name}="${value}"`
    if (at === -1) {
      lines.push(next)
      changed += 1
    } else if (lines[at] !== next) {
      lines[at] = next
      changed += 1
    }
  }
  if (changed === 0) {
    console.log(`${TAG} .env.local already holds every value; nothing rewritten.`)
    return
  }
  if (dryRun) {
    console.log(`${TAG} DRY RUN: .env.local would gain or change ${changed} line(s).`)
    return
  }
  writeFileSync(path, lines.join('\n'))
  console.log(`${TAG} .env.local: ${changed} line(s) written.`)
}

writeLocal()
if (localOnly) {
  console.log(`${TAG} --local-only, so Vercel was not touched.`)
  process.exit(0)
}

/* ----------------------------------------------------------------- Vercel */

function vercel(argv, input) {
  return execFileSync('npx', ['--yes', 'vercel', ...argv], {
    encoding: 'utf8',
    input,
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  })
}

let whoami
try {
  whoami = vercel(['whoami']).trim()
} catch {
  die('the Vercel CLI is not logged in here. Run `npx vercel login` and try again. Signing in is the one part of this that is yours.')
}
console.log(`${TAG} Vercel CLI signed in as ${whoami}`)

let link = null
try {
  link = JSON.parse(readFileSync('.vercel/project.json', 'utf8'))
} catch (error) {
  console.warn(`${TAG} .vercel/project.json could not be read: ${String(error?.message ?? error)}`)
  die('this directory is not linked to a Vercel project. Run `npx vercel link` first.')
}
if (!link?.projectId) die('the linked project has no id, so this refuses rather than guessing which project it would write to.')
/*
 * The NAME is only in this file on a CLI new enough to write it. Where it is
 * there it is checked, and where it is not this says so rather than reporting a
 * check it did not make.
 */
if (link.projectName && link.projectName !== PROJECT) {
  die(`this directory is linked to ${link.projectName}, not ${PROJECT}. Nothing was written.`)
}
console.log(
  `${TAG} linked project ${link.projectName ?? `${link.projectId.slice(0, 10)}... (this CLI did not record a name, so the id is what was checked)`}`,
)

let existing = ''
try {
  existing = vercel(['env', 'ls'])
} catch (error) {
  die(`could not list the environment: ${String(error.message ?? error).split('\n')[0]}`)
}

const wrote = []
const skipped = []
for (const [name, value] of wanted) {
  for (const scope of SCOPES) {
    /*
     * `vercel env ls` prints names and scopes, never values, so it can say
     * whether a variable EXISTS on a scope and never whether it is the same
     * string. So an existing variable is UPDATED rather than skipped: update is
     * idempotent, and the read-back below is what proves the state.
     */
    const present = new RegExp(`^\\s*${name}\\b.*${scope}`, 'm').test(existing)
    const verb = present ? 'update' : 'add'
    if (dryRun) {
      skipped.push(`${name} [${scope}] would be ${verb}d`)
      continue
    }
    try {
      // The documented non-interactive path: pipe the value on stdin.
      // https://vercel.com/docs/cli/env (fetched 2026-08-09, recorded in Law 7)
      vercel(['env', verb, name, scope], `${value}\n`)
      wrote.push(`${name} [${scope}] ${verb}d`)
    } catch (error) {
      console.error(`${TAG} ${name} [${scope}] failed: ${String(error.message ?? error).split('\n')[0]}`)
    }
  }
}

for (const line of skipped) console.log(`${TAG} DRY RUN: ${line}`)
for (const line of wrote) console.log(`${TAG} ${line}`)

if (dryRun) {
  console.log(`${TAG} DRY RUN complete. Nothing was written anywhere.`)
  process.exit(0)
}

/* ------------------------------------------------------------ prove it landed */

let after = ''
try {
  after = vercel(['env', 'ls'])
} catch {
  die('wrote the values but could not read the environment back, so this refuses to report success.')
}

const missing = []
for (const name of wanted.keys()) {
  for (const scope of SCOPES) {
    if (!new RegExp(`^\\s*${name}\\b.*${scope}`, 'm').test(after)) missing.push(`${name} [${scope}]`)
  }
}

if (missing.length > 0) {
  console.error(`${TAG} FAILED: ${missing.length} value(s) are not in the environment after writing: ${missing.join(', ')}`)
  process.exit(1)
}

console.log(`${TAG} DONE. Every identifier is present on production, preview and development, read back from Vercel rather than assumed.`)
console.log(`${TAG} Delete ${from} now; it is the only place these sat in plain text on this machine.`)
console.log(`${TAG} The next deployment picks them up. Nothing loads for a visitor until they accept the banner.`)
