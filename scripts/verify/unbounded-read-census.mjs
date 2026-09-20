/**
 * HOW MANY READS IN THIS TREE CAN STILL BE TRUNCATED WITHOUT ANYBODY BEING
 * TOLD, AND WHOSE THEY ARE.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS. Supabase caps a response at 1,000 rows in silence: HTTP 200,
 * `error` null, a full-looking array
 * (https://supabase.com/docs/reference/javascript/select, fetched 2026-09-19).
 * Six registered guards now hold that line over the directories they name, and
 * between them they cover a minority of the tree. The rest is not safe, it is
 * merely unjudged, and the difference matters because "unjudged" looks exactly
 * like "fine" in a guard report.
 *
 * So this counts. It is a CENSUS, not a guard: it is not registered, it never
 * fails a build, and it takes no view on whether any particular read is
 * dangerous. Its whole job is to put a number on the remainder so that number
 * can be seen to fall, and to say which lane each block belongs to so the work
 * can be handed over rather than described.
 *
 * It exists because a report claimed "212 fell to 202" on 20 September 2026
 * using a throwaway script that was then deleted, which made the claim
 * unfalsifiable by the person reading it. A number nobody else can reproduce is
 * an assertion, not a measurement.
 *
 * ---------------------------------------------------------------------------
 * IT USES THE GUARDS' OWN MACHINERY, deliberately. `selectChainsIn` walks a
 * PostgREST builder as a CHAIN rather than as a window of text, which is the
 * only way to tell two adjacent reads apart, and `boundednessOf` applies the
 * same definition of "bounded" every guard applies. A census that measured
 * something slightly different from what the guards enforce would produce a
 * number that could never reach zero.
 *
 * Usage:
 *   node scripts/verify/unbounded-read-census.mjs            summary by directory
 *   node scripts/verify/unbounded-read-census.mjs --detail   every read, with its table
 */
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { sourceFiles } from '../guards/lib/source.mjs'
import {
  selectChainsIn,
  boundednessOf,
  headOnlySelectLines,
} from '../guards/lib/supabase-select-chains.mjs'

const ROOT = resolve(import.meta.dirname, '..', '..')
const DETAIL = process.argv.includes('--detail')

/**
 * Who owns each block under the three-lane protocol, so the census hands work
 * over rather than merely listing it. A directory with no entry is unassigned,
 * which is itself worth seeing.
 */
const OWNERS = [
  [/^src\/app\/api\/webhooks/, 'lane A, money'],
  [/^src\/lib\/ledger/, 'lane A, the slot ledger'],
  [/^src\/lib\/payouts/, 'lane A, money'],
  [/^src\/lib\/payments/, 'lane A, money'],
  [/^src\/lib\/refunds/, 'lane A, money'],
  [/^src\/app\/actions\/(checkout|squads|reservations|best-available|self-seat)/, 'lane A, money'],
  [/^src\/lib\/notifications/, 'lane C, the notification router'],
  [/^src\/app\/account\/notifications/, 'lane C'],
  [/^src\/app\/\(dashboard\)/, 'lane B, organiser surfaces'],
  [/^src\/lib\/broadcast/, 'lane B, reach and attribution'],
  [/^src\/lib\/(consent|campaigner|audience|matching|attribution|proof|growth)/, 'lane B, the growth spine'],
  [/^src\/lib\/reporting/, 'lane B, the attendee exports'],
]

const ownerOf = file => OWNERS.find(([pattern]) => pattern.test(file))?.[1] ?? 'unassigned'

const files = sourceFiles(ROOT, { subdir: 'src' }).filter(f => /\.tsx?$/.test(f))
const unbounded = []

for (const file of files) {
  const absolute = resolve(ROOT, file)
  if (!existsSync(absolute)) continue
  const heads = headOnlySelectLines(absolute)
  for (const chain of selectChainsIn(absolute)) {
    if (!chain.methods.includes('select')) continue
    if (boundednessOf(chain, { headSelects: heads })) continue
    unbounded.push({ file, line: chain.line, table: chain.table, methods: chain.methods.join('.') })
  }
}

/*
 * GROUPED AT THE LEVEL A PERSON WOULD TAKE ON IN ONE SITTING: a library
 * directory, or a route group two deep. Grouping by full path produces a list
 * nobody reads; grouping by top level produces four numbers that hide
 * everything.
 */
const groupOf = file => {
  const parts = file.split('/')
  if (parts[1] === 'lib') return parts.slice(0, 3).join('/')
  if (parts[1] === 'app') return parts.slice(0, 4).join('/')
  return parts.slice(0, 3).join('/')
}

const groups = new Map()
for (const read of unbounded) {
  const key = groupOf(read.file)
  if (!groups.has(key)) groups.set(key, [])
  groups.get(key).push(read)
}

console.log(`UNBOUNDED READS IN src/: ${unbounded.length}`)
console.log(`  across ${groups.size} director(ies), out of ${files.length} TypeScript file(s) scanned\n`)
console.log('  count  directory                                        owner')
console.log('  -----  -----------------------------------------------  -----------------------------')
for (const [group, reads] of [...groups.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(
    `  ${String(reads.length).padStart(5)}  ${group.padEnd(47)}  ${ownerOf(reads[0].file)}`,
  )
  if (DETAIL) {
    for (const read of reads) {
      console.log(`         ${read.file}:${read.line}  ${read.table.padEnd(28)} .${read.methods}`)
    }
  }
}

const byOwner = new Map()
for (const read of unbounded) {
  const owner = ownerOf(read.file)
  byOwner.set(owner, (byOwner.get(owner) ?? 0) + 1)
}
console.log('\n  count  owner')
console.log('  -----  -----------------------------------------------')
for (const [owner, count] of [...byOwner.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(count).padStart(5)}  ${owner}`)
}

console.log(
  '\nThis is a census and never a gate. It does not judge whether any read is ' +
    'dangerous;\nit reports what is still unjudged, so the number can be seen to fall.',
)
