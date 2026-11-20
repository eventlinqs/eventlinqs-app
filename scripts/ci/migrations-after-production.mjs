// No shebang on this file: a test imports it (see the note at the top of types-drift-guard.mjs).
/**
 * A TRAIN'S MIGRATIONS SORT AFTER PRODUCTION'S NEWEST, JUDGED BEFORE ITS GATE (law 4, one defect is a class; 20 November
 * 2026, #324). The pipeline's production push applies migrations in order only, and refused #324's three, quoted:
 * "Found local migration files to be inserted before the last migration on remote database. Rerun the command with
 * --include-all flag to apply these migrations". They were written at 15:00 and another train's (16:00) reached production
 * first; nothing was applied, the red came in CI after a full gate and a push. That order rule is a gate and stays.
 *
 * This reads production's applied migration versions (one read only call of the Management API) and refuses when any
 * migration this branch adds over its base sorts at or before production's newest applied version, naming each and the
 * version it must sort after. Applies nothing, writes nothing.
 *
 * Usage: node scripts/ci/migrations-after-production.mjs [base]   (base defaults to origin/main)
 * Env: SUPABASE_ACCESS_TOKEN (scripts\ops\with-supabase-token.ps1 supplies it and never prints it).
 */
import { execFileSync } from 'node:child_process'
import { basename } from 'node:path'
import { pathToFileURL } from 'node:url'

import { gitEnv } from '../lib/git-env.mjs'

export const PRODUCTION_REF = 'gndnldyfudbytbboxesk'
const MIGRATIONS_DIR = 'supabase/migrations'

/** The version a migration file carries: its leading digits, or null. */
export function versionOf(file) {
  return (basename(file).match(/^(\d+)_/) || [])[1] ?? null
}

/**
 * The decision, pure: every train migration whose version does not sort after production's newest applied version
 * (versions are compared as numbers of equal length, the way Supabase orders them), and that newest version.
 * A train migration production already holds is not this train's to judge and is left out.
 * @returns {{ newest: string | null, behind: { file: string, version: string | null }[] }}
 */
export function migrationsBehindProduction(trainFiles, appliedVersions) {
  const applied = new Set(appliedVersions.map(String))
  const newest = [...applied].sort((a, b) => (a.length - b.length) || a.localeCompare(b)).at(-1) ?? null
  const behind = trainFiles
    .map((file) => ({ file, version: versionOf(file) }))
    .filter((m) => m.version === null || (!applied.has(m.version) && newest !== null && (m.version.length < newest.length || (m.version.length === newest.length && m.version <= newest))))
  return { newest, behind }
}

const say = (s) => console.log(`[migrations-after-production] ${s}`)

async function main() {
  const base = process.argv[2] || 'origin/main'
  const train = execFileSync('git', ['diff', '--name-only', '--diff-filter=d', `${base}...HEAD`, '--', MIGRATIONS_DIR], { encoding: 'utf8', env: gitEnv() })
    .split(/\r?\n/)
    .filter((f) => f.endsWith('.sql'))
  if (train.length === 0) {
    say(`OK: this branch adds no migration over ${base}.`)
    return 0
  }
  const token = process.env.SUPABASE_ACCESS_TOKEN
  if (!token) {
    say("REFUSED: SUPABASE_ACCESS_TOKEN is not set; production's applied migrations cannot be read.")
    return 2
  }
  const res = await fetch(`https://api.supabase.com/v1/projects/${PRODUCTION_REF}/database/migrations`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    say(`REFUSED: production's applied migrations could not be read (HTTP ${res.status}).`)
    return 2
  }
  const applied = ((await res.json()) ?? []).map((m) => String(m.version))
  const { newest, behind } = migrationsBehindProduction(train, applied)
  if (behind.length === 0) {
    say(`OK: every one of this branch's ${train.length} migration(s) sorts after production's newest applied version (${newest}).`)
    return 0
  }
  say(`FAIL: ${behind.length} of this branch's migrations sort at or before production's newest applied version (${newest}); production's push applies in order only and will refuse them. Give each a version after ${newest}:`)
  for (const m of behind) say(`  ${m.file}`)
  return 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      say(`FAIL: ${err instanceof Error ? err.message : String(err)}`)
      process.exit(1)
    },
  )
}
