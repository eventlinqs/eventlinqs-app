/**
 * GUARD: THE CONSENT LEDGER IS EVIDENCE, AND THE RESOLVER IS THE ONLY DOOR.
 *
 * Close-out GA1 v3. A consent record is not data, it is evidence of what a
 * specific person was shown and agreed to at a specific moment. It cannot be
 * re-keyed to another tenant, its scope cannot be widened afterwards, and the
 * people it belongs to cannot be asked again. Everything below therefore checks
 * that the DATABASE refuses the thing, not that some function remembers to.
 *
 * THE ENFORCEMENT RECORD, corrected, because two figures in an earlier version
 * of this file were misdated and the conclusion drawn from them was half wrong.
 * ACMA penalised TAB 4,003,270 dollars in June 2025 (not April 2025) and again
 * 2.7 million dollars in July 2026; the Commonwealth Bank matter was 7.5 million
 * dollars announced in October 2024 (not August 2024). The claim that the usual
 * failure is a broken unsubscribe rather than missing consent is true of TAB
 * (2,598 messages with no unsubscribe against 11 sent without consent) and false
 * of the Commonwealth Bank, where 34.8 million messages went to people who had
 * not consented or had withdrawn. For a platform whose whole model turns on the
 * SCOPE of a consent, the larger exposure is record quality, which is why the
 * ledger clauses come first here and the exit clause last.
 *
 * THE FIVE CLAUSES.
 *
 *   1. APPEND ONLY IS ENFORCED BY THE DATABASE. Both ledgers refuse UPDATE and
 *      DELETE with a trigger, at statement level so a no-match statement is
 *      refused too, and the wording record refuses the same, because a wording
 *      that can be edited makes every consent given under it unprovable.
 *   2. AN EVENT CANNOT BE EMPTY EVIDENCE. Non-empty wording, non-null wording
 *      version and non-null tenant id are constraints on the table.
 *   3. AN AUDIENCE ROW CANNOT EXIST FOR SOMEBODY THE RESOLVER REFUSES. The
 *      audience table carries a BEFORE INSERT OR UPDATE trigger that asks the
 *      resolver, so a backfill, a hand-run INSERT and the refresh all meet it.
 *   4. NO SEND PATH REACHES A TRANSPORT WITHOUT THE RESOLVER. The set of modules
 *      that import a mail or SMS transport is re-derived from the repository on
 *      every run and judged against src/lib/consent/send-paths.ts: an
 *      unregistered module fails, and a module registered as marketing that does
 *      not call the resolver in its own file fails.
 *   5. NO UNSUBSCRIBE OR RIGHTS SURFACE ASKS ANYBODY TO LOG IN. An unsubscribe
 *      behind a login is the exact failure the fines above were for, and a
 *      privacy right behind a login is a right nobody exercises.
 *
 * ONE MORE, because clauses 3 and 4 are only as good as the taxonomy underneath
 * them: the purposes and their coverage are written in SQL and in TypeScript,
 * and the two must say the same thing. A trigger cannot call TypeScript, so the
 * duplication is deliberate; the drift is what is not allowed.
 *
 * IT READS THE REPOSITORY AND NOTHING ELSE, so it runs on the Vercel build host
 * with no database and no credentials.
 *
 * Run standalone:  node scripts/guards/consent-ledger-is-evidence.mjs
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { declareWork } from '../lib/work-report.mjs'
import { sourceFiles } from './lib/source.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const TAG = '[consent-ledger-is-evidence]'

const MIGRATIONS = join(ROOT, 'supabase', 'migrations')
const PURPOSES = join(ROOT, 'src', 'lib', 'consent', 'purposes.ts')
const SEND_PATHS = join(ROOT, 'src', 'lib', 'consent', 'send-paths.ts')

/** Surfaces that must work with no session, and the tells that they do not. */
const NO_SESSION_SURFACES = [
  join(ROOT, 'src', 'app', 'unsubscribe', 'digest', '[token]', 'page.tsx'),
  join(ROOT, 'src', 'app', 'unsubscribe', '[token]', 'page.tsx'),
  join(ROOT, 'src', 'app', 'marketing', 'preferences', 'page.tsx'),
  join(ROOT, 'src', 'app', 'marketing', 'preferences', '[token]', 'page.tsx'),
  join(ROOT, 'src', 'app', 'actions', 'marketing-rights.ts'),
]

const SESSION_TELLS = [
  'auth.getUser',
  'auth.getSession',
  'requireUser',
  'requireAdminSession',
  'requireSession',
]

/** What counts as reaching a transport. Import forms, not call sites. */
const TRANSPORT_IMPORTS = [
  /from '@\/lib\/email\/send'/,
  /from '\.\/send'/,
  /from '\.\.\/email\/send'/,
  /from 'resend'/,
  /from 'twilio'/,
  /from '@aws-sdk\/client-sns'/,
]

/** What counts as calling the resolver. */
const RESOLVER_CALLS = [/resolveSend\s*\(/, /filterPermittedRecipients\s*\(/]

const faults = []

function fail(clause, message) {
  faults.push(`${clause}: ${message}`)
}

function readAllMigrations() {
  if (!existsSync(MIGRATIONS)) return { sql: '', files: 0 }
  const names = readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql')).sort()
  let sql = ''
  for (const n of names) sql += readFileSync(join(MIGRATIONS, n), 'utf8') + '\n'
  return { sql, files: names.length }
}

/** Collapse whitespace so a reformatted statement still matches. */
function flat(text) {
  return text.replace(/\s+/g, ' ').toLowerCase()
}

const { sql, files: migrationCount } = readAllMigrations()
const flatSql = flat(sql)

// ---------------------------------------------------------------------------
// CLAUSE 1. Append only, enforced by the database.
// ---------------------------------------------------------------------------
const APPEND_ONLY_TABLES = ['consent_events', 'suppression_events', 'consent_wordings']
let appendOnlyChecks = 0
for (const table of APPEND_ONLY_TABLES) {
  for (const op of ['update', 'delete']) {
    appendOnlyChecks += 1
    const trigger = `before ${op} on public.${table} for each statement execute function public.refuse_ledger_mutation()`
    if (!flatSql.includes(trigger)) {
      fail(
        'clause 1',
        `public.${table} does not refuse ${op.toUpperCase()} at the database. Expected a statement-level trigger: "before ${op} on public.${table} for each statement execute function public.refuse_ledger_mutation()"`,
      )
    }
  }
}
if (!flatSql.includes('create or replace function public.refuse_ledger_mutation()')) {
  fail('clause 1', 'public.refuse_ledger_mutation() is not defined by any migration')
}

// ---------------------------------------------------------------------------
// CLAUSE 2. An event cannot be empty evidence.
// ---------------------------------------------------------------------------
const REQUIRED_CONSTRAINTS = [
  ['consent_events_wording_present check (length(btrim(wording)) > 0)', 'empty wording'],
  [
    'consent_events_wording_version_present check (length(btrim(wording_version)) > 0)',
    'an empty wording version',
  ],
  ['tenant_id uuid not null references public.marketing_tenants(id)', 'a null tenant id'],
]
let constraintChecks = 0
for (const [needle, what] of REQUIRED_CONSTRAINTS) {
  constraintChecks += 1
  if (!flatSql.includes(flat(needle))) {
    fail('clause 2', `nothing in the migrations refuses ${what} on public.consent_events (looked for "${needle}")`)
  }
}

// ---------------------------------------------------------------------------
// CLAUSE 3. No audience row for a subject the resolver refuses.
// ---------------------------------------------------------------------------
let audienceChecks = 0
const AUDIENCE_TRIGGER =
  'before insert or update on public.audience_members for each row execute function public.audience_requires_live_consent()'
audienceChecks += 1
if (!flatSql.includes(flat(AUDIENCE_TRIGGER))) {
  fail(
    'clause 3',
    'public.audience_members does not refuse a row the resolver refuses. Expected the trigger: ' +
      `"${AUDIENCE_TRIGGER}"`,
  )
}
audienceChecks += 1
if (!flatSql.includes('public.audience_consent_is_live(new.email)')) {
  fail('clause 3', 'the audience insert guard does not consult public.audience_consent_is_live')
}
audienceChecks += 1
if (!flatSql.includes("public.consent_permits('eventlinqs'")) {
  fail('clause 3', 'public.audience_consent_is_live does not ask the resolver public.consent_permits')
}

// ---------------------------------------------------------------------------
// CLAUSE 4. No send path reaches a transport without the resolver.
// ---------------------------------------------------------------------------
function parseRegistry() {
  if (!existsSync(SEND_PATHS)) return null
  const source = readFileSync(SEND_PATHS, 'utf8')
  const entries = new Map()
  const block = /\{\s*file:\s*'([^']+)',\s*kind:\s*'([^']+)'/g
  let m
  while ((m = block.exec(source)) !== null) entries.set(m[1], m[2])
  return entries.size > 0 ? entries : null
}

const registry = parseRegistry()
let sendPathsJudged = 0
if (!registry) {
  fail('clause 4', 'src/lib/consent/send-paths.ts could not be parsed, so no send path can be judged')
} else {
  const files = sourceFiles(ROOT)
  const reaching = []
  for (const file of files) {
    const source = readFileSync(join(ROOT, file), 'utf8')
    if (TRANSPORT_IMPORTS.some((re) => re.test(source))) reaching.push({ file, source })
  }
  if (reaching.length === 0) {
    fail('clause 4', 'no module in src/ imports a transport, which cannot be true; the detection is broken')
  }
  for (const { file, source } of reaching) {
    sendPathsJudged += 1
    const kind = registry.get(file)
    if (!kind) {
      fail(
        'clause 4',
        `${file} can reach a mail or SMS transport and is not classified in src/lib/consent/send-paths.ts. Add it as marketing, transactional, operations or transport, with the reason.`,
      )
      continue
    }
    if (kind === 'marketing' && !RESOLVER_CALLS.some((re) => re.test(source))) {
      fail(
        'clause 4',
        `${file} is registered as a marketing send path and never calls the resolver. Filter its recipients through resolveSend or filterPermittedRecipients.`,
      )
    }
  }
  for (const [file] of registry) {
    if (!existsSync(join(ROOT, file))) {
      fail('clause 4', `src/lib/consent/send-paths.ts lists ${file}, which no longer exists`)
    }
  }
}

// ---------------------------------------------------------------------------
// CLAUSE 5. No unsubscribe or rights surface asks anybody to log in.
// ---------------------------------------------------------------------------
let sessionChecks = 0
for (const surface of NO_SESSION_SURFACES) {
  if (!existsSync(surface)) {
    fail('clause 5', `${surface.replace(ROOT, '').replace(/\\/g, '/')} is missing; a rights or unsubscribe surface cannot be checked`)
    continue
  }
  sessionChecks += 1
  const source = readFileSync(surface, 'utf8')
  for (const tell of SESSION_TELLS) {
    if (source.includes(tell)) {
      fail(
        'clause 5',
        `${surface.replace(ROOT, '').replace(/\\/g, '/')} reads a session (${tell}). Unsubscribing and exercising a privacy right must never require a login.`,
      )
    }
  }
}

// ---------------------------------------------------------------------------
// AND THE TAXONOMY UNDERNEATH THEM. One decision, two languages.
// ---------------------------------------------------------------------------
function parseSeededPurposes(text) {
  const start = text.indexOf('insert into public.consent_purposes')
  if (start === -1) return null
  const end = text.indexOf('on conflict', start)
  if (end === -1) return null
  const body = text.slice(start, end)
  const out = new Map()
  const row = /\(\s*'([a-z_]+)',\s*'[^']*',\s*array\[([^\]]*)\]/g
  let m
  while ((m = row.exec(body)) !== null) {
    const covers = [...m[2].matchAll(/'([^']+)'/g)].map((c) => c[1])
    out.set(m[1], covers)
  }
  return out.size > 0 ? out : null
}

function parseTypeScriptPurposes(source) {
  const start = source.indexOf('export const CONSENT_PURPOSES')
  if (start === -1) return null
  const end = source.indexOf('] as const', start)
  if (end === -1) return null
  const body = source.slice(start, end)
  const out = new Map()
  const row = /purpose:\s*'([a-z_]+)'[\s\S]*?covers:\s*\[([^\]]*)\]/g
  let m
  while ((m = row.exec(body)) !== null) {
    const covers = [...m[2].matchAll(/'([^']+)'/g)].map((c) => c[1])
    out.set(m[1], covers)
  }
  return out.size > 0 ? out : null
}

let purposeChecks = 0
const seeded = parseSeededPurposes(sql)
const declared = existsSync(PURPOSES) ? parseTypeScriptPurposes(readFileSync(PURPOSES, 'utf8')) : null
if (!seeded) {
  fail('taxonomy', 'the consent_purposes seed could not be parsed out of the migrations')
} else if (!declared) {
  fail('taxonomy', 'CONSENT_PURPOSES could not be parsed out of src/lib/consent/purposes.ts')
} else {
  for (const [purpose, covers] of seeded) {
    purposeChecks += 1
    if (!declared.has(purpose)) {
      fail('taxonomy', `public.consent_purposes seeds ${purpose} and src/lib/consent/purposes.ts does not carry it`)
      continue
    }
    const mine = declared.get(purpose)
    const same = covers.length === mine.length && covers.every((c) => mine.includes(c))
    if (!same) {
      fail(
        'taxonomy',
        `${purpose} covers [${covers.join(', ')}] in SQL and [${mine.join(', ')}] in TypeScript. A broad consent that covers a narrower purpose in one language and not the other is a send decision that disagrees with itself.`,
      )
    }
  }
  for (const purpose of declared.keys()) {
    if (!seeded.has(purpose)) {
      fail('taxonomy', `src/lib/consent/purposes.ts carries ${purpose} and no migration seeds it`)
    }
  }
}

declareWork('consent-ledger-is-evidence', {
  did: {
    'migration read': migrationCount,
    'append-only refusal checked': appendOnlyChecks,
    'evidence constraint checked': constraintChecks,
    'audience refusal checked': audienceChecks,
    'send path judged': sendPathsJudged,
    'no-session surface checked': sessionChecks,
    'purpose held equal in two languages': purposeChecks,
  },
  found: { 'consent ledger fault': faults.length },
})

console.log(
  `${TAG} read ${migrationCount} migration(s); checked ${appendOnlyChecks} append-only refusal(s), ` +
    `${constraintChecks} evidence constraint(s), ${audienceChecks} audience refusal(s), ` +
    `${sendPathsJudged} send path(s), ${sessionChecks} no-session surface(s) and ${purposeChecks} purpose(s)`,
)

if (faults.length > 0) {
  for (const fault of faults) console.error(`${TAG} FAIL: ${fault}`)
  console.error(`${TAG} ${faults.length} fault(s).`)
  process.exit(1)
}

console.log(`${TAG} OK`)
