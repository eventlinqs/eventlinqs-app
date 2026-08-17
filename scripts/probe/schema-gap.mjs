/**
 * READ-ONLY: which columns exist on TEST that do NOT exist on production?
 *
 * This is the evidence behind "will applying the eleven pending migrations fix
 * it?". TEST has them applied and production does not, so the columns present on
 * one and absent on the other ARE the migrations' effect, observed rather than
 * inferred from reading the SQL.
 *
 * Select verbs only, on both projects. Nothing is written anywhere.
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function loadEnv(file) {
  const env = {}
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    let v = line.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    env[line.slice(0, eq).trim()] = v
  }
  return env
}

function client(env) {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

const argv = process.argv.slice(2)
const testEnv = loadEnv(argv[argv.indexOf('--test') + 1])
const prodEnv = loadEnv(argv[argv.indexOf('--prod') + 1])

const refOf = (e) => (e.NEXT_PUBLIC_SUPABASE_URL?.match(/https:\/\/([a-z0-9]+)\./) || [])[1]
console.log(`TEST       = ${refOf(testEnv)}`)
console.log(`PRODUCTION = ${refOf(prodEnv)}  (read only)`)
console.log('')

const test = client(testEnv)
const prod = client(prodEnv)

/** Columns the pending migrations are expected to add, and who reads them. */
const SUBJECTS = [
  ['events', 'external_ticket_url', '20260815000001', 'the reservation guard selects it by name'],
  ['share_links', 'destination_url', '20260808000006', 'share-links.ts writes it when minting a poster link'],
  ['share_links', 'draft_code', '20260808000006', 'share-links.ts filters on it'],
  ['kit_draft_covers', 'id', '20260812000001', 'the Launch Kit draft cover store'],
  ['organisations', 'payout_status', '20260809000001', 'the sale gate reads it; the migration widens its CHECK to allow unset'],
]

async function has(db, table, column) {
  const { error } = await db.from(table).select(column).limit(1)
  if (!error) return { exists: true }
  return { exists: false, why: error.message }
}

console.log('TABLE.COLUMN                          TEST        PRODUCTION   MIGRATION       READ BY')
console.log('-'.repeat(120))

let gaps = 0
for (const [table, column, migration, readBy] of SUBJECTS) {
  const t = await has(test, table, column)
  const p = await has(prod, table, column)
  if (t.exists && !p.exists) gaps += 1
  console.log(
    `${`${table}.${column}`.padEnd(37)} ` +
      `${(t.exists ? 'EXISTS' : 'MISSING').padEnd(11)} ` +
      `${(p.exists ? 'EXISTS' : 'MISSING').padEnd(12)} ` +
      `${migration.padEnd(15)} ${readBy}`,
  )
}

console.log('')
console.log(
  `${gaps} column(s) present on TEST and absent on production. Each one is a read that fails on ` +
    `production and succeeds on TEST, which is why every defect in this class reproduces on ` +
    `production and cannot be reproduced on TEST.`,
)
