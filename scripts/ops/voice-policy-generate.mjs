/**
 * THE VOICE POLICY, GENERATED FOR THE PRODUCTION SEND PATH (the CONTROLLER's 08:40 of 31 October 2026; window 2).
 *
 * The communication gateway (C:\dev\comms-gateway\gateway.py) reads the founder's two policy files fresh on every
 * operation. The deployed app cannot read C:\dev, so the facts it needs are read from the same files here, with the same
 * patterns as gateway.py's load_policy, and committed as src/lib/outreach/voice-policy.generated.json with the policy
 * version (the sha256 of the two files together, first 16 hex, exactly as the gateway computes it). A change to either
 * file changes the version; an approval under an older version is approved again (voice-gate.ts approvalProblems).
 *
 *   node scripts/ops/voice-policy-generate.mjs           write the JSON
 *   node scripts/ops/voice-policy-generate.mjs --check   exit 1 if the committed JSON is not what the files say now
 *
 * A file that cannot be read, or no longer states a fact, stops with POLICY_UNAVAILABLE and writes nothing.
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

const VOICE = 'C:/dev/START-16OCT/VOICE-EVENTLINQS.md'
const LAW = 'C:/dev/START-16OCT/COMMUNICATION-LAW-25OCT.md'
// The communication standard (Lawal, 17 November 2026, 21:10), the third policy file since the PM's 02:00 of 18 November
// 2026: its Part 2 rule 7 checks are read from standard.json beside the gateway, as gateway.py reads them.
const STANDARD_FILE = 'C:/dev/START-16OCT/EL-COMMS-STANDARD-LOCKED-17NOV.md'
const STANDARD = 'C:/dev/comms-gateway/standard.json'
const PERMS = 'C:/dev/comms-gateway/permissions-granted.json'
const COMPOUNDS = 'C:/dev/comms-gateway/compounds.json'
const THREADS = 'C:/dev/comms-gateway/threads.json'
const OUT = 'src/lib/outreach/voice-policy.generated.json'

function unavailable(why) {
  console.error(`POLICY_UNAVAILABLE: ${why}`)
  process.exit(3)
}

const bytes = [VOICE, LAW, STANDARD_FILE].map((f) => {
  try {
    const b = readFileSync(f)
    if (!b.toString('utf8').trim()) unavailable(`${f} is empty`)
    return b
  } catch (e) {
    return unavailable(`cannot read ${f}: ${e instanceof Error ? e.message : e}`)
  }
})
const hash = createHash('sha256')
for (const b of bytes) hash.update(b)
const [voice, law, standardText] = bytes.map((b) => b.toString('utf8'))
if (!standardText.includes('THE QUALITY GATE IS CODE')) unavailable('the communication standard no longer states its quality gate (Part 2 rule 7)')
// THE ACQUISITION SUBJECTS BY TYPE (standard.json of 18 November 2026, 12:40, on Lawal's adopted email of 12:35): the
// gateway reads acq_types[type].subjects; the platform's check takes every type's subjects, so an approved acquisition
// subject is never refused here while gateway.py passes it (19 November 2026: the stale 'on EventLinqs, at no cost to
// you' rule would have held 'Complimentary EventLinqs listing for ...').
// With needsEventDate false, only the types that name no night (acq_general, needs_event_date false): the gateway lets
// those pass the timing rule, so the platform does too, known by their subject.
const acqTypeSubjects = (types, needsEventDate = undefined) =>
  types && typeof types === 'object'
    ? Object.values(types)
        .filter((t) => needsEventDate === undefined || (t && (t.needs_event_date ?? true) === needsEventDate))
        .flatMap((t) => (t && Array.isArray(t.subjects) ? t.subjects.filter((x) => typeof x === 'string' && x.length > 0) : []))
    : []
let standard
try {
  const s = JSON.parse(readFileSync(STANDARD, 'utf8'))
  const list = (a) => Array.isArray(a) && a.length > 0 && a.every((x) => typeof x === 'string' && x.length > 0)
  if (!list(s.outreach_categories) || !list(s.offer_subjects) || !list(s.actions) || !list(s.internal_words) || !list(s.unproved_claims) || !list(s.consent_bases) || !Number.isInteger(s.min_days_ahead)) throw new Error('missing fields')
  standard = { outreachCategories: s.outreach_categories, offerSubjects: s.offer_subjects, actions: s.actions, internalWords: s.internal_words, unprovedClaims: s.unproved_claims, ...(list(s.founder_sentence) ? { founderSentence: s.founder_sentence } : {}), consentBases: s.consent_bases, minDaysAhead: s.min_days_ahead, ...(list(s.acq_first_subjects) ? { acqFirstSubjects: s.acq_first_subjects } : acqTypeSubjects(s.acq_types).length > 0 ? { acqFirstSubjects: acqTypeSubjects(s.acq_types) } : {}), ...(typeof s.acq_first_no_event_subject === 'string' && s.acq_first_no_event_subject ? { acqFirstNoEventSubject: s.acq_first_no_event_subject } : {}), ...(acqTypeSubjects(s.acq_types, false).length > 0 ? { acqFirstNoEventSubjects: acqTypeSubjects(s.acq_types, false) } : {}) }
} catch (e) {
  unavailable(`cannot read ${STANDARD}: ${e instanceof Error ? e.message : e}`)
}

const first = voice.match(/"Kind regards," then: (.+)/)
if (!first) unavailable('the voice file no longer states the first message sign off')
const reply = voice.match(/Replies sign "Kind regards, ([^"]+)"/)
if (!reply) unavailable('the voice file no longer states the reply sign off')
const marker = '5. NEVER INVITE A NO'
const noExitLine = law.includes(marker) ? law.split(marker)[1].split('\n')[0] : ''
const noExit = [...noExitLine.matchAll(/"([^"]+)"/g)].map((m) => m[1])
if (noExit.length === 0) unavailable('the communication law no longer lists the no-exit phrases')

let permissions = []
try {
  permissions = JSON.parse(readFileSync(PERMS, 'utf8')).map((p) => ({ recipient: p.recipient, topic: p.topic, given: p.given, neverAsk: p.never_ask }))
} catch (e) {
  unavailable(`cannot read ${PERMS}: ${e instanceof Error ? e.message : e}`)
}

// The dash rule (law 6) and the threads' own mailboxes, as gateway.py reads them; the four compound words it checks
// anywhere are named in gateway.py itself, so they are named here the same.
let compounds
try {
  const c = JSON.parse(readFileSync(COMPOUNDS, 'utf8'))
  if (!Array.isArray(c.must_hyphenate_before_noun) || typeof c.nouns_after !== 'string') throw new Error('missing fields')
  compounds = { mustHyphenateBeforeNoun: c.must_hyphenate_before_noun, nounsAfter: c.nouns_after, compoundWords: ['sister in law', 'brother in law', 'self employed', 'runner up'] }
} catch (e) {
  unavailable(`cannot read ${COMPOUNDS}: ${e instanceof Error ? e.message : e}`)
}
let threads = []
try {
  threads = JSON.parse(readFileSync(THREADS, 'utf8')).map((t) => ({ recipient: t.recipient, mailbox: t.mailbox, why: t.why }))
} catch (e) {
  unavailable(`cannot read ${THREADS}: ${e instanceof Error ? e.message : e}`)
}

// The mailbox Lawal's own sent mail was read from, as the voice file states it; a message by hand by email goes from it.
const mailbox = voice.match(/from ([^\s@]+@[^\s@]+\.[A-Za-z]{2,}) \(Microsoft 365\)/)
if (!mailbox) unavailable('the voice file no longer states the mailbox it was read from')

const replyText = reply[1]
const comma = replyText.indexOf(', ')
const policy = {
  _generated:
    'by scripts/ops/voice-policy-generate.mjs from C:/dev/START-16OCT/VOICE-EVENTLINQS.md, C:/dev/START-16OCT/COMMUNICATION-LAW-25OCT.md, C:/dev/START-16OCT/EL-COMMS-STANDARD-LOCKED-17NOV.md and C:/dev/comms-gateway/permissions-granted.json, compounds.json, threads.json and standard.json; never edited by hand. version is the sha256 of the three policy files together, first 16 hex, as gateway.py computes it.',
  version: hash.digest('hex').slice(0, 16),
  firstSignature: first[1].split(' / ').map((s) => s.trim()),
  replySignature: comma === -1 ? [replyText.trim()] : [replyText.slice(0, comma).trim(), replyText.slice(comma + 2).trim()],
  noExit,
  permissions,
  compounds,
  threads,
  founderMailbox: mailbox[1].toLowerCase(),
  standard,
}
const text = JSON.stringify(policy, null, 2) + '\n'

if (process.argv.includes('--check')) {
  const now = readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n')
  if (now !== text) {
    console.error(`[voice-policy] ${OUT} is not what the policy files say now (version ${policy.version}); run the generator`)
    process.exit(1)
  }
  console.log(`[voice-policy] PASS: ${OUT} matches the policy files, version ${policy.version}`)
} else {
  writeFileSync(OUT, text)
  console.log(`[voice-policy] wrote ${OUT}, version ${policy.version}`)
}
