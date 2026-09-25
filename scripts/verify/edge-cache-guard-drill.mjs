/*
 * Lane C, C8. Prove edge-cache-is-viewer-independent.mjs FAILS, once per clause,
 * and restore the tree exactly.
 *
 * WHY A NODE SCRIPT AND NOT A SHELL ONE-LINER. This tree is CRLF, so a
 * multi-line anchor written through a shell needs `\r?\n` and two attempts in
 * this repository's history have mangled the escaping instead. Reading the file,
 * ASSERTING THE ANCHOR MATCHED, and writing it back is the version that cannot
 * silently plant nothing and report a pass. A drill that plants nothing and sees
 * a green guard reports "the guard did not fire" when the truth is "the drill
 * did not happen", and this repository has shipped one blind guard that way
 * already.
 *
 * It restores from the bytes it read, in a finally, so an interrupted run leaves
 * no residue (scripts/guards/no-drill-residue.mjs exists for that defect).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const GUARD = 'scripts/guards/edge-cache-is-viewer-independent.mjs'

const DRILLS = [
  {
    clause: 3,
    name: 'the signed-in exclusion is dropped from a publicly cached rule',
    file: 'next.config.ts',
    find: "        source: '/events',\n        missing: [{ type: 'cookie', key: 'el-signed-in' }],",
    replace: "        source: '/events',",
    expect: 'is edge-cached publicly with no',
  },
  {
    clause: 2,
    name: 'a publicly cached page goes back to the per-viewer header',
    file: 'src/app/events/page.tsx',
    find: '      <SiteHeader staticSafe />',
    replace: '      <SiteHeader />',
    expect: 'which reads the session and renders the',
  },
  {
    clause: 1,
    name: 'a publicly cached rule names a route that does not exist',
    file: 'next.config.ts',
    find: "        source: '/events/:slug',",
    replace: "        source: '/events/:slug/renamed-away',",
    expect: 'no page route answers it under src/app',
  },
  {
    clause: 4,
    name: 'a route the indexing policy calls NEVER is given a public cache rule',
    file: 'next.config.ts',
    find: "        source: '/events',",
    replace: "        source: '/account',",
    expect: "classifies it 'never'",
  },
  {
    clause: 6,
    name: 'the 404 boundary goes back to the per-viewer header, putting an identity in every page',
    file: 'src/app/not-found.tsx',
    find: '    <PageShell staticSafe>',
    replace: '    <PageShell>',
    expect: 'renders the site chrome without',
  },
  {
    clause: 5,
    name: 'the header stops reading the session, so clause 2 would be asserting nothing',
    file: 'src/components/layout/site-header.tsx',
    find: 'const { data } = await supabase.auth.getUser()',
    replace: 'const { data } = await supabase.auth.getUserRenamed()',
    expect: 'it is protecting nothing',
  },
  /*
   * THE NEXT FOUR ARE THE /events/browse/:city RULE (close-out C8B.3).
   *
   * The first two drill clause 7, which is new and which is the only clause
   * that can fail in two different ways. The second two re-drill clauses 2 and 3
   * AGAINST THE NEW ROUTE rather than against /events, because "the guard fires
   * on some route" is not evidence that it fires on the route just added: the
   * loop could have stopped early, the source literal could be unmatchable, the
   * page could resolve to a file the guard cannot read. Proven, not reasoned.
   */
  {
    clause: 7,
    name: 'the edge is told to hold the city page longer than the page says it stays fresh',
    file: 'next.config.ts',
    find: "{ key: 'CDN-Cache-Control', value: 'public, s-maxage=120, stale-while-revalidate=300' },",
    replace: "{ key: 'CDN-Cache-Control', value: 'public, s-maxage=600, stale-while-revalidate=300' },",
    expect: 'answer the same question and disagree',
  },
  {
    clause: 7,
    name: 'the city page stops declaring how fresh it is, leaving the edge the only one that knows',
    file: 'src/app/events/browse/[city]/page.tsx',
    // Commented out rather than deleted, which also proves the clause reads the
    // comment-stripped source. Clause 5 once passed a drill by matching its own
    // documentation, and that is the failure this shape rules out.
    find: 'export const revalidate = 120',
    replace: '// export const revalidate = 120',
    expect: 'declares no `export const revalidate`',
  },
  {
    clause: 2,
    name: 'the NEW city rule: the page goes back to the per-viewer header',
    file: 'src/app/events/browse/[city]/page.tsx',
    find: '      <SiteHeader staticSafe />',
    replace: '      <SiteHeader />',
    expect: 'which reads the session and renders the',
  },
  {
    clause: 3,
    name: 'the NEW city rule: the signed-in exclusion is dropped',
    file: 'next.config.ts',
    find: "        source: '/events/browse/:city',\n        missing: [{ type: 'cookie', key: 'el-signed-in' }],",
    replace: "        source: '/events/browse/:city',",
    expect: 'is edge-cached publicly with no',
  },
]

let failures = 0
for (const drill of DRILLS) {
  const path = join(ROOT, drill.file)
  const original = readFileSync(path, 'utf8')
  try {
    // The anchor is normalised to this tree's line endings before the match, so
    // a CRLF checkout cannot make a multi-line anchor silently miss.
    const eol = original.includes('\r\n') ? '\r\n' : '\n'
    const find = drill.find.split('\n').join(eol)
    const replace = drill.replace.split('\n').join(eol)
    if (!original.includes(find)) {
      console.error(`clause ${drill.clause} NOT DRILLED: anchor not found in ${drill.file}`)
      console.error(`  anchor: ${JSON.stringify(drill.find.slice(0, 90))}`)
      failures += 1
      continue
    }
    writeFileSync(path, original.replace(find, replace))
    const run = spawnSync(process.execPath, [GUARD], { cwd: ROOT, encoding: 'utf8' })
    const output = `${run.stdout ?? ''}${run.stderr ?? ''}`
    const red = run.status !== 0
    const named = output.includes(drill.expect)
    if (red && named) {
      console.log(`clause ${drill.clause} RED as expected  ::  ${drill.name}`)
    } else {
      console.error(`clause ${drill.clause} DID NOT FIRE PROPERLY  ::  ${drill.name}`)
      console.error(`  exit ${run.status}, expected non-zero; message ${named ? 'matched' : 'DID NOT match'} ${JSON.stringify(drill.expect)}`)
      console.error(output.split('\n').slice(0, 12).join('\n'))
      failures += 1
    }
  } finally {
    writeFileSync(path, original)
  }
}

const green = spawnSync(process.execPath, [GUARD], { cwd: ROOT, encoding: 'utf8' })
console.log('')
console.log(`restored tree: guard exits ${green.status}`)
console.log((green.stdout ?? '').trim().split('\n').slice(-1)[0])
if (green.status !== 0) {
  console.error('THE TREE WAS NOT RESTORED, or the guard fails on it. Do not commit until this is green.')
  failures += 1
}

console.log('')
console.log(failures === 0 ? `ALL ${DRILLS.length} CLAUSES DRILLED RED, AND GREEN ON THE RESTORED TREE.` : `${failures} DRILL PROBLEM(S).`)
process.exitCode = failures === 0 ? 0 : 1
