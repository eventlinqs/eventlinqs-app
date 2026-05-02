#!/usr/bin/env node
// Drift check for src/types/database.generated.ts.
//
// Generates fresh types from the linked Supabase project, compares
// against the checked-in file, and exits non-zero on diff. Used in CI
// to fail builds when migrations land but generated types are not
// regenerated.
//
// Local usage:
//   npm run db:types:check
//
// CI exit codes:
//   0 - generated file matches the linked project
//   1 - drift detected; run `npm run db:types` and commit
//   2 - supabase CLI failed (project not linked, no creds, etc.)

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')
const checkedInPath = resolve(repoRoot, 'src/types/database.generated.ts')

if (!existsSync(checkedInPath)) {
  console.error(`[db-types-drift] missing ${checkedInPath}`)
  console.error('[db-types-drift] run `npm run db:types` to create it.')
  process.exit(1)
}

let fresh
try {
  fresh = execFileSync(
    'npx',
    ['supabase', 'gen', 'types', 'typescript', '--linked', '--schema', 'public'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], shell: process.platform === 'win32' }
  )
} catch (err) {
  console.error('[db-types-drift] supabase gen types FAILED. CLI not linked or missing creds.')
  console.error('[db-types-drift] CI environments need SUPABASE_ACCESS_TOKEN + project link.')
  process.exit(2)
}

const checkedIn = readFileSync(checkedInPath, 'utf8')

// Strip the banner from the checked-in file so we are comparing only
// the generator output. The banner is everything up to the first
// non-comment line.
const stripBanner = (s) => s.replace(/^(\/\/[^\n]*\n)+\n?/, '')
const normalisedCheckedIn = stripBanner(checkedIn).trim()
const normalisedFresh = fresh.trim()

if (normalisedCheckedIn === normalisedFresh) {
  console.log('[db-types-drift] OK - generated types match the linked project.')
  process.exit(0)
}

console.error('[db-types-drift] DRIFT DETECTED between checked-in types and the linked project.')
console.error('[db-types-drift] Run `npm run db:types` and commit the result.')

const checkedInLines = normalisedCheckedIn.split('\n')
const freshLines = normalisedFresh.split('\n')
const maxPreview = 20
let diffCount = 0
for (let i = 0; i < Math.max(checkedInLines.length, freshLines.length); i++) {
  if (checkedInLines[i] !== freshLines[i]) {
    if (diffCount < maxPreview) {
      console.error(`  L${i + 1}:`)
      console.error(`    checked-in: ${checkedInLines[i] ?? '<absent>'}`)
      console.error(`    fresh:      ${freshLines[i] ?? '<absent>'}`)
    }
    diffCount++
  }
}
if (diffCount >= maxPreview) {
  console.error(`  (${diffCount - maxPreview} more lines of drift not shown)`)
}

process.exit(1)
