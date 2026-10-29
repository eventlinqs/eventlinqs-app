/**
 * THE SOCIAL ENGINE HAS ONE WRITER, ITS REFUSALS STAY IN THE DATABASE, AND A LIKE IS NEVER COUNTED (item 11, 27 October
 * 2026; docs/SOCIAL-ENGINE.md). Ported from Bookedproof's scripts/guards/social.mjs and social-publish.mjs.
 *
 * 1. Every write to social_posts, social_drafts, social_approvals, social_postings and social_cadence_rules in src/ is
 *    in src/lib/social/store.ts. A second writer is how a rule drifts: the store is where every refusal is said in the
 *    database's own words, and where the learner writes a rule only when it changed.
 * 2. The three triggers that refuse a stray number, a post for an unlisted, ended or sold out event or inside the gap,
 *    and a post recorded without the approval of its newest words are each created by a migration and never dropped
 *    by a later one without being created again.
 * 3. Nothing under src/lib/social or src/app/admin/(authed)/social reads or shows likes, impressions, reach or follows.
 *    The foundation: "Results are credited by WI3's counted clicks and EventLinqs ticket sales; likes are never the
 *    measure."
 *
 * It reads the tree, never the database; scripts/verify/social-engine-proof.sql proves the triggers on TEST.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { readSource, sourceFiles, lineAt } from './lib/source.mjs'
import { declareWork } from '../lib/work-report.mjs'

const TAG = '[social-one-writer]'
const ROOT = process.cwd()
const MIGRATIONS = join(ROOT, 'supabase', 'migrations')
const WRITER = 'src/lib/social/store.ts'
const TABLES = [
  'social_posts',
  'social_drafts',
  'social_approvals',
  'social_postings',
  'social_cadence_rules',
  // The weekly campaign (20261028141001, the release checklist of 28 October 2026, sections B, C, J and K).
  'social_campaigns',
  'social_campaign_exclusions',
  'social_pieces',
  'social_piece_revisions',
  'social_piece_decisions',
  'social_piece_approvals',
  'social_piece_postings',
  'social_assets',
  'social_image_requests',
]
const MUTATORS = ['insert', 'update', 'upsert', 'delete']
const TRIGGERS = ['social_drafts_hold_their_facts', 'social_approvals_are_due', 'social_postings_are_approved']
const VANITY = /\b(likes?|like_count|impressions?|reach|followers?|follows)\b/i
const SOCIAL_DIRS = ['src/lib/social', 'src/app/admin/(authed)/social']

const failures = []

/* 1. One writer. */
const sources = sourceFiles(ROOT)
let writes = 0
for (const file of sources) {
  const rel = file.replace(/\\/g, '/')
  const { withStrings } = readSource(join(ROOT, file))
  for (const table of TABLES) {
    const needle = new RegExp(`from\\(['"\`]${table}['"\`]\\)`, 'g')
    let m
    while ((m = needle.exec(withStrings)) !== null) {
      const next = withStrings.indexOf('.from(', m.index + m[0].length)
      const window = withStrings.slice(m.index, next === -1 ? Math.min(m.index + 600, withStrings.length) : next)
      const verb = MUTATORS.find((v) => window.includes(`.${v}(`))
      if (verb === undefined) continue
      writes += 1
      if (rel !== WRITER) failures.push(`${rel}:${lineAt(withStrings, m.index)} calls .${verb}() on ${table}; only ${WRITER} writes the social engine's tables`)
    }
  }
}
if (writes === 0) failures.push(`no write to the social engine's tables was found at all, so ${WRITER} has moved or the guard is blind`)

/* 2. The refusals stay. */
const migrations = existsSync(MIGRATIONS) ? readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort() : []
for (const trigger of TRIGGERS) {
  let alive = false
  let seen = false
  for (const name of migrations) {
    const sql = readFileSync(join(MIGRATIONS, name), 'utf8').replace(/--[^\n]*/g, '')
    const created = new RegExp(`create\\s+trigger\\s+${trigger}\\b`, 'i').test(sql)
    const dropped = new RegExp(`drop\\s+trigger\\s+(if\\s+exists\\s+)?${trigger}\\b`, 'i').test(sql)
    if (created) {
      alive = true
      seen = true
    } else if (dropped) alive = false
  }
  if (!seen) failures.push(`no migration creates the trigger ${trigger}`)
  else if (!alive) failures.push(`a later migration drops the trigger ${trigger} and does not create it again`)
}

/* 3. Never a like. */
let read = 0
for (const file of sources) {
  const rel = file.replace(/\\/g, '/')
  if (!SOCIAL_DIRS.some((d) => rel.startsWith(`${d}/`))) continue
  read += 1
  const { code } = readSource(join(ROOT, file))
  const m = VANITY.exec(code)
  if (m) failures.push(`${rel}:${lineAt(code, m.index)} names "${m[0]}"; a post is judged by tickets, arrivals and presses out, never likes`)
}

declareWork('social-one-writer', { did: { 'source file': sources.length, 'social write': writes, 'migration': migrations.length, 'social file': read }, found: { failure: failures.length } })
if (failures.length > 0) {
  for (const f of failures) console.error(`${TAG} FAIL: ${f}`)
  process.exit(1)
}
console.log(`${TAG} PASS: ${writes} writes, all in ${WRITER}; ${TRIGGERS.length} refusing triggers kept; no like counted in ${read} files.`)
