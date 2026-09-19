/**
 * THE "A FAILED READ IS NOT A FACT ABOUT A PERSON" TESTS, DRILLED RED.
 *
 * A test that has only ever been seen green proves nothing about the thing it
 * names. Each drill below puts one of the real defects back, runs the test
 * files, and requires the NAMED test to fail. Then it restores from a byte
 * snapshot taken before the mutation and verifies the restore is byte-identical.
 *
 * THE DRILLS ARE CHOSEN SO THAT EACH ONE IS A SENTENCE SOMEBODY WOULD HAVE
 * READ. Putting a discarded error back is not an abstract regression: it is
 * "unknown tenant platform" stored as the evidence for a refusal, and "This
 * link is not valid" shown to a person who pressed unsubscribe in a real
 * message.
 *
 * THE LAST TWO AIM AT THE CHUNKER, and the second of those is the one worth
 * reading: it does not remove the byte bound, it puts back the COUNT bound that
 * was there before. A hundred at a time looks careful and is a bound on the
 * wrong quantity, which is exactly why it survived from GA2 to now.
 *
 * Run: node scripts/verify/lb-readfail-test-drills.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const BEHAVIOUR_TEST = 'tests/unit/growth/a-failed-read-is-not-a-fact-about-a-person.test.ts'
const CHUNK_TEST = 'tests/unit/supabase/in-chunks.test.ts'

const RESOLVER = 'src/lib/consent/resolver.ts'
const LEDGER = 'src/lib/consent/ledger.ts'
const CHUNKER = 'src/lib/supabase/in-chunks.ts'

const DRILLS = [
  {
    name: 'the resolver goes back to calling a failed read "unknown tenant"',
    test: BEHAVIOUR_TEST,
    file: RESOLVER,
    find: `    const tenant = await readOrThrow('consent resolver tenant', () =>
      admin.from('marketing_tenants').select('id').eq('slug', tenantSlug).maybeSingle(),
    )
    if (!tenant?.id) {
      return { permitted: false, reason: \`unknown tenant \${tenantSlug}\`, decidingEventId: null }
    }`,
    replace: `    const { data: tenant } = await admin
      .from('marketing_tenants')
      .select('id')
      .eq('slug', tenantSlug)
      .maybeSingle()
    if (!tenant?.id) {
      return { permitted: false, reason: \`unknown tenant \${tenantSlug}\`, decidingEventId: null }
    }`,
    expect: 'refuses the send and names the READ',
  },
  {
    name: 'the recipient filter goes back to refusing a whole list for "unknown tenant"',
    test: BEHAVIOUR_TEST,
    file: RESOLVER,
    find: `    const tenant = await readOrThrow('consent resolver tenant', () =>
      admin.from('marketing_tenants').select('id').eq('slug', tenantSlug).maybeSingle(),
    )
    if (!tenant?.id) {
      return { permitted: [], refused: normalised.map((email) => ({ email, reason: \`unknown tenant \${tenantSlug}\` })) }
    }`,
    replace: `    const { data: tenant } = await admin
      .from('marketing_tenants')
      .select('id')
      .eq('slug', tenantSlug)
      .maybeSingle()
    if (!tenant?.id) {
      return { permitted: [], refused: normalised.map((email) => ({ email, reason: \`unknown tenant \${tenantSlug}\` })) }
    }`,
    expect: 'refuses every address on a list for the same true reason',
  },
  {
    name: "the unsubscribe page goes back to calling a person's live link invalid",
    test: BEHAVIOUR_TEST,
    file: LEDGER,
    find: `    if (error instanceof ReadFailed) throw error
    return null
  }
}`,
    replace: `    return null
  }
}`,
    expect: 'raises rather than telling a person their live unsubscribe link is not valid',
  },
  {
    name: 'a privacy request goes back to being answered with an empty history',
    test: BEHAVIOUR_TEST,
    file: LEDGER,
    find: `    if (error instanceof ReadFailed) throw error
    throw new ReadFailed('consent subject history', error)`,
    replace: `    return empty`,
    expect: 'raises rather than answering a privacy request with an empty history',
  },
  {
    name: 'the door stops asking again, so a dropped socket refuses on the first try',
    test: BEHAVIOUR_TEST,
    file: 'src/lib/supabase/build-retry.ts',
    find: '  let res = await run()\n  let attempt = 0',
    replace: '  const res = await run()\n  if (res) return res\n  let attempt = 0',
    expect: 'asks again before giving up when the fault is a dropped socket',
  },
  {
    name: 'the in-filter chunker stops bounding bytes at all',
    test: CHUNK_TEST,
    file: CHUNKER,
    find: 'const wouldOverflow = current.length > 0 && (bytes + cost > budgetBytes || current.length >= maxValues)',
    replace: 'const wouldOverflow = current.length > 0 && current.length >= maxValues',
    expect: 'never produces a chunk the server would refuse',
  },
  {
    name: 'the chunker goes back to the COUNT bound the send path shipped with',
    test: CHUNK_TEST,
    file: CHUNKER,
    find: '  const chunks: string[][] = []\n  let current: string[] = []',
    replace:
      '  const out: string[][] = []\n' +
      '  for (let i = 0; i < values.length; i += maxValues) out.push(values.slice(i, i + maxValues))\n' +
      '  if (out.length >= 0) return out\n' +
      '  const chunks: string[][] = []\n  let current: string[] = []',
    expect: 'never produces a chunk the server would refuse',
  },
  {
    name: 'the chunker counts UTF-16 units instead of the bytes that travel',
    test: CHUNK_TEST,
    file: CHUNKER,
    find: '  return new TextEncoder().encode(value).length',
    replace: '  return value.length',
    expect: 'counts a non-ASCII address by its UTF-8 bytes',
  },
]

/**
 * ANCHORS ARE WRITTEN WITH PLAIN NEWLINES AND SOME FILES IN THIS WORKING TREE
 * HOLD CRLF.
 *
 * Matching literally made the build-retry drill report STALE, which is the one
 * failure mode a drill harness must not have: a drill that never runs looks
 * exactly like a drill that passed if nobody reads the summary. This is the
 * same correction scripts/verify/guard-failure-drills.mjs made for the same
 * reason, and it is done by NORMALISING BOTH SIDES rather than by guessing
 * which ending a given file has.
 */
const asLf = (s) => s.replace(/\r\n/g, '\n')

function runTest(file) {
  try {
    const out = execFileSync('npx', ['vitest', 'run', file, '--project', 'node', '--reporter=verbose'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    })
    return { ok: true, out }
  } catch (err) {
    return { ok: false, out: `${err.stdout ?? ''}${err.stderr ?? ''}` }
  }
}

let fired = 0
const problems = []

console.log('=== LB-READFAIL: the tests, drilled red ===\n')

for (const drill of DRILLS) {
  const before = readFileSync(drill.file)
  const text = asLf(before.toString('utf8'))

  if (!text.includes(asLf(drill.find))) {
    problems.push(`STALE: ${drill.name}: the anchor is no longer in ${drill.file}`)
    console.log(`  STALE             ${drill.name}`)
    continue
  }

  // Written back as LF. The restore below is from the ORIGINAL BYTES, so the
  // file ends the run exactly as it began whichever ending it had.
  writeFileSync(drill.file, text.replace(asLf(drill.find), asLf(drill.replace)))
  let verdict
  try {
    const result = runTest(drill.test)
    if (result.ok) {
      verdict = 'DID NOT FAIL'
      problems.push(`${drill.name}: the suite stayed green with the defect in place`)
    } else if (!result.out.includes(drill.expect)) {
      verdict = 'WRONG TEST'
      problems.push(
        `${drill.name}: tests failed, but "${drill.expect}" was not among them. The drill may be ` +
          'breaking something other than the thing it names.',
      )
    } else {
      verdict = 'FAILS AS EXPECTED'
      fired += 1
    }
  } finally {
    writeFileSync(drill.file, before)
    if (Buffer.compare(before, readFileSync(drill.file)) !== 0) {
      problems.push(`RESTORE FAILED for ${drill.file}. The tree is dirty and must be checked by hand.`)
    }
  }
  console.log(`  ${verdict.padEnd(18)}${drill.name}`)
}

console.log('')
console.log(`=== ${fired}/${DRILLS.length} drills fired correctly ===`)

for (const file of [BEHAVIOUR_TEST, CHUNK_TEST]) {
  const restored = runTest(file)
  console.log(`  restored ${file}: ${restored.ok ? 'GREEN' : 'STILL RED'}`)
  if (!restored.ok) problems.push(`${file} does not pass on the restored tree`)
}

if (problems.length > 0) {
  console.error('')
  for (const p of problems) console.error(`  PROBLEM: ${p}`)
  process.exit(1)
}

console.log('\nEvery drill fired and the tree is byte-identical to where it started.')
