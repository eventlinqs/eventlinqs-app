/**
 * THE TESTS FOR THE ONE-CLICK PAIR, DRILLED RED.
 *
 * A test that has only ever been seen green proves nothing about the thing it
 * names: it may be asserting something that cannot fail. Each drill below puts
 * the product back into a real broken state, runs only the affected test file,
 * and requires the named test to FAIL. Then it restores from a byte snapshot
 * taken before the mutation and verifies the restore is byte-identical.
 *
 * WHY A BYTE SNAPSHOT AND NOT A STRING SWAP BACK. This tree has had a drill's
 * sabotage committed into it twice in two days, once by a power loss and once
 * by a process kill (see scripts/guards/no-drill-residue.mjs). A swap back is a
 * second edit that can itself be wrong or be interrupted; comparing bytes is
 * the only restore that can be checked.
 *
 * Run: node scripts/verify/lb-oneclick-test-drills.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const TESTS = {
  headers: 'tests/unit/consent/one-click-unsubscribe.test.ts',
  transport: 'tests/unit/email/one-click-headers-reach-the-provider.test.ts',
}

const DRILLS = [
  {
    name: 'the RFC 8058 value is lower-cased, which no receiver will match',
    file: 'src/lib/consent/one-click.ts',
    find: "export const LIST_UNSUBSCRIBE_POST_VALUE = 'List-Unsubscribe=One-Click'",
    replace: "export const LIST_UNSUBSCRIBE_POST_VALUE = 'List-Unsubscribe=one-click'",
    test: TESTS.headers,
    expect: 'sets List-Unsubscribe-Post to exactly the RFC 8058 value',
  },
  {
    name: 'the HTTPS rule is dropped, so a http origin composes a malformed facility',
    file: 'src/lib/consent/one-click.ts',
    find: "  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLoopback(parsed.hostname))) {",
    replace: '  if (false) {',
    test: TESTS.headers,
    expect: 'refuses a plain http origin that is not loopback',
  },
  {
    name: 'GET starts withdrawing, so a mail scanner unsubscribes the inbox owner',
    file: 'src/app/api/marketing/one-click-unsubscribe/[token]/route.ts',
    find: '  const destination = new URL(`/marketing/preferences/${encodeURIComponent(token)}`, request.url)',
    replace:
      '  await withdrawDigestByAnyToken(createAdminClient(), token, new Date().toISOString(), CAPTURE_SURFACE)\n' +
      '  const destination = new URL(`/marketing/preferences/${encodeURIComponent(token)}`, request.url)',
    test: TESTS.headers,
    expect: 'withdraws nothing when a mail scanner follows the header URI',
  },
  {
    name: 'the one-click surface stops being recorded, so the ledger cannot tell the facilities apart',
    file: 'src/app/api/marketing/one-click-unsubscribe/[token]/route.ts',
    find:
      "  const result = await withdrawDigestByAnyToken(admin, token, new Date().toISOString(), CAPTURE_SURFACE)",
    replace: '  const result = await withdrawDigestByAnyToken(admin, token, new Date().toISOString())',
    test: TESTS.headers,
    expect: 'records the one-click surface on the ledger row',
  },
  {
    name: 'the transport accepts the headers and drops them before the provider',
    file: 'src/lib/email/send.ts',
    find:
      '    ...(input.headers && Object.keys(input.headers).length > 0 ? { headers: input.headers } : {}),\n',
    replace: '',
    test: TESTS.transport,
    expect: 'carries both one-click headers on a campaign send',
  },
  {
    name: 'the limiter is keyed by the caller address instead of the token',
    file: 'src/app/api/marketing/one-click-unsubscribe/[token]/route.ts',
    find: "  const blocked = await applyRateLimit('marketing-one-click', request, token)",
    replace: "  const blocked = await applyRateLimit('marketing-one-click', request)",
    test: TESTS.headers,
    expect: 'is keyed on the token when it asks the limiter',
  },
]

function runTest(file) {
  try {
    const out = execFileSync('npx', ['vitest', 'run', file, '--reporter=verbose'], {
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

console.log('=== LB-ONECLICK: the tests, drilled red ===\n')

for (const drill of DRILLS) {
  const before = readFileSync(drill.file)
  const text = before.toString('utf8')

  if (!text.includes(drill.find)) {
    problems.push(`STALE: ${drill.name}: the anchor is no longer in ${drill.file}`)
    console.log(`  STALE         ${drill.name}`)
    continue
  }

  writeFileSync(drill.file, text.replace(drill.find, drill.replace))
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
    const after = readFileSync(drill.file)
    if (Buffer.compare(before, after) !== 0) {
      problems.push(`RESTORE FAILED for ${drill.file}. The tree is dirty and must be checked by hand.`)
    }
  }
  console.log(`  ${verdict.padEnd(18)}${drill.name}`)
}

console.log('')
console.log(`=== ${fired}/${DRILLS.length} drills fired correctly ===`)

// Green again on the restored tree, which is the other half of the proof.
for (const [label, file] of Object.entries(TESTS)) {
  const result = runTest(file)
  console.log(`  restored ${label}: ${result.ok ? 'GREEN' : 'STILL RED'}`)
  if (!result.ok) problems.push(`${file} does not pass on the restored tree`)
}

if (problems.length > 0) {
  console.error('')
  for (const p of problems) console.error(`  PROBLEM: ${p}`)
  process.exit(1)
}

console.log('\nEvery drill fired and the tree is byte-identical to where it started.')
