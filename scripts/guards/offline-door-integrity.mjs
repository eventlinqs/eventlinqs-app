/**
 * GUARD: THE OFFLINE DOOR NEVER HOLDS A SECRET, AND NEVER ADMITS TWICE.
 *
 * THE INVARIANTS, 5 September 2026 (Scope v5 3.12 and 3.13). A phone at a gate
 * downloads every ticket of the event and keeps it for 24 hours, judges scans
 * against it when the signal is gone, and hands its queue back to
 * sync_offline_scans when the signal returns. Four properties make that safe,
 * and every one of them can be broken by an edit that passes lint, typecheck,
 * build and the unit tests:
 *
 *   1. THE DOOR LIST CARRIES A HASH, NEVER THE SECRET. door_validation_set's
 *      RETURNS TABLE names secret_hash and no column called secret, and the
 *      device's record type (door-types.ts) and store (door-store.ts) have no
 *      field called secret. Add `t.secret` to the SELECT for convenience and
 *      every lost phone becomes a ticket printer.
 *
 *   2. THE SYNC ADMITS THROUGH THE SAME COMPARE-AND-SET scan_ticket USES.
 *      The UPDATE in sync_offline_scans must carry `t.status = 'valid'` and
 *      match the hash. Drop the status clause and two doors syncing the same
 *      ticket both record 'admitted', which is the one thing the scope says
 *      must never happen.
 *
 *   3. NO APPLICATION CODE WRITES ticket_scans. The audit table is written by
 *      the RPCs only; a hand-written insert would bypass the client_scan_id
 *      idempotency and the review flag.
 *
 *   4. THE SERVICE WORKER TOUCHES ONLY WHAT IT SAYS. GET only, /scan/
 *      navigations and /_next/static/ assets, one cache name shared with the
 *      scanner. A fetch handler that widened to '/' would start serving stale
 *      checkouts from a cache.
 *
 * WHAT IT CANNOT SEE, plainly: it reads source text. It cannot prove the RPC
 * serialises two doors; scripts/verify/offline-door-schema-verify.mjs proves
 * that on TEST by syncing the same ticket from two devices and reading back
 * exactly one 'admitted'.
 *
 * Run standalone:  node scripts/guards/offline-door-integrity.mjs
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')

export const SCANS_TABLE = 'ticket_scans'
export const MIGRATION_FILE = 'supabase/migrations/20260905000001_offline_door_validation.sql'
export const TYPES_FILE = 'src/lib/scanner/door-types.ts'
export const STORE_FILE = 'src/lib/scanner/door-store.ts'
export const WORKER_FILE = 'public/scan-sw.js'
export const SCANNER_FILE = 'src/components/features/scanner/scanner.tsx'

const WRITE_METHODS = /\.(insert|update|upsert|delete)\s*\(/

/** Every `.from('ticket_scans')` in a source text followed by a write method on the same statement. */
export function findDirectWrites(text, table = SCANS_TABLE) {
  const findings = []
  const pattern = new RegExp(`\\.from\\(\\s*['"\`]${table}['"\`]\\s*\\)`, 'g')
  let m
  while ((m = pattern.exec(text)) !== null) {
    const start = m.index
    const rest = text.slice(start + m[0].length)
    const stopAt = [rest.indexOf('\n\n'), rest.search(/\bawait\b/), 400]
      .filter((n) => n >= 0)
      .reduce((a, b) => Math.min(a, b), Infinity)
    const statement = rest.slice(0, stopAt === Infinity ? 400 : stopAt)
    const write = WRITE_METHODS.exec(statement)
    if (write) findings.push({ line: text.slice(0, start).split('\n').length, method: write[1] })
  }
  return findings
}

/** The body of one CREATE OR REPLACE FUNCTION public.<name>( ... ) up to its closing $$; */
function functionBlock(sql, name) {
  const start = sql.search(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\(`))
  if (start === -1) return null
  const end = sql.indexOf('\n$$;', start)
  return end === -1 ? sql.slice(start) : sql.slice(start, end + 4)
}

/** Findings about the migration text. */
export function checkMigration(sql) {
  const failures = []
  const set = functionBlock(sql, 'door_validation_set')
  if (!set) {
    failures.push('door_validation_set is not defined')
  } else {
    const returns = /RETURNS TABLE \(([\s\S]*?)\)\s*LANGUAGE/.exec(set)?.[1] ?? ''
    if (!/\bsecret_hash\s+text\b/.test(returns)) failures.push('door_validation_set no longer returns secret_hash')
    if (/\bsecret\s+(text|uuid)\b/.test(returns)) failures.push('door_validation_set returns a column called secret: the door list must carry the hash only')
    if (!/digest\(t\.secret::text, 'sha256'\)/.test(set)) failures.push('door_validation_set no longer hashes the secret with sha256')
  }
  const sync = functionBlock(sql, 'sync_offline_scans')
  if (!sync) {
    failures.push('sync_offline_scans is not defined')
  } else {
    const update = /UPDATE public\.tickets t[\s\S]*?RETURNING/.exec(sync)?.[0] ?? ''
    if (!/AND t\.status\s*=\s*'valid'/.test(update)) failures.push("sync_offline_scans admits without `t.status = 'valid'`: two doors could both record admitted")
    if (!/digest\(t\.secret::text, 'sha256'\), 'hex'\)\s*=\s*v_hash/.test(update)) failures.push('sync_offline_scans admits without matching the secret hash')
    if (!/SET status\s*=\s*'scanned'/.test(update)) failures.push('sync_offline_scans no longer moves the ticket to scanned')
    if (!/'needs_review'/.test(sync)) failures.push('sync_offline_scans no longer flags a second admission for review')
  }
  for (const [name, args] of [
    ['door_validation_set', 'uuid, text, integer'],
    ['sync_offline_scans', 'uuid, jsonb'],
    ['resolve_scan_review', 'uuid, text'],
  ]) {
    const revoke = new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\(${args.replace(/[()]/g, '\\$&')}\\) FROM PUBLIC, anon`)
    const grant = new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\(${args.replace(/[()]/g, '\\$&')}\\) TO authenticated`)
    if (!revoke.test(sql)) failures.push(`${name} is not revoked from anon`)
    if (!grant.test(sql)) failures.push(`${name} is not granted to authenticated`)
  }
  return failures
}

/** The device never keeps a field called secret. */
export function checkDeviceShapes(typesText, storeText) {
  const failures = []
  if (!/secretHash:\s*string/.test(typesText)) failures.push(`${TYPES_FILE} no longer carries secretHash`)
  if (/^\s*secret\??:\s*string/m.test(typesText)) failures.push(`${TYPES_FILE} declares a field called secret: the device must hold the hash only`)
  if (/^\s*secret\??:\s*string/m.test(storeText) || /\bsecret:\s*[a-zA-Z]/.test(storeText)) failures.push(`${STORE_FILE} stores a field called secret`)
  return failures
}

/** The worker is GET only, scoped to /scan/ navigations and /_next/static/, and shares the cache name. */
export function checkWorker(workerText, typesText) {
  const failures = []
  if (!/if \(request\.method !== 'GET'\) return/.test(workerText)) failures.push(`${WORKER_FILE} no longer refuses non-GET requests`)
  const responds = (workerText.match(/respondWith\(/g) ?? []).length
  if (responds !== 2) failures.push(`${WORKER_FILE} calls respondWith ${responds} time(s); it must answer exactly the /scan/ navigation and the /_next/static/ asset`)
  if (!/SCAN_PATH = '\/scan\/'/.test(workerText)) failures.push(`${WORKER_FILE} no longer scopes navigations to /scan/`)
  if (!/STATIC_PATH = '\/_next\/static\/'/.test(workerText)) failures.push(`${WORKER_FILE} no longer scopes assets to /_next/static/`)
  if (!/request\.mode === 'navigate' && url\.pathname\.indexOf\(SCAN_PATH\) === 0/.test(workerText)) failures.push(`${WORKER_FILE} answers something other than a /scan/ navigation from the shell cache`)
  const workerCache = /SHELL_CACHE = '([^']+)'/.exec(workerText)?.[1]
  const typesCache = /DOOR_SHELL_CACHE = '([^']+)'/.exec(typesText)?.[1]
  if (!workerCache || !typesCache || workerCache !== typesCache) failures.push(`the shell cache name differs between ${WORKER_FILE} (${workerCache ?? 'none'}) and ${TYPES_FILE} (${typesCache ?? 'none'})`)
  const scope = /DOOR_SERVICE_WORKER_SCOPE = '([^']+)'/.exec(typesText)?.[1]
  if (scope !== '/scan/') failures.push(`${TYPES_FILE} registers the worker at scope ${scope ?? 'none'}, not /scan/`)
  return failures
}

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, acc)
    else if (/\.(ts|tsx|mjs|js)$/.test(entry) && !/\.d\.ts$/.test(entry)) acc.push(full)
  }
  return acc
}

export function runGuard(root = ROOT) {
  const failures = []
  const files = walk(join(root, 'src'))
  let scanned = 0
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    scanned += 1
    const rel = relative(root, file).replace(/\\/g, '/')
    for (const f of findDirectWrites(text)) {
      failures.push(`${rel}:${f.line}  .${f.method}() on ${SCANS_TABLE}: the door RPCs write the audit, application code never does`)
    }
  }

  const read = (rel) => (existsSync(join(root, rel)) ? readFileSync(join(root, rel), 'utf8') : null)
  const migration = read(MIGRATION_FILE)
  if (migration === null) failures.push(`${MIGRATION_FILE} is missing`)
  else failures.push(...checkMigration(migration).map((f) => `${MIGRATION_FILE}: ${f}`))

  const types = read(TYPES_FILE)
  const store = read(STORE_FILE)
  if (types === null) failures.push(`${TYPES_FILE} is missing`)
  if (store === null) failures.push(`${STORE_FILE} is missing`)
  if (types !== null && store !== null) failures.push(...checkDeviceShapes(types, store))

  const worker = read(WORKER_FILE)
  if (worker === null) failures.push(`${WORKER_FILE} is missing`)
  else if (types !== null) failures.push(...checkWorker(worker, types))

  const scanner = read(SCANNER_FILE)
  if (scanner === null) failures.push(`${SCANNER_FILE} is missing`)
  else {
    if (!/syncOfflineScans\(/.test(scanner)) failures.push(`${SCANNER_FILE} no longer reconciles its queue through syncOfflineScans`)
    if (!/downloadValidationPage\(/.test(scanner)) failures.push(`${SCANNER_FILE} no longer downloads the door list`)
  }

  return { scanned, failures }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  const { scanned, failures } = runGuard()
  if (failures.length > 0) {
    console.error(`[offline-door-integrity] FAIL - ${failures.length} finding(s) across ${scanned} source files:`)
    for (const f of failures) console.error(`    ${f}`)
    console.error(
      `\n    The door list carries a hash and never a secret, the sync admits through the same\n` +
        `    compare-and-set as scan_ticket, ticket_scans is written by the RPCs only, and the\n` +
        `    service worker answers only /scan/ navigations and /_next/static/ assets.\n`,
    )
    process.exit(1)
  }
  console.log(
    `[offline-door-integrity] PASS - ${scanned} source files, no direct writes to ${SCANS_TABLE}; the door list is hashed, ` +
      `the sync keeps status = 'valid', the worker is GET only on /scan/ and /_next/static/.`,
  )
}
