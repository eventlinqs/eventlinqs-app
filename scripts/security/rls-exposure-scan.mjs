#!/usr/bin/env node
/**
 * RLS exposure scanner.
 *
 * THE CLASS THIS CATCHES. Row Level Security filters ROWS, never COLUMNS. A
 * policy written as
 *
 *   CREATE POLICY "x is viewable by everyone" ON public.x FOR SELECT USING (true);
 *
 * has no TO clause, so it applies to PUBLIC, which includes the `anon` role.
 * The anon key is NEXT_PUBLIC and sits in every page's source. So that one
 * policy publishes EVERY COLUMN of every matching row to anyone with a
 * browser, including columns the application never renders.
 *
 * This already happened twice in this schema. 20260625000002 closed it on
 * `profiles` (email, full_name, phone) and its own header documents the exploit.
 * The same shape survived on other tables because nothing was watching.
 *
 * WHAT THIS SCRIPT DOES. Replays every migration in chronological order to
 * compute the FINAL policy state (honouring DROP POLICY, so a closed hole is
 * not re-reported), reconstructs each table's column list including ALTER TABLE
 * ADD COLUMN, then reports every table where a world-readable SELECT policy
 * meets a sensitive column.
 *
 * Exit 0 = no world-readable policy exposes a sensitive column.
 * Exit 1 = at least one does. This is the CI gate.
 *
 * Usage:
 *   node scripts/security/rls-exposure-scan.mjs           # gate mode
 *   node scripts/security/rls-exposure-scan.mjs --report  # full inventory
 */

import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const MIGRATIONS = path.join(ROOT, 'supabase/migrations')

/**
 * Columns whose exposure to an anonymous caller is a defect. Matched
 * case-insensitively against the column name.
 *
 * Grouped by WHY each is sensitive, because a reviewer needs to be able to
 * argue with the list rather than just trust it.
 */
const SENSITIVE = [
  // Contact details. Mass-harvestable PII, the profiles/organisations defect.
  { re: /^email$/i,                      why: 'contact email (PII, mass-harvestable)' },
  { re: /^phone$/i,                      why: 'contact phone (PII, mass-harvestable)' },
  { re: /^(full_name|holder_name)$/i,    why: 'person name (PII)' },
  { re: /^holder_email$/i,               why: 'ticket holder email (PII)' },
  { re: /_email$/i,                      why: 'email address (PII)' },
  { re: /^(address|street|postcode|post_code|dob|date_of_birth)$/i, why: 'personal detail (PII)' },
  // Bearer credentials. Reading the column IS the bypass.
  { re: /token$/i,                       why: 'bearer token (credential)' },
  { re: /^secret$/i,                     why: 'bearer secret (credential)' },
  { re: /_secret$/i,                     why: 'secret (credential)' },
  { re: /^(password|password_hash)$/i,   why: 'password material (credential)' },
  { re: /^recovery/i,                    why: 'recovery credential' },
  { re: /^(access_code|code)$/i,         why: 'access code (credential)' },
  // Payment and payout infrastructure. Not credentials, but not public either.
  { re: /^stripe_/i,                     why: 'payment/payout infrastructure identifier' },
  // Foreign keys to a person. De-anonymise who did what.
  { re: /^(user_id|owner_id|leader_user_id|held_by_user_id|created_by|updated_by)$/i,
    why: 'foreign key to a person (de-anonymising)' },
  { re: /_user_id$/i,                    why: 'foreign key to a person (de-anonymising)' },
  // Free-form blobs. Unknowable contents, so treat as sensitive by default.
  { re: /^metadata$/i,                   why: 'free-form JSONB (unknowable contents)' },
  { re: /^(internal_notes|notes|admin_notes)$/i, why: 'internal free text' },
]

function classify(column) {
  for (const s of SENSITIVE) if (s.re.test(column)) return s.why
  return null
}

/** Strip SQL comments so a commented-out policy is never counted as real. */
function stripComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
}

/**
 * Split into statements on semicolons that are not inside a quoted string or a
 * dollar-quoted block. Function bodies ($$ ... $$) are full of semicolons and
 * would shatter a naive split.
 */
function statements(sql) {
  const out = []
  let buf = ''
  let i = 0
  let quote = null // "'" | '"' | dollar tag
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

const policies = new Map() // `table::name` -> policy
const columns = new Map() // table -> Set<column>
const rlsEnabled = new Set()

function norm(t) {
  return t.replace(/"/g, '').replace(/^public\./i, '').trim().toLowerCase()
}

/** Pull column names out of a CREATE TABLE body, skipping table constraints. */
function parseTableBody(body) {
  const cols = []
  let depth = 0
  let cur = ''
  for (const ch of body) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      cols.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  if (cur.trim()) cols.push(cur)
  const out = []
  for (const raw of cols) {
    const line = raw.trim()
    if (!line) continue
    if (/^(CONSTRAINT|PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK|EXCLUDE|LIKE)\b/i.test(line)) continue
    const m = line.match(/^"?([a-z_][a-z0-9_]*)"?\s+/i)
    if (m) out.push(m[1].toLowerCase())
  }
  return out
}

const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()

for (const file of files) {
  const sql = stripComments(readFileSync(path.join(MIGRATIONS, file), 'utf8'))
  for (const stmt of statements(sql)) {
    const s = stmt.trim()
    if (!s) continue

    // CREATE TABLE
    const ct = s.match(/^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w".]+)\s*\(([\s\S]*)\)\s*$/i)
    if (ct) {
      const t = norm(ct[1])
      if (!columns.has(t)) columns.set(t, new Set())
      for (const c of parseTableBody(ct[2])) columns.get(t).add(c)
      continue
    }

    // ALTER TABLE ... ADD COLUMN
    const ac = s.match(/^ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?([\w".]+)\s+([\s\S]*)$/i)
    if (ac) {
      const t = norm(ac[1])
      const rest = ac[2]
      if (/ENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(rest)) rlsEnabled.add(t)
      for (const m of rest.matchAll(/ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-z_][a-z0-9_]*)"?/gi)) {
        if (!columns.has(t)) columns.set(t, new Set())
        columns.get(t).add(m[1].toLowerCase())
      }
      continue
    }

    // DROP POLICY
    const dp = s.match(/^DROP\s+POLICY\s+(?:IF\s+EXISTS\s+)?("[^"]+"|\S+)\s+ON\s+([\w".]+)/i)
    if (dp) {
      const name = dp[1].replace(/"/g, '')
      policies.delete(`${norm(dp[2])}::${name}`)
      continue
    }

    // CREATE POLICY
    const cp = s.match(/^CREATE\s+POLICY\s+("[^"]+"|\S+)\s+ON\s+([\w".]+)([\s\S]*)$/i)
    if (cp) {
      const name = cp[1].replace(/"/g, '')
      const table = norm(cp[2])
      const tail = cp[3]
      const permissive = !/AS\s+RESTRICTIVE/i.test(tail)
      const forM = tail.match(/FOR\s+(ALL|SELECT|INSERT|UPDATE|DELETE)/i)
      const cmd = forM ? forM[1].toUpperCase() : 'ALL'
      const toM = tail.match(/\bTO\s+([a-z_,\s"]+?)(?=\s+(?:USING|WITH)\b|$)/i)
      const roles = toM
        ? toM[1].split(',').map((r) => r.replace(/"/g, '').trim().toLowerCase()).filter(Boolean)
        : ['public']
      const usingM = tail.match(/USING\s*\(([\s\S]*?)\)\s*(?:WITH\s+CHECK|$)/i)
      const using = usingM ? usingM[1].trim() : ''
      policies.set(`${table}::${name}`, { table, name, cmd, roles, using, permissive, file })
      continue
    }
  }
}

/**
 * Does this policy publish rows to an unauthenticated caller?
 *
 * A policy reaches `anon` when it has no TO clause (defaults to PUBLIC) or
 * names anon/public explicitly. But the ROLE reaching the policy is only half
 * the question: the USING expression still has to evaluate true for that role.
 *
 * Two whole classes are NOT world-readable despite having no TO clause, and
 * conflating them with the real thing would have turned a 3-table finding into a
 * 33-table one:
 *
 *   USING (auth.role() = 'service_role')  -- anon's role is 'anon', never matches
 *   USING (user_id = auth.uid())          -- auth.uid() is NULL for anon
 *
 * So any USING that pivots on the caller's identity is excluded, UNLESS it
 * deliberately names anon, which would be a real grant to the public.
 */
function isWorldReadable(p) {
  if (!p.permissive) return false
  if (p.cmd !== 'SELECT' && p.cmd !== 'ALL') return false
  const reachesAnon = p.roles.includes('public') || p.roles.includes('anon')
  if (!reachesAnon) return false

  const identityPredicate =
    /auth\.uid\(\)|auth\.jwt\(\)|auth\.role\(\)|current_setting\s*\(\s*'request\.jwt/i.test(p.using)
  if (identityPredicate) {
    // An identity predicate that explicitly admits anon is still public.
    return /'anon'/i.test(p.using)
  }
  return true
}

const report = []
for (const p of policies.values()) {
  if (!isWorldReadable(p)) continue
  const cols = [...(columns.get(p.table) ?? [])]
  const hits = cols.map((c) => ({ column: c, why: classify(c) })).filter((h) => h.why)
  report.push({ ...p, sensitive: hits, columnCount: cols.length })
}

report.sort((a, b) => b.sensitive.length - a.sensitive.length || a.table.localeCompare(b.table))

const offenders = report.filter((r) => r.sensitive.length > 0)
const clean = report.filter((r) => r.sensitive.length === 0)
const wantReport = process.argv.includes('--report')

console.log(`RLS exposure scan: ${files.length} migrations, ${policies.size} live policies, ${columns.size} tables\n`)

if (offenders.length) {
  console.log(`WORLD-READABLE POLICIES EXPOSING SENSITIVE COLUMNS: ${offenders.length}\n`)
  for (const o of offenders) {
    console.log(`  ${o.table}  [${o.sensitive.length}/${o.columnCount} columns sensitive]`)
    console.log(`    policy : "${o.name}" FOR ${o.cmd} TO ${o.roles.join(',')}`)
    console.log(`    using  : ${o.using || '(none)'}`)
    console.log(`    origin : ${o.file}`)
    for (const h of o.sensitive) console.log(`      - ${h.column}: ${h.why}`)
    console.log('')
  }
}

if (wantReport && clean.length) {
  console.log(`WORLD-READABLE BUT NO SENSITIVE COLUMN (acceptable public data): ${clean.length}`)
  for (const c of clean) console.log(`  ${c.table} :: "${c.name}" using(${c.using || 'none'})`)
  console.log('')
}

if (offenders.length) {
  console.error(
    `FAIL: ${offenders.length} table(s) publish sensitive columns to the anon role.\n` +
      `RLS filters rows, not columns. Narrow the policy to authenticated, or expose a\n` +
      `column-restricted view and revoke table SELECT from anon. See docs/security/AUDIT-2026-08-08.md.`,
  )
  process.exit(1)
}

console.log('PASS: no world-readable policy exposes a sensitive column.')
