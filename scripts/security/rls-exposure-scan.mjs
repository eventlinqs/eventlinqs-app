/*
 * NO SHEBANG ON THIS FILE, DELIBERATELY. Do not put one back.
 *
 * `tests/unit/security/rls-column-exposure.test.ts` IMPORTS `scanMigrations`
 * from here, and Vite does not strip a `#!` line when it serves a module to the
 * test runner. The whole suite then died at collection with
 * `SyntaxError: Invalid or unexpected token` and no line number, so the test
 * that guards the world-readable-column class reported "no tests" and passed
 * vacuously for the entire life of this branch.
 *
 * The shebang bought nothing: every caller invokes this file as
 * `node scripts/security/rls-exposure-scan.mjs`, and the guard runner spawns it
 * with `process.execPath`. Twenty-nine other scripts under scripts/ still carry
 * one, which is fine while nothing imports them, and is the same trap the day
 * something does.
 */
/**
 * RLS column-exposure scanner and CI gate.
 *
 * THE CLASS THIS CATCHES. Row Level Security filters ROWS, never COLUMNS. A
 * policy written as
 *
 *   CREATE POLICY "x is viewable by everyone" ON public.x FOR SELECT USING (true);
 *
 * has no TO clause, so it applies to PUBLIC, which includes the `anon` role.
 * The anon key is NEXT_PUBLIC and sits in every page's source. So that one
 * policy publishes EVERY COLUMN of every matching row to anyone with a browser,
 * including columns the application never renders.
 *
 * This has now happened twice in this schema. 20260625000002 closed it on
 * `profiles` (email, full_name, phone). 20260808000010 closed it on
 * `organisations` (email, phone, the whole Stripe posture), `event_artists`
 * (invite_token, a credential that transfers profile ownership) and `venues`.
 * The first fix dropped a policy, which fixed the instance and left the CLASS
 * alive. This gate exists so there is no third time.
 *
 * WHY IT MODELS PRIVILEGES AND NOT JUST POLICIES. The correct fix for this
 * class is a column privilege (REVOKE SELECT, then GRANT SELECT (cols)),
 * because a privilege sits one layer BELOW RLS and no policy can override it. A
 * scanner that read only policies would therefore stay red forever after a
 * correct fix, and a gate that cannot go green is a gate nobody keeps. So this
 * replays BOTH: the policies (which rows a role can see) and the column grants
 * (which columns it can see), and reports the intersection.
 *
 * Exit 0 = no unaccepted exposure. Exit 1 = at least one. This is the CI gate.
 *
 * Usage:
 *   node scripts/security/rls-exposure-scan.mjs             # gate
 *   node scripts/security/rls-exposure-scan.mjs --report    # + acceptable rows
 *   node scripts/security/rls-exposure-scan.mjs --columns organisations
 */

import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../..')
export const DEFAULT_MIGRATIONS_DIR = path.join(ROOT, 'supabase/migrations')

/** Roles that an untrusted caller can reach. `anon` needs no account at all;
 *  `authenticated` needs one free signup, which is not a security boundary. */
export const UNTRUSTED_ROLES = ['anon', 'authenticated']

/**
 * Columns whose exposure to an untrusted caller is a defect, and WHY. The
 * reason is carried so a reviewer can argue with the list rather than trust it.
 */
const SENSITIVE = [
  { re: /^email$/i,                   why: 'contact email (PII, mass-harvestable)' },
  { re: /^phone$/i,                   why: 'contact phone (PII, mass-harvestable)' },
  { re: /^(full_name|holder_name)$/i, why: 'person name (PII)' },
  { re: /_email$/i,                   why: 'email address (PII)' },
  { re: /^(dob|date_of_birth)$/i,     why: 'personal detail (PII)' },
  // `address` is deliberately ABSENT from this list. A venue street address is
  // where the event is and is printed on the ticket: business data, not personal
  // data. Hiding it would break the thing users need most from a venue page. If
  // a table ever stores a PERSON's address, add a narrower rule for that column
  // rather than a blanket /address/ match, which would fire on every venue.
  { re: /token$/i,                    why: 'bearer token (credential)' },
  { re: /^secret$/i,                  why: 'bearer secret (credential)' },
  { re: /_secret$/i,                  why: 'secret (credential)' },
  { re: /^(password|password_hash)$/i, why: 'password material (credential)' },
  { re: /^recovery/i,                 why: 'recovery credential' },
  { re: /^access_code$/i,             why: 'access code (credential)' },
  { re: /^stripe_/i,                  why: 'payment/payout infrastructure identifier' },
  { re: /^(user_id|owner_id|created_by|updated_by)$/i, why: 'foreign key to a person (de-anonymising)' },
  { re: /_user_id$/i,                 why: 'foreign key to a person (de-anonymising)' },
  { re: /^metadata$/i,                why: 'free-form JSONB (unknowable contents)' },
  { re: /^(internal_notes|admin_notes)$/i, why: 'internal free text' },
]

/**
 * Exposures reviewed and ACCEPTED, each with the reason it is not a defect, or
 * DEFERRED with the reason it is not being fixed in this pass.
 *
 * This is a visible baseline, never a silent cap. Every entry is printed on
 * every run precisely so it stays arguable and cannot rot into an unexamined
 * allowlist. Adding an entry is a security decision and belongs in review.
 *
 * Key format: `table.column`.
 */
export const ACCEPTED = {
  // DEFERRED, with reasons. These are person foreign keys and free-form blobs on
  // otherwise-public tables. They de-anonymise "who created this" but leak no
  // contact detail and no credential, so they rank LOW. Fixing them means
  // narrowing column grants on tables whose public reads use `select('*')`
  // widely (events has 64 columns), which is a materially riskier change than
  // the CRITICAL one and does not belong bundled with it.
  'events.created_by':            'DEFERRED (LOW): person FK on a public table. Needs events select(*) call sites narrowed first.',
  'events.metadata':              'DEFERRED (LOW): free-form JSONB on a public table. Audit contents before narrowing.',
  'ticket_tiers.metadata':        'DEFERRED (LOW): free-form JSONB, public tier data. Audit contents before narrowing.',
  'artists.owner_user_id':        'DEFERRED (LOW): person FK on a public artist profile.',
  'gigs.created_by':              'DEFERRED (LOW): person FK on a public gig listing.',
  'pricing_rules.created_by':     'DEFERRED (LOW): person FK on public region-default pricing.',
  'feature_flags.updated_by':     'DEFERRED (LOW): person FK; flag state is already public by design.',
  'seat_section_views.created_by': 'DEFERRED (LOW): person FK on public section photos.',
}

function classify(column) {
  for (const s of SENSITIVE) if (s.re.test(column)) return s.why
  return null
}

function stripComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ')
}

/** Split on semicolons outside quotes and dollar-quoted function bodies. */
function statements(sql) {
  const out = []
  let buf = ''
  let i = 0
  let quote = null
  while (i < sql.length) {
    const ch = sql[i]
    if (quote === null) {
      const dollar = sql.slice(i).match(/^\$([A-Za-z_]*)\$/)
      if (dollar) {
        quote = dollar[0]
        buf += quote
        i += quote.length
        continue
      }
      if (ch === "'" || ch === '"') {
        quote = ch
        buf += ch
        i++
        continue
      }
      if (ch === ';') {
        out.push(buf)
        buf = ''
        i++
        continue
      }
      buf += ch
      i++
    } else if (quote === "'" || quote === '"') {
      buf += ch
      if (ch === quote) quote = null
      i++
    } else {
      if (sql.startsWith(quote, i)) {
        buf += quote
        i += quote.length
        quote = null
        continue
      }
      buf += ch
      i++
    }
  }
  if (buf.trim()) out.push(buf)
  return out
}

const norm = (t) => t.replace(/"/g, '').replace(/^public\./i, '').trim().toLowerCase()

function parseTableBody(body) {
  const parts = []
  let depth = 0
  let cur = ''
  for (const ch of body) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      parts.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  if (cur.trim()) parts.push(cur)
  const cols = []
  for (const raw of parts) {
    const line = raw.trim()
    if (!line) continue
    if (/^(CONSTRAINT|PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK|EXCLUDE|LIKE)\b/i.test(line)) continue
    const m = line.match(/^"?([a-z_][a-z0-9_]*)"?\s+/i)
    if (m) cols.push(m[1].toLowerCase())
  }
  return cols
}

/**
 * Is this policy able to publish rows to `role` with no credential-specific
 * predicate standing in the way?
 *
 * The role reaching a policy is only half the question; the USING expression
 * still has to evaluate true for it. Two whole classes are NOT public despite
 * having no TO clause, and conflating them with the real thing turned a 2-table
 * finding into a 33-table one on the first pass:
 *
 *   USING (auth.role() = 'service_role')  -- anon's role is 'anon', never matches
 *   USING (user_id = auth.uid())          -- auth.uid() is NULL for anon
 *
 * A THIRD CLASS ARRIVED WITH 20260819000001, and missing it made this scanner
 * useless rather than merely wrong. That migration moved the ownership lookups out
 * of the policy expressions and into SECURITY DEFINER helpers, because evaluating a
 * subquery over `organisations` required the CALLER to hold SELECT on it, which is
 * what took every event page to 404. The helpers still scope to `auth.uid()` -- that
 * is their entire body -- but the POLICY text no longer contains the string
 * `auth.uid()`, so the test above stopped recognising 32 identity-scoped policies
 * and reported them as publishing to anon.
 *
 * Over-reporting is the safe direction, but 32 false findings is a guard somebody
 * switches off, and it would bury a real exposure in noise. So a call to one of the
 * identity helpers counts as an identity predicate, which is exactly what it is: the
 * helper returns rows only for the calling user, and returns NOTHING for anon
 * because auth.uid() is null there.
 *
 * They are named EXPLICITLY rather than matched by a pattern. A wildcard like
 * /el_.*\(\)/ would let any future function be mistaken for an identity check by
 * naming itself well, which is the kind of hole that gets added by accident.
 */
const IDENTITY_HELPERS = [
  'el_owned_organisation_ids',
  'el_member_organisation_ids',
  'el_any_member_organisation_ids',
]

function admitsRole(p, role) {
  if (!p.permissive) return false
  if (p.cmd !== 'SELECT' && p.cmd !== 'ALL') return false
  const reaches = p.roles.includes('public') || p.roles.includes(role)
  if (!reaches) return false
  const usesIdentityHelper = IDENTITY_HELPERS.some(fn =>
    new RegExp(`\\b${fn}\\s*\\(`, 'i').test(p.using),
  )
  const identityPredicate =
    usesIdentityHelper ||
    /auth\.uid\(\)|auth\.jwt\(\)|auth\.role\(\)|current_setting\s*\(\s*'request\.jwt/i.test(p.using)
  if (identityPredicate) return /'anon'/i.test(p.using)
  return true
}

export function scanMigrations(dir = DEFAULT_MIGRATIONS_DIR) {
  const policies = new Map()
  const columns = new Map()
  // (table -> role -> {mode:'all'|'columns'|'none', cols:Set})
  const grants = new Map()

  const grantState = (table, role) => {
    if (!grants.has(table)) grants.set(table, new Map())
    const byRole = grants.get(table)
    // Supabase's default setup grants SELECT on all columns of public tables to
    // anon and authenticated, so 'all' is the correct starting assumption.
    if (!byRole.has(role)) byRole.set(role, { mode: 'all', cols: new Set() })
    return byRole.get(role)
  }

  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()

  for (const file of files) {
    const sql = stripComments(readFileSync(path.join(dir, file), 'utf8'))
    for (const stmt of statements(sql)) {
      const s = stmt.trim()
      if (!s) continue

      const ct = s.match(/^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w".]+)\s*\(([\s\S]*)\)\s*$/i)
      if (ct) {
        const t = norm(ct[1])
        if (!columns.has(t)) columns.set(t, new Set())
        for (const c of parseTableBody(ct[2])) columns.get(t).add(c)
        continue
      }

      const ac = s.match(/^ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?([\w".]+)\s+([\s\S]*)$/i)
      if (ac) {
        const t = norm(ac[1])
        for (const m of ac[2].matchAll(/ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-z_][a-z0-9_]*)"?/gi)) {
          if (!columns.has(t)) columns.set(t, new Set())
          columns.get(t).add(m[1].toLowerCase())
        }
        continue
      }

      const dp = s.match(/^DROP\s+POLICY\s+(?:IF\s+EXISTS\s+)?("[^"]+"|\S+)\s+ON\s+([\w".]+)/i)
      if (dp) {
        policies.delete(`${norm(dp[2])}::${dp[1].replace(/"/g, '')}`)
        continue
      }

      const cp = s.match(/^CREATE\s+POLICY\s+("[^"]+"|\S+)\s+ON\s+([\w".]+)([\s\S]*)$/i)
      if (cp) {
        const name = cp[1].replace(/"/g, '')
        const table = norm(cp[2])
        const tail = cp[3]
        const forM = tail.match(/FOR\s+(ALL|SELECT|INSERT|UPDATE|DELETE)/i)
        const toM = tail.match(/\bTO\s+([a-z_,\s"]+?)(?=\s+(?:USING|WITH)\b|$)/i)
        const usingM = tail.match(/USING\s*\(([\s\S]*?)\)\s*(?:WITH\s+CHECK|$)/i)
        policies.set(`${table}::${name}`, {
          table,
          name,
          file,
          permissive: !/AS\s+RESTRICTIVE/i.test(tail),
          cmd: forM ? forM[1].toUpperCase() : 'ALL',
          roles: toM
            ? toM[1].split(',').map((r) => r.replace(/"/g, '').trim().toLowerCase()).filter(Boolean)
            : ['public'],
          using: usingM ? usingM[1].trim() : '',
        })
        continue
      }

      // REVOKE SELECT ON <table> FROM <roles>
      const rv = s.match(/^REVOKE\s+(?:ALL|SELECT)[\s\S]*?\sON\s+(?:TABLE\s+)?([\w".]+)\s+FROM\s+([\s\S]+)$/i)
      if (rv && /^REVOKE\s+(ALL|SELECT)/i.test(s)) {
        const t = norm(rv[1])
        for (const role of rv[2].split(',').map((r) => r.replace(/"/g, '').trim().toLowerCase())) {
          if (!UNTRUSTED_ROLES.includes(role)) continue
          const st = grantState(t, role)
          st.mode = 'none'
          st.cols = new Set()
        }
        continue
      }

      // GRANT SELECT [(cols)] ON <table> TO <roles>
      const gr = s.match(/^GRANT\s+SELECT\s*(\(([^)]*)\))?\s*ON\s+(?:TABLE\s+)?([\w".]+)\s+TO\s+([\s\S]+)$/i)
      if (gr) {
        const cols = gr[2]
          ? gr[2].split(',').map((c) => c.replace(/"/g, '').trim().toLowerCase()).filter(Boolean)
          : null
        const t = norm(gr[3])
        for (const role of gr[4].split(',').map((r) => r.replace(/"/g, '').trim().toLowerCase())) {
          if (!UNTRUSTED_ROLES.includes(role)) continue
          const st = grantState(t, role)
          if (cols === null) {
            st.mode = 'all'
            st.cols = new Set()
          } else {
            if (st.mode !== 'columns') {
              st.mode = 'columns'
              st.cols = new Set()
            }
            for (const c of cols) st.cols.add(c)
          }
        }
        continue
      }
    }
  }

  /** Which columns of `table` can `role` actually read. */
  const visibleColumns = (table, role) => {
    const all = [...(columns.get(table) ?? [])]
    const st = grants.get(table)?.get(role)
    if (!st || st.mode === 'all') return all
    if (st.mode === 'none') return []
    return all.filter((c) => st.cols.has(c))
  }

  const findings = []
  for (const p of policies.values()) {
    for (const role of UNTRUSTED_ROLES) {
      if (!admitsRole(p, role)) continue
      for (const col of visibleColumns(p.table, role)) {
        const why = classify(col)
        if (!why) continue
        findings.push({
          table: p.table,
          column: col,
          why,
          role,
          policy: p.name,
          using: p.using,
          file: p.file,
          key: `${p.table}.${col}`,
        })
      }
    }
  }

  // Collapse anon + authenticated into one row per table.column.
  const byKey = new Map()
  for (const f of findings) {
    if (!byKey.has(f.key)) byKey.set(f.key, { ...f, roles: new Set() })
    byKey.get(f.key).roles.add(f.role)
  }

  const live = []
  const accepted = []
  for (const f of byKey.values()) {
    const note = ACCEPTED[f.key]
    if (note) accepted.push({ ...f, note })
    else live.push(f)
  }

  // Entries in ACCEPTED that no longer match a real exposure. They are dead
  // weight, and dead weight is how a reviewed baseline rots into an unexamined
  // allowlist: the next reader cannot tell which lines still mean something.
  // Surfaced so they get deleted when the underlying exposure is actually fixed.
  const staleAcceptances = Object.keys(ACCEPTED).filter((k) => !byKey.has(k))

  live.sort((a, b) => a.table.localeCompare(b.table) || a.column.localeCompare(b.column))
  accepted.sort((a, b) => a.key.localeCompare(b.key))

  return { live, accepted, staleAcceptances, policies, columns, grants, fileCount: files.length }
}

// ── CLI ─────────────────────────────────────────────────────────────────────
const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))

if (invokedDirectly) {
  const colsFlag = process.argv.indexOf('--columns')
  const result = scanMigrations()

  if (colsFlag !== -1) {
    const t = (process.argv[colsFlag + 1] ?? '').toLowerCase()
    const set = result.columns.get(t)
    if (!set) {
      console.error(`unknown table: ${t}`)
      process.exit(2)
    }
    console.log([...set].sort().join('\n'))
    process.exit(0)
  }

  console.log(
    `RLS column-exposure scan: ${result.fileCount} migrations, ` +
      `${result.policies.size} live policies, ${result.columns.size} tables\n`,
  )

  if (result.live.length) {
    console.log(`UNACCEPTED EXPOSURES: ${result.live.length}\n`)
    for (const f of result.live) {
      console.log(`  ${f.table}.${f.column}  -> ${[...f.roles].join(', ')}`)
      console.log(`    why    : ${f.why}`)
      console.log(`    policy : "${f.policy}" using(${f.using || 'none'})`)
      console.log(`    origin : ${f.file}`)
      console.log('')
    }
  }

  // Always printed. A baseline that is not read is an allowlist that rots.
  if (result.accepted.length) {
    console.log(`REVIEWED BASELINE (${result.accepted.length}), printed every run on purpose:`)
    for (const f of result.accepted) console.log(`  ${f.key}: ${f.note}`)
    console.log('')
  }

  if (process.argv.includes('--report')) {
    console.log('Column privileges parsed from migrations:')
    for (const [t, byRole] of result.grants) {
      for (const [role, st] of byRole) {
        const shown = st.mode === 'columns' ? `(${[...st.cols].sort().join(', ')})` : st.mode
        console.log(`  ${t} / ${role}: ${shown}`)
      }
    }
    console.log('')
  }

  if (result.staleAcceptances.length) {
    console.log(
      `STALE BASELINE ENTRIES (${result.staleAcceptances.length}) - the exposure is gone, delete the line:`,
    )
    for (const k of result.staleAcceptances) console.log(`  ${k}`)
    console.log('')
  }

  if (result.live.length) {
    console.error(
      `FAIL: ${result.live.length} column(s) are readable by an untrusted role.\n` +
        `RLS filters rows, not columns. Fix with a column privilege:\n` +
        `  REVOKE SELECT ON public.<table> FROM anon, authenticated;\n` +
        `  GRANT SELECT (<safe columns>) ON public.<table> TO anon, authenticated;\n` +
        `A privilege sits below RLS, so no future policy can re-expose the column.\n` +
        `See docs/security/AUDIT-2026-08-08.md.`,
    )
    process.exit(1)
  }

  console.log('PASS: no untrusted role can read a sensitive column.')
}
