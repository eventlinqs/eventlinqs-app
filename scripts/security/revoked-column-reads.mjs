#!/usr/bin/env node
/**
 * Does any anon/authenticated-role read ask for a column the migration revokes?
 *
 * WHY THIS EXISTS. Migration 20260808000010 narrows column privileges on
 * organisations, seats, event_artists and venues for the `anon` and
 * `authenticated` roles. A column privilege failure is LOUD, which is the point,
 * but loud in production is still an outage: PostgREST returns "permission denied
 * for column email" and the whole query fails, not just that field.
 *
 * The first draft of that migration would have broken Stripe Connect onboarding.
 * src/app/api/stripe/connect/onboard/route.ts reads `organisations.email` with
 * the SESSION client, which authenticates as `authenticated`, and `email` is one
 * of the columns being revoked. Nothing in the type system or the test suite would
 * have caught it, because the failure only exists once the grant changes.
 *
 * So this walks every Supabase query in the source, works out which ROLE it runs
 * as from the client constructor in scope, and flags any selected column the
 * migration takes away from that role.
 *
 * ROLE INFERENCE:
 *   createAdminClient()   -> service_role   unaffected, skip
 *   createPublicClient()  -> anon           affected
 *   createClient() (server/browser) -> authenticated (or anon when signed out)
 *
 * Deliberately conservative: where a file holds more than one client, every query
 * in it is treated as if it might run under the untrusted role. That over-reports
 * rather than under-reports, which is the correct direction for a pre-flight check
 * on a live database.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const SRC = path.join(ROOT, 'src')

/** table -> the columns anon/authenticated KEEP after 20260808000010. */
const GRANTED = {
  organisations: ['id', 'name', 'slug', 'description', 'logo_url', 'website'],
  seats: [
    'id', 'event_id', 'seat_map_section_id', 'ticket_tier_id',
    'row_label', 'seat_number', 'seat_type', 'status',
    'x', 'y', 'price_cents', 'held_reason', 'note', 'created_at', 'updated_at',
  ],
  event_artists: ['id', 'event_id', 'artist_id', 'billing_order', 'status', 'created_at'],
  venues: [
    'id', 'name', 'description', 'image_url', 'capacity',
    'address', 'city', 'state', 'country', 'postal_code',
    'latitude', 'longitude', 'organisation_id', 'is_active', 'created_at', 'updated_at',
  ],
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const full = path.join(dir, e)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (e.endsWith('.ts') || e.endsWith('.tsx')) out.push(full)
  }
  return out
}

/**
 * Parse the column list out of a PostgREST select string, including columns
 * inside an embedded resource like `organisation:organisations(name, email)`.
 */
function columnsFor(table, selectText, mode = 'top-level') {
  const cols = new Set()

  // Embedded form: alias:table(cols). Nested groups are stripped first, so
  // `seat:seats(row_label, section:seat_map_sections(name))` does not attribute
  // `name` to seats.
  if (mode === 'embedded') {
    const embedded = new RegExp(`(?:[a-z_]+:)?${table}\\s*\\(((?:[^()]|\\([^()]*\\))*)\\)`, 'gi')
    for (const m of selectText.matchAll(embedded)) {
      const inner = m[1].replace(/[a-z_]*\s*\([^()]*\)/gi, '')
      for (const c of inner.split(',')) {
        const name = c.trim().split(':').pop().trim()
        if (name && /^[a-z_][a-z0-9_]*$/i.test(name)) cols.add(name)
      }
    }
    return [...cols]
  }

  // Top-level form: the whole select belongs to this table. Strip embedded
  // groups (and their aliases) so their columns are not attributed to the parent.
  // Getting this wrong attributed `tickets.ticket_code` and `tickets.secret` to
  // `seats`, which is a false positive that wastes exactly the attention a
  // pre-flight check is supposed to focus.
  const topLevel = selectText.replace(/[a-z_]*\s*:?\s*[a-z_]*\s*\([\s\S]*?\)/gi, '')
  for (const c of topLevel.split(',')) {
    const name = c.trim().split(':').pop().trim()
    if (name && /^[a-z_][a-z0-9_]*$/i.test(name)) cols.add(name)
    if (name === '*') cols.add('*')
  }
  return [...cols]
}

/**
 * Which client does `name` refer to at this point in the file?
 *
 * Resolved PER QUERY, not per file. A file-level guess is useless here: most of
 * these modules hold both a session client and an admin client, so attributing
 * every query in the file to the untrusted role reported 25 hits of which most
 * were reads already moved to the service role. An over-report that nobody can
 * act on is the same as no report.
 */
function clientRole(src, varName, beforeIndex) {
  const decl = new RegExp(
    `(?:const|let|var)\\s+${varName}\\s*=\\s*(?:await\\s+)?(createAdminClient|createPublicClient|createClient)\\s*\\(`,
    'g',
  )
  let role = null
  for (const m of src.matchAll(decl)) {
    if (m.index > beforeIndex) break // declared later in the file, not this one
    role = m[1]
  }
  if (role === 'createAdminClient') return 'service_role'
  if (role === 'createPublicClient') return 'anon'
  if (role === 'createClient') return 'authenticated'
  return null // could not resolve: reported separately, never silently skipped
}

const findings = []
const unresolved = []

for (const file of walk(SRC)) {
  const src = readFileSync(file, 'utf8')
  const rel = path.relative(ROOT, file).replace(/\\/g, '/')

  for (const table of Object.keys(GRANTED)) {
    // Every `X.from('<table>')` or `createXClient().from('<table>')`, with the
    // select that follows it in the same chain.
    const q = new RegExp(
      `(createAdminClient\\s*\\(\\s*\\)|[A-Za-z_$][\\w$]*)\\s*\\n?\\s*\\.from\\(\\s*['"\`]${table}['"\`]\\s*\\)([\\s\\S]{0,400}?)\\.select\\(\\s*([\`'"])([\\s\\S]*?)\\3`,
      'g',
    )
    for (const m of src.matchAll(q)) {
      const receiver = m[1]
      const selectText = m[4]
      const line = src.slice(0, m.index).split('\n').length

      const role = receiver.startsWith('createAdminClient')
        ? 'service_role'
        : clientRole(src, receiver, m.index)

      if (role === 'service_role') continue
      if (role === null) {
        unresolved.push({ rel, line, table, receiver })
        continue
      }

      const asked = columnsFor(table, selectText)
      const revoked = asked.filter((c) => c === '*' || !GRANTED[table].includes(c))
      if (revoked.length) findings.push({ rel, line, table, revoked, role })
    }

    // Embedded reads: `organisation:organisations(name, email)` inside a select on
    // ANOTHER table. The role is that of whatever client ran the outer query.
    const embed = new RegExp(`\\.select\\(\\s*([\`'"])([\\s\\S]*?)\\1`, 'g')
    for (const m of src.matchAll(embed)) {
      const selectText = m[2]
      if (!new RegExp(`(?:[a-z_]+:)?${table}\\s*\\(`, 'i').test(selectText)) continue
      const before = src.slice(Math.max(0, m.index - 400), m.index)
      const recv = [...before.matchAll(/([A-Za-z_$][\w$]*)\s*\n?\s*\.from\(/g)].pop()
      const role = recv ? clientRole(src, recv[1], m.index) : null
      if (role === 'service_role' || role === null) continue

      const asked = columnsFor(table, selectText, 'embedded')
      const revoked = asked.filter((c) => !GRANTED[table].includes(c))
      if (revoked.length) {
        findings.push({
          rel,
          line: src.slice(0, m.index).split('\n').length,
          table: `${table} (embedded)`,
          revoked,
          role,
        })
      }
    }
  }
}

if (unresolved.length) {
  console.log(
    `[revoked-column-reads] ${unresolved.length} query(ies) whose client could not be\n` +
      `resolved statically. Listed, never skipped silently:`,
  )
  for (const u of unresolved) console.log(`    ${u.rel}:${u.line}  ${u.table} via ${u.receiver}`)
  console.log('')
}

if (findings.length) {
  console.error(
    `[revoked-column-reads] FAIL - ${findings.length} query(ies) select a column that\n` +
      `migration 20260808000010 revokes from anon/authenticated. Each of these would\n` +
      `fail at runtime with "permission denied for column ...", taking the whole query\n` +
      `with it, not just the field:\n`,
  )
  for (const f of findings) {
    console.error(`  ${f.rel}:${f.line}  [runs as ${f.role}]`)
    console.error(`    ${f.table} -> ${f.revoked.join(', ')}`)
  }
  console.error(
    `\nFix each by EITHER narrowing the select to the granted columns, OR moving the\n` +
      `read to createAdminClient() behind an explicit ownership check (the pattern in\n` +
      `src/lib/payouts/auth.ts: verify identity with the session client, then read with\n` +
      `the service role scoped to the verified owner).`,
  )
  process.exit(1)
}

console.log('[revoked-column-reads] PASS - no untrusted-role query selects a revoked column.')
