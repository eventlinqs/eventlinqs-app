/**
 * VERIFY THE PRODUCTION SCHEMA CARRIES WHAT THE CODE NAMES. One command, read
 * only, for the founder to run after `supabase db push --linked` on production,
 * and for anyone to run before merging code that names a new column.
 *
 * Law 10 (script the founder's step). The push itself is RESERVED: applying a
 * migration to production is the founder's, by his ruling of 26 August 2026.
 * The proof that it landed is not, and this is that proof. It observes the
 * result (does the column answer?) rather than trusting the push's own output.
 *
 * HOW IT GETS CREDENTIALS WITHOUT ANYONE PASTING ONE. The Vercel CLI is logged
 * in on this machine (A1 established that). Production's public URL and anon
 * key are pulled into a scratch file under the system temp directory, read into
 * memory, and the file is deleted in a `finally` before anything is printed.
 * Sensitive variables are never decrypted by `vercel env pull`, so the service
 * role key is never on disk; the anon key is the one every browser already
 * holds. The probe with the anon key is enough: a table the anon role may not
 * read still answers "permission denied", which is proof it exists
 * (scripts/guards/lib/schema-probe.mjs, calibration recorded there).
 *
 * It never prints a key. It prints the project ref, one verdict per object and
 * a final PASS or FAIL, and exits 1 on FAIL or when it could not look.
 *
 * Usage:
 *   node scripts/ops/verify-production-schema.mjs
 *   node scripts/ops/verify-production-schema.mjs --environment preview   # the TEST store
 *   node scripts/ops/verify-production-schema.mjs --env-file path.env     # skip the CLI, read a file
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { probeSchemaObject, projectRefOf } from '../guards/lib/schema-probe.mjs'
import { SCHEMA_THE_CODE_NAMES } from '../guards/lib/schema-manifest.mjs'

const TAG = '[verify-production-schema]'
const args = process.argv.slice(2)
let environment = 'production'
let envFile = null
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--environment') environment = args[++i]
  else if (args[i] === '--env-file') envFile = args[++i]
}

function parseEnvFile(path) {
  const out = {}
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim())
    if (!m) continue
    let v = m[2].trim()
    if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
    out[m[1]] = v
  }
  return out
}

/**
 * The Vercel CLI, run as a Node program rather than through a shell. On
 * Windows the global install lives under %APPDATA%\npm and its `vercel.cmd`
 * shim needs cmd.exe, and passing arguments through a shell is the pattern
 * Node warns about (DEP0190). The package's own entrypoint is a plain script,
 * so it is run with this process's Node and the arguments stay arguments.
 */
function vercelInvocation() {
  const roots = []
  if (process.env.APPDATA) roots.push(join(process.env.APPDATA, 'npm', 'node_modules', 'vercel'))
  roots.push(join(process.cwd(), 'node_modules', 'vercel'))
  for (const root of roots) {
    const entry = join(root, 'dist', 'index.js')
    if (existsSync(entry)) return { file: process.execPath, prefix: [entry] }
  }
  return { file: 'vercel', prefix: [] }
}

function pullPublicEnv(target) {
  const dir = mkdtempSync(join(tmpdir(), 'el-schema-'))
  const file = join(dir, `.${target}.env`)
  try {
    const cli = vercelInvocation()
    const result = spawnSync(cli.file, [...cli.prefix, 'env', 'pull', file, `--environment=${target}`, '--yes'], {
      encoding: 'utf8',
    })
    if (result.status !== 0 || !existsSync(file)) {
      const why = (result.stderr || result.stdout || '').trim().split('\n').slice(-3).join(' ')
      throw new Error(`vercel env pull for ${target} failed: ${why || `exit ${result.status}`}`)
    }
    return parseEnvFile(file)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

let env
try {
  env = envFile ? parseEnvFile(envFile) : pullPublicEnv(environment)
} catch (err) {
  console.error(`${TAG} FAIL: could not obtain the ${environment} public URL and anon key.`)
  console.error(`${TAG}       ${err instanceof Error ? err.message : String(err)}`)
  console.error(`${TAG}       Is the Vercel CLI logged in and this directory linked to eventlinqs-app?`)
  process.exit(1)
}

const url = (env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim()
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!url || !key) {
  console.error(`${TAG} FAIL: the ${environment} store has no NEXT_PUBLIC_SUPABASE_URL or anon key to probe with.`)
  process.exit(1)
}
const ref = projectRefOf(url) ?? 'unknown'
console.log(`${TAG} ${environment} store points at project ${ref}. Probing ${SCHEMA_THE_CODE_NAMES.length} object(s), read only.`)

let absent = 0
let unknown = 0
for (const item of SCHEMA_THE_CODE_NAMES) {
  const r = await probeSchemaObject({ url, key, table: item.table, column: item.column })
  const name = `${item.table}.${item.column}`.padEnd(34)
  if (r.state === 'present') console.log(`${TAG}   PRESENT  ${name} (${r.status}${r.code ? ` ${r.code}` : ''})`)
  else if (r.state === 'absent') {
    console.log(`${TAG}   ABSENT   ${name} (${r.status} ${r.code}) needs ${item.migration}`)
    absent += 1
  } else {
    console.log(`${TAG}   UNKNOWN  ${name} (${r.status} ${r.code || 'no code'}${r.message ? `: ${r.message}` : ''})`)
    unknown += 1
  }
}

if (unknown > 0) {
  console.error(`${TAG} FAIL: could not look at ${unknown} object(s) on ${ref}. Not a verdict on the schema.`)
  process.exit(1)
}
if (absent > 0) {
  console.error(`${TAG} FAIL: ${absent} object(s) the code names are ABSENT on ${ref}. Code that names them must not deploy there yet.`)
  process.exit(1)
}
console.log(`${TAG} PASS: every schema object the code names exists on ${ref}. Code that names them may deploy there.`)
