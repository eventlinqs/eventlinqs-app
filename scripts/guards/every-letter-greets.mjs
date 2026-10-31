/**
 * GUARD: EVERY EMAIL TO A PERSON IS A LETTER THAT IS JUDGED.
 *
 * The CONTROLLER's 08:58 gap 3, 31 October 2026 (communication law 3): every customer- and organiser-facing email
 * opens 'Hi <first name>,' ('Hi there,' when no name is held) and closes 'Kind regards,' then 'The EventLinqs team'.
 * The inventory that day found 25 senders and none closed that way.
 *
 * THE WORDS are judged by tests/unit/email/every-letter-greets.test.ts, which renders every template with fixture
 * data through src/lib/email/letter.ts. That test renders the files named in src/lib/email/letter-senders.json.
 *
 * THIS GUARD keeps that list whole, on prebuild: it sweeps src/ for every file that sends to a person (a letter role
 * on a sendEmail call, or a self-checking transport's assertRecipientDeclared with one) and fails when such a file is
 * missing from the list, or when a listed file no longer sends to a person. So a new sender cannot reach a person
 * without its letter being rendered and judged. It reads only src/ (the .vercelignore law).
 *
 * WHAT IT CANNOT SEE: the words themselves (the test's job) and mail sent outside these two shapes; the four
 * transports are enumerated by every-message-has-a-declared-recipient.
 *
 * Drilled in scripts/verify/guard-failure-drills.mjs.
 *
 * Run: node scripts/guards/every-letter-greets.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { declareWork } from '../lib/work-report.mjs'

const ROOT = process.cwd()
const TAG = '[every-letter-greets]'
const LIST = 'src/lib/email/letter-senders.json'
const ROLE = /recipientRole: '(buyer|ticket_holder|account_holder|organiser|prospect)'/
const SELF_CHECKING = /assertRecipientDeclared\([^)]*'(buyer|ticket_holder|account_holder|organiser|prospect)'\)/
const MATRIX = 'src/lib/notifications/recipient-matrix.ts'

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(relative(ROOT, path).split('\\').join('/'))
  }
  return out
}

const files = walk(join(ROOT, 'src'), [])
const sending = files.filter((f) => {
  if (f === MATRIX) return false
  const source = readFileSync(join(ROOT, f), 'utf8')
  return ROLE.test(source) || SELF_CHECKING.test(source)
})

const list = JSON.parse(readFileSync(join(ROOT, LIST), 'utf8'))
const listed = new Set([...(list.letters ?? []), ...Object.keys(list.notLetters ?? {})])
const faults = []
for (const f of sending) {
  if (!listed.has(f)) faults.push(`${f} sends email to a person and is not in ${LIST}: add it, and render its letter in tests/unit/email/every-letter-greets.test.ts`)
}
const sendingSet = new Set(sending)
for (const f of listed) {
  if (!sendingSet.has(f)) faults.push(`${LIST} lists ${f}, which no longer sends email to a person: take it out`)
}
for (const [f, reason] of Object.entries(list.notLetters ?? {})) {
  if (!String(reason).trim()) faults.push(`${LIST} excludes ${f} with no reason`)
}

declareWork('every-letter-greets', {
  did: { 'source file read': files.length, 'sender to a person': sending.length, 'listed file': listed.size },
  found: { fault: faults.length },
})

if (faults.length > 0) {
  for (const f of faults) console.error(`${TAG} FAIL: ${f}`)
  console.error(`${TAG} ${faults.length} fault(s).`)
  process.exit(1)
}
console.log(`${TAG} PASS - ${sending.length} files send email to a person, and every one is listed for the letter test.`)
