/**
 * GUARD: A MIGRATION THAT CREATES A PUBLIC TABLE GRANTS IT, EXACTLY.
 *
 * WHY THIS EXISTS. From 30 October 2026 Supabase stops granting new tables in
 * the public schema to anon, authenticated and service_role: "New tables in the
 * public schema will no longer be exposed to the Data API automatically"
 * (https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically,
 * read 21 October 2026). Supabase's notice to hello@eventlinqs.com of
 * 20 October adds that supabase-js then answers "permission denied", including
 * on db reset and preview branches; that page does not mention those two, so
 * the notice is the source for them. Every table in this repository was written
 * against the old default, which granted everything to all three roles, so a
 * migration with no grant worked on every database that existed and fails on
 * the first one created after the change. Nothing about the file changes on
 * the day it stops working.
 *
 * LAWAL'S RULE, 21 October 2026: "every migration that creates a table in
 * public also grants it in the same migration, to exactly the roles its row
 * security policies serve (anon only where a signed out visitor must read it,
 * authenticated where a signed in user does, service_role for server jobs),
 * never wider than the policies."
 *
 * WHAT IT REFUSES, for every `create table` in public in a judged migration:
 *
 *   NO GRANT        the same file grants the table to nobody.
 *   NOT REVOKED     no `revoke all ... from anon, authenticated, service_role`
 *                   before its first grant. Until 30 October an existing
 *                   project still applies the old default, so a grant with no
 *                   revoke leaves anon and authenticated holding everything:
 *                   exact on a fresh database, wide on production.
 *   WIDER           anon or authenticated granted ALL, TRUNCATE, REFERENCES
 *                   or TRIGGER, or any privilege granted to PUBLIC, or a grant
 *                   on every table in the schema at once.
 *   NOT SERVED      anon or authenticated granted a privilege no permissive
 *                   policy on the table serves for that role (a policy with no
 *                   role list, or one naming public, serves every role).
 *   NOT GRANTED     a policy that names anon or authenticated for a command,
 *                   and that role holds no privilege for it, so the policy can
 *                   never let anyone in once the default is gone.
 *   NO RLS          anon or authenticated granted anything on a table whose
 *                   row level security is not enabled in the same file.
 *
 * service_role bypasses row security, so it needs no policy; what it is
 * granted is judged by the migration's own reasons, which this cannot read.
 *
 * WHICH MIGRATIONS ARE JUDGED. Every file EXCEPT the 153 that were on main when
 * the rule was made, listed in lib/migrations-before-the-grant-rule.json. A
 * list rather than a date, because a migration written later can carry an
 * earlier timestamp (a branch held for weeks), and the rule binds what is
 * written from now on, not what is dated from now on. Those 153 are THE KNOWN
 * GAP and are counted on every run: a database rebuilt from them after
 * 30 October reaches none of their tables through the Data API until a
 * migration writes their grants down. Existing projects keep their grants
 * ("Existing tables are not affected in your project"), so production is not
 * touched by the gap; a fresh reset or a preview branch is.
 *
 * WHAT IT CANNOT SEE, said plainly. It reads SQL text, statement by statement,
 * with comments and quoted strings set aside. A table created by dynamic SQL
 * inside a DO block or a function is not seen, and the count of such
 * statements is printed so the blind spot stays visible. It does not judge a
 * policy's USING expression, only which roles and commands it serves.
 *
 * The proof that a migration's grants WORK, rather than merely exist, is
 * scripts/verify/replay-under-new-default.mjs: it applies Supabase's own
 * opt-in on TEST inside one transaction and replays the migration under it.
 *
 * Drilled red and green in scripts/verify/guard-failure-drills.mjs.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { declareWork } from '../lib/work-report.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const DIR = join(ROOT, 'supabase', 'migrations')
const HISTORY_FILE = join(HERE, 'lib', 'migrations-before-the-grant-rule.json')
const TAG = '[public-tables-carry-their-grants]'
/** How many files the history list holds. A name added to it must change this too. */
export const HISTORY_COUNT = 153

const DATA_API_ROLES = ['anon', 'authenticated']
const ALL_ROLES = ['anon', 'authenticated', 'service_role']
/** Privileges anon and authenticated may hold, each served by the policy command of the same name. */
const SERVABLE = ['select', 'insert', 'update', 'delete']

/**
 * The statements of a SQL file, top level only, with comments removed and
 * quoted text kept whole (so a semicolon inside a function body or a string
 * never splits a statement).
 */
export function statementsOf(sql) {
  const out = []
  let cur = ''
  let i = 0
  while (i < sql.length) {
    const two = sql.slice(i, i + 2)
    if (two === '--') {
      const end = sql.indexOf('\n', i)
      i = end === -1 ? sql.length : end
      continue
    }
    if (two === '/*') {
      const end = sql.indexOf('*/', i + 2)
      i = end === -1 ? sql.length : end + 2
      cur += ' '
      continue
    }
    const ch = sql[i]
    if (ch === "'" || ch === '"') {
      let j = i + 1
      while (j < sql.length) {
        if (sql[j] === ch && sql[j + 1] === ch) {
          j += 2
          continue
        }
        if (sql[j] === ch) break
        j += 1
      }
      cur += sql.slice(i, j + 1)
      i = j + 1
      continue
    }
    if (ch === '$') {
      // A dollar-quote tag is empty or an identifier, which may carry digits
      // after its first character ($a1$ is valid). $1, a parameter, is not one.
      const tag = sql.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)
      if (tag) {
        const end = sql.indexOf(tag[0], i + tag[0].length)
        const stop = end === -1 ? sql.length : end + tag[0].length
        cur += sql.slice(i, stop)
        i = stop
        continue
      }
    }
    if (ch === ';') {
      if (cur.trim()) out.push(cur.trim())
      cur = ''
      i += 1
      continue
    }
    cur += ch
    i += 1
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

/** "public"."x", public.x or x (a migration runs with public first on its path) to x, or null for another schema. */
function publicName(raw) {
  const parts = raw.replace(/"/g, '').split('.')
  if (parts.length === 1) return parts[0].toLowerCase()
  return parts[0].toLowerCase() === 'public' ? parts[1].toLowerCase() : null
}

function splitTopLevel(list) {
  const out = []
  let depth = 0
  let cur = ''
  for (const ch of list) {
    if (ch === '(') depth += 1
    if (ch === ')') depth -= 1
    if (ch === ',' && depth === 0) {
      out.push(cur.trim())
      cur = ''
      continue
    }
    cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

/** "select (a, b), insert" to ['select', 'insert']; "all privileges" to ['all']. */
function privilegesOf(list) {
  return splitTopLevel(list).map((p) => p.replace(/\(.*\)/s, '').trim().toLowerCase().replace(/^all\s+privileges$/, 'all'))
}

function rolesOf(list) {
  return splitTopLevel(list).map((r) => r.replace(/"/g, '').trim().toLowerCase())
}

/**
 * What one migration does to its public tables, and what is wrong with it.
 * @returns {{tables: string[], problems: string[], dynamic: number}}
 */
export function judgeMigration(sql) {
  const created = []
  const grants = []
  const revokes = []
  const policies = []
  const rls = new Set()
  const problems = []
  let dynamic = 0

  statementsOf(sql).forEach((stmt, index) => {
    const s = stmt.replace(/\s+/g, ' ')
    let m
    if ((m = s.match(/^create (?:(?:global|local) )?(temp|temporary|unlogged )?\s*table (?:if not exists )?((?:"[^"]+"|[\w]+)(?:\.(?:"[^"]+"|[\w]+))?)/i))) {
      if (m[1] && /temp/i.test(m[1])) return
      const name = publicName(m[2])
      if (name) created.push({ name, index })
      return
    }
    if (/^(do\b|create (or replace )?function|create (or replace )?procedure)/i.test(s)) {
      if (/\bcreate\s+(?:unlogged\s+)?table\b/i.test(stmt)) dynamic += 1
      return
    }
    if ((m = s.match(/^grant (.+?) on (all tables in schema \S+|(?:table )?.+?) to (.+?)(?: with grant option)?$/i))) {
      const target = m[2].trim()
      if (/^(function|procedure|routine|sequence|all sequences|all functions|schema|type|domain|foreign|large object|database|tablespace|language)\b/i.test(target)) return
      const roles = rolesOf(m[3])
      if (/^all tables in schema/i.test(target)) {
        if (roles.some((r) => r === 'public' || DATA_API_ROLES.includes(r))) {
          problems.push(`WIDER: "${s.slice(0, 120)}" grants every table in the schema at once to ${roles.join(', ')}`)
        }
        return
      }
      for (const raw of splitTopLevel(target.replace(/^table /i, ''))) {
        const name = publicName(raw)
        if (name) grants.push({ name, privs: privilegesOf(m[1]), roles, index })
      }
      return
    }
    if ((m = s.match(/^revoke (?:grant option for )?(.+?) on (?:table )?(.+?) from (.+?)(?: cascade| restrict)?$/i))) {
      if (/^(function|procedure|routine|sequence|all |schema|type)/i.test(m[2].trim())) return
      for (const raw of splitTopLevel(m[2])) {
        const name = publicName(raw)
        if (name) revokes.push({ name, privs: privilegesOf(m[1]), roles: rolesOf(m[3]), index })
      }
      return
    }
    if ((m = s.match(/^create policy (?:"(?:[^"]|"")*"|[\w]+) on ((?:"[^"]+"|[\w]+)(?:\.(?:"[^"]+"|[\w]+))?)(.*)$/i))) {
      const name = publicName(m[1])
      if (!name) return
      const head = m[2].split(/\b(?:using|with check)\b/i)[0]
      const restrictive = /\bas restrictive\b/i.test(head)
      const command = (head.match(/\bfor (all|select|insert|update|delete)\b/i)?.[1] ?? 'all').toLowerCase()
      const to = head.match(/\bto (.+)$/i)
      const roles = to ? rolesOf(to[1]) : ['public']
      policies.push({ name, command, roles, restrictive })
      return
    }
    if ((m = s.match(/^alter table (?:if exists )?(?:only )?((?:"[^"]+"|[\w]+)(?:\.(?:"[^"]+"|[\w]+))?) enable row level security/i))) {
      const name = publicName(m[1])
      if (name) rls.add(name)
    }
  })

  for (const { name, index: createdAt } of created) {
    const mine = grants.filter((g) => g.name === name)
    if (mine.length === 0) {
      problems.push(`NO GRANT: public.${name} is created and granted to nobody, so after 30 October 2026 no role reaches it through the Data API`)
      continue
    }
    const firstGrant = Math.min(...mine.map((g) => g.index))
    const revokedFirst = revokes.some(
      (r) => r.name === name && r.index > createdAt && r.index < firstGrant && r.privs.includes('all') && ALL_ROLES.every((role) => r.roles.includes(role)),
    )
    if (!revokedFirst) {
      problems.push(`NOT REVOKED: public.${name} is granted without "revoke all on public.${name} from anon, authenticated, service_role" before its first grant, so a database still on the old default keeps every privilege for all three roles`)
    }

    const held = new Map(ALL_ROLES.concat('public').map((r) => [r, new Set()]))
    for (const g of mine) for (const r of g.roles) for (const p of g.privs) held.get(r)?.add(p)

    if (held.get('public').size > 0) problems.push(`WIDER: public.${name} grants ${[...held.get('public')].join(', ').toUpperCase()} to PUBLIC, which is every role`)
    for (const role of DATA_API_ROLES) {
      const privs = held.get(role)
      if (privs.size === 0) continue
      const wide = [...privs].filter((p) => !SERVABLE.includes(p))
      if (wide.length) problems.push(`WIDER: public.${name} grants ${wide.join(', ').toUpperCase()} to ${role}, which no policy can serve`)
      if (!rls.has(name)) problems.push(`NO RLS: public.${name} is granted to ${role} and its row level security is not enabled in this migration`)
      for (const p of privs) {
        if (!SERVABLE.includes(p)) continue
        const served = policies.some(
          (pol) => pol.name === name && !pol.restrictive && (pol.command === p || pol.command === 'all') && (pol.roles.includes(role) || pol.roles.includes('public')),
        )
        if (!served) problems.push(`NOT SERVED: public.${name} grants ${p.toUpperCase()} to ${role} and no permissive policy in this migration serves ${role} for ${p.toUpperCase()}`)
      }
    }
    for (const pol of policies.filter((x) => x.name === name && !x.restrictive)) {
      for (const role of pol.roles.filter((r) => DATA_API_ROLES.includes(r))) {
        const needs = pol.command === 'all' ? SERVABLE : [pol.command]
        if (!needs.some((p) => held.get(role).has(p) || held.get(role).has('all'))) {
          problems.push(`NOT GRANTED: a ${pol.command.toUpperCase()} policy on public.${name} serves ${role}, and ${role} holds no ${needs.join(' or ').toUpperCase()} on it, so the policy can never let anyone in`)
        }
      }
    }
  }
  return { tables: created.map((c) => c.name), problems, dynamic }
}

function main() {
  if (!existsSync(DIR)) {
    console.error(`${TAG} FAIL: ${DIR} does not exist. supabase/ is not excluded by .vercelignore, so a missing folder is a deletion, not a strip.`)
    process.exit(1)
  }
  const history = JSON.parse(readFileSync(HISTORY_FILE, 'utf8'))
  const failures = []
  if (history.versions.length !== HISTORY_COUNT || history.count !== HISTORY_COUNT) {
    failures.push(
      `the history list holds ${history.versions.length} version(s) and says ${history.count}; this guard says ${HISTORY_COUNT}. A migration written after the rule obeys it and is never added to the list.`,
    )
  }
  // The list holds versions, the timestamp before the first underscore: five
  // of the names spell a word the build bans everywhere.
  const versionOf = (f) => f.split('_')[0]
  const historySet = new Set(history.versions)
  const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()
  const present = new Set(files.map(versionOf))
  const missingHistory = history.versions.filter((v) => !present.has(v))
  for (const v of missingHistory) failures.push(`the history list names version ${v}, which is no longer in supabase/migrations (renamed or deleted): the list is stale`)

  let judgedFiles = 0
  let judgedTables = 0
  let gapTables = 0
  let historyTables = 0
  let dynamic = 0
  for (const f of files) {
    const result = judgeMigration(readFileSync(join(DIR, f), 'utf8'))
    dynamic += result.dynamic
    if (historySet.has(versionOf(f))) {
      historyTables += result.tables.length
      gapTables += result.problems.filter((p) => p.startsWith('NO GRANT')).length
      continue
    }
    judgedFiles += 1
    judgedTables += result.tables.length
    for (const p of result.problems) failures.push(`${f}: ${p}`)
  }

  console.log(`${TAG} read ${files.length} migration file(s): ${judgedFiles} judged, ${files.length - judgedFiles} history`)
  console.log(
    `${TAG} THE KNOWN GAP: ${gapTables} of the ${historyTables} public table(s) created by the ${historySet.size} history migrations carry no grant of their own, written against the old default. Existing projects keep their grants; a database rebuilt from these files after 30 October 2026 reaches none of them through the Data API until a migration writes their grants down.`,
  )
  if (dynamic > 0) console.log(`${TAG} NOT SEEN: ${dynamic} DO block(s) or function(s) contain a create table this guard cannot read`)

  declareWork('public-tables-carry-their-grants', {
    did: { 'migration file read': files.length, 'migration judged': judgedFiles, 'public table judged': judgedTables },
    found: { 'violation': failures.length, 'history table with no grant of its own': gapTables },
    exitOnZero: false,
  })

  if (failures.length > 0) {
    console.error(`${TAG} FAIL: ${failures.length} problem(s). Grant every new public table in the migration that creates it, to exactly the roles its policies serve (Lawal, 21 October 2026).`)
    for (const f of failures) console.error(`${TAG}   ${f}`)
    process.exit(1)
  }
  console.log(`${TAG} PASS - every public table created since the rule is granted in its own migration, exactly.`)
  process.exit(0)
}

if (process.argv[1] && process.argv[1].endsWith('public-tables-carry-their-grants.mjs')) main()
