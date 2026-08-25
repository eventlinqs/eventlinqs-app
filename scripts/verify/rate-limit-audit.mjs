/**
 * RATE LIMIT AUDIT: what is protected, what is not, and what must be configured in
 * production for any of it to be real.
 *
 * WHY AN AUDIT RATHER THAN A TEST. The throttle depends on an external service.
 * `.env.test` carries no Upstash credentials, so every limiter on TEST takes its
 * unconfigured branch and a behavioural test would measure the fallback rather than
 * the limit. What CAN be established without Upstash is the thing that actually
 * matters: for each protected surface, whether a missing Upstash means REFUSE
 * (failClosed) or ALLOW, and whether the surface is wired to a limiter at all.
 *
 * The dangerous state is not "the limit is too high". It is a surface that costs
 * real money or sends real email and is either unwired, or wired to a policy that
 * quietly allows everything when the service is absent. Both are invisible in
 * normal operation.
 *
 * It reads the policy table and the call sites out of the source, so it cannot
 * drift from what ships, and it names the surfaces the founder asked about
 * explicitly rather than only summarising.
 *
 * Read-only: no database, no network, no writes.
 * USAGE: node scripts/verify/rate-limit-audit.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const POLICIES = join(ROOT, 'src', 'lib', 'rate-limit', 'policies.ts')
const SRC = join(ROOT, 'src')

const hr = t => console.log(`\n${'='.repeat(78)}\n${t}\n${'='.repeat(78)}`)
const scanned = []

// ---- 1. the policy table --------------------------------------------------
const src = readFileSync(POLICIES, 'utf8')
const policies = new Map()
// Each entry looks like:  'auth-login': { limit: 10, windowSeconds: 60, failClosed: true, ... }
const re = /'([a-z0-9-]+)'\s*:\s*\{([\s\S]*?)\n\s{2}\}/g
let m
while ((m = re.exec(src)) !== null) {
  const [, name, body] = m
  policies.set(name, {
    limit: /limit:\s*(\d+)/.exec(body)?.[1] ?? '?',
    window: /windowSec(?:onds)?:\s*(\d+)/.exec(body)?.[1] ?? '?',
    failClosed: /failClosed:\s*true/.test(body),
    rationale: (/rationale:\s*\n?\s*'([\s\S]*?)',\s*$/m.exec(body)?.[1] ?? body).replace(/\s+/g, ' '),
  })
}
scanned.push(`${policies.size} policies parsed from src/lib/rate-limit/policies.ts`)

// ---- 2. the call sites ----------------------------------------------------
function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p)
  }
  return out
}
const files = existsSync(SRC) ? walk(SRC) : []
const callSites = new Map()
for (const f of files) {
  // The policies module DEFINES the buckets; it is not a caller.
  const norm = f.split(String.fromCharCode(92)).join('/')
  if (norm.endsWith('src/lib/rate-limit/policies.ts')) continue
  const text = readFileSync(f, 'utf8')
  /*
   * TWO CALL SHAPES, and missing either one produces a false "never called".
   *
   *   applyRateLimit('bucket') / actionRateLimit('bucket')   the helpers
   *   POLICIES['bucket']                                     a direct lookup, then
   *                                                          checkRateLimit(...)
   *
   * This audit was wrong twice for exactly this reason, and both errors would have
   * been reported to the founder as findings. Version one knew three helper names
   * and missed `actionRateLimit`, so it called checkout-reserve and auth-login
   * unprotected when both are wired and fail closed. Version two still missed the
   * POLICIES[...] shape, so it called media-upload (4 real call sites) and
   * newsletter-subscribe (1) dead. A live limiter reported dead is the most
   * expensive kind of wrong here, because the response is to "wire" something that
   * is already wired.
   */
  const shapes = [
    /(?:applyRateLimit|actionRateLimit|rateLimitAction|rateLimitWithHeaders)\s*\(\s*'([a-z0-9-]+)'/g,
    /POLICIES\s*\[\s*'([a-z0-9-]+)'\s*\]/g,
  ]
  for (const cr of shapes) {
    cr.lastIndex = 0
    let c
    while ((c = cr.exec(text)) !== null) {
      const rel = relative(ROOT, f).split(String.fromCharCode(92)).join('/')
      if (!callSites.has(c[1])) callSites.set(c[1], new Set())
      callSites.get(c[1]).add(rel)
    }
  }
}
scanned.push(`${files.length} TypeScript files scanned for limiter call sites`)

// ---- 3. the surfaces the founder named -----------------------------------
const NAMED = [
  { surface: 'Checkout (reserve a seat)', buckets: ['checkout-reserve'], why: 'inventory and money' },
  { surface: 'Signup', buckets: ['auth-signup'], why: 'free account creation, and it sends email' },
  { surface: 'Login', buckets: ['auth-login'], why: 'credential stuffing' },
  { surface: 'Password reset', buckets: ['auth-recover'], why: 'sends email to an address the attacker chooses' },
  { surface: 'Magic link / verification resend', buckets: ['auth-magic-link', 'auth-resend-verification'], why: 'email amplification' },
  { surface: 'AI endpoints', buckets: ['ai-chat', 'ai-chat-daily'], why: 'COSTS REAL MONEY per request' },
  // NOT an AI spend path, despite the name and its position beside ai-chat. The
  // compose engine is DETERMINISTIC and spends no model tokens (founder ruling
  // 9 Aug 2026; src/app/launch/actions.ts:28 and src/lib/launch/compose.ts). Its
  // fail-OPEN is a documented decision, not an oversight: "a Redis blip must never
  // stop a stranger building a kit, because there is no spend to protect". An
  // earlier version of this audit labelled it an AI bill and it was wrong.
  { surface: 'Launch Kit composer (deterministic, no model tokens)', buckets: ['launch-compose', 'launch-compose-daily'], why: 'database writes and render CPU, NOT an API bill' },
  { surface: 'Event creation', buckets: ['event-create'], why: 'organiser-authenticated write' },
  { surface: 'Media upload', buckets: ['media-upload', 'launch-upload'], why: 'storage cost, user bytes to a decoder' },
  { surface: 'Outbound email (Launch Kit)', buckets: ['launch-email'], why: 'sends real email' },
]

hr('1. THE SURFACES YOU ASKED ABOUT')
console.log(`  ${'surface'.padEnd(34)} ${'limit'.padStart(12)}  ${'no Upstash'.padEnd(10)} verdict`)
console.log(`  ${'-'.repeat(34)} ${'-'.repeat(12)}  ${'-'.repeat(10)} ${'-'.repeat(28)}`)
const problems = []
for (const n of NAMED) {
  if (n.buckets.length === 0) {
    console.log(`  ${n.surface.padEnd(34)} ${'NONE'.padStart(12)}  ${'ALLOWS'.padEnd(10)} NOT RATE LIMITED`)
    problems.push(`${n.surface}: no limiter at all (${n.why})`)
    continue
  }
  for (const b of n.buckets) {
    const p = policies.get(b)
    if (!p) {
      console.log(`  ${n.surface.padEnd(34)} ${'MISSING'.padStart(12)}  ${'?'.padEnd(10)} POLICY NOT FOUND (${b})`)
      problems.push(`${n.surface}: policy '${b}' does not exist`)
      continue
    }
    const wired = callSites.has(b)
    const limit = `${p.limit}/${p.window}s`
    const onAbsent = p.failClosed ? 'REFUSES' : 'ALLOWS'
    let verdict
    if (!wired) { verdict = 'POLICY EXISTS, NEVER CALLED'; problems.push(`${n.surface}: policy '${b}' is never called`) }
    else if (!p.failClosed) { verdict = 'wired, but OPEN without Upstash'; problems.push(`${n.surface}: '${b}' is failOpen (${n.why})`) }
    else verdict = 'wired, closed without Upstash'
    console.log(`  ${`${n.surface} [${b}]`.padEnd(34).slice(0, 34)} ${limit.padStart(12)}  ${onAbsent.padEnd(10)} ${verdict}`)
  }
}

// ---- 4. every policy, and the dead ones ----------------------------------
hr('2. EVERY POLICY, WITH ITS CALL SITES')
const dead = []
const openBuckets = []
for (const [name, p] of [...policies].sort()) {
  const sites = callSites.get(name)
  if (!sites) dead.push(name)
  if (!p.failClosed) openBuckets.push(name)
  console.log(`  ${name.padEnd(28)} ${`${p.limit}/${p.window}s`.padStart(11)}  ${p.failClosed ? 'failClosed' : 'failOPEN  '}  ${sites ? `${sites.size} call site(s)` : 'NEVER CALLED'}`)
}

/* ---- 3b. WHAT EACH FAIL-OPEN POLICY ACTUALLY SPENDS ----------------------
 *
 * FOUNDER INSTRUCTION, 19 August 2026: "re-check EVERY fail-open policy against
 * what it actually costs, and report any that genuinely bill per request."
 *
 * The reason this is machine-read and not a paragraph: the last ruling on a
 * fail-open policy was made on a premise about cost that turned out to be false,
 * and the premise came from a rationale STRING in the policy table. A rationale is
 * an author's belief about the code at the moment they typed it. This section
 * ignores the rationale entirely and looks at what the call sites import and call.
 *
 * SCOPE IS THE ENCLOSING FUNCTION, NOT THE FILE, and that distinction is the whole
 * value of this section. The first version scanned the call-site FILE and its
 * imports, and it reported launch-compose as an email spend path because
 * src/app/launch/actions.ts also contains the SEND action and therefore imports
 * kit-email at the top. That is the identical mistake in the identical place: an
 * audit producing the false premise that a deterministic composer costs money per
 * request, which is what the last fail-closed ruling was made on. A file-level
 * grep cannot tell "this module can send email" from "this handler sends email".
 *
 * So: the slice between the rate-limit call's enclosing exported function and the
 * next top-level export, plus ONE hop into the modules whose identifiers that
 * slice actually calls. A spend reached deeper is NOT seen here, which is why the
 * output says "traced", never "proven absent".
 */
const SPEND_MARKERS = [
  { label: 'SENDS EMAIL (Resend, billed per message, and it is our sending domain)',
    re: /\bsendEmail\s*\(|from '@\/lib\/email\/send'|new Resend\(/ },
  { label: 'WRITES STORED BYTES (Supabase Storage, billed by stored GB and egress)',
    re: /\.storage\s*\.from\s*\([^)]*\)\s*\.\s*(?:upload|uploadToSignedUrl)\b/ },
  { label: 'SPENDS MODEL TOKENS (Anthropic, billed per token)',
    re: /@anthropic-ai\/sdk|anthropic\.messages\.|\bmessages\.create\s*\(/ },
  { label: 'DISPATCHES A SENTRY EVENT (billed against the event quota)',
    re: /Sentry\.captureException|Sentry\.captureMessage|captureException\s*\(\s*new\s+Error/ },
  { label: 'CALLS STRIPE (no per-call fee, but it is a metered API quota and it mints tokens)',
    re: /stripe\.[a-zA-Z]+\.(?:create|update|del)\b|createDashboardLoginLink|createLoginLink/ },
]

function resolveProjectModule(spec) {
  if (!spec.startsWith('@/')) return null
  const p = join(SRC, spec.slice(2))
  for (const cand of [`${p}.ts`, `${p}.tsx`, join(p, 'index.ts')]) {
    if (existsSync(cand)) return cand
  }
  return null
}

/** identifier -> the project file that exports it, from this file's imports. */
function importMap(text) {
  const map = new Map()
  for (const im of text.matchAll(/import\s+(?:type\s+)?(\{[^}]*\}|[A-Za-z_$][\w$]*)\s+from\s+'([^']+)'/g)) {
    const file = resolveProjectModule(im[2])
    if (!file) continue
    const clause = im[1]
    const names = clause.startsWith('{')
      ? clause.slice(1, -1).split(',').map(s => s.trim().split(/\s+as\s+/).pop().trim()).filter(Boolean)
      : [clause.trim()]
    for (const n of names) map.set(n, file)
  }
  return map
}

/**
 * The body of the exported function that contains `index`, taken as the slice from
 * the nearest preceding top-level export to the next one. Crude but stable, and it
 * is the difference between "this file can send email" and "this handler does".
 */
const TOP_LEVEL_EXPORT = /^export\s+(?:async\s+)?(?:function|const)\s+([A-Za-z_$][\w$]*)/gm
function enclosingExport(text, index) {
  const marks = []
  TOP_LEVEL_EXPORT.lastIndex = 0
  let e
  while ((e = TOP_LEVEL_EXPORT.exec(text)) !== null) marks.push({ at: e.index, name: e[1] })
  if (marks.length === 0) return { name: '(module scope)', body: text }
  let i = -1
  for (let k = 0; k < marks.length; k += 1) if (marks[k].at <= index) i = k
  if (i === -1) return { name: '(module scope)', body: text.slice(0, marks[0].at) }
  const end = i + 1 < marks.length ? marks[i + 1].at : text.length
  return { name: marks[i].name, body: text.slice(marks[i].at, end) }
}

const CALL_SHAPES = [
  /(?:applyRateLimit|actionRateLimit|rateLimitAction|rateLimitWithHeaders)\s*\(\s*'BUCKET'/,
  /POLICIES\s*\[\s*'BUCKET'\s*\]/,
]

hr('3b. WHAT EACH FAIL-OPEN POLICY ACTUALLY SPENDS')
console.log('  Traced from the ENCLOSING FUNCTION of each rate-limit call and one hop into')
console.log('  the modules it calls, NOT from the rationale strings and NOT from file-level')
console.log('  imports. A spend reached deeper than one hop is not visible here.')
console.log('')
const billsPerRequest = []
let unitsTraced = 0

function traceSpend(name) {
  const sites = [...(callSites.get(name) ?? [])]
  const hits = new Map()
  const handlers = []
  for (const rel of sites) {
    const abs = join(ROOT, rel)
    if (!existsSync(abs)) continue
    let text
    try { text = readFileSync(abs, 'utf8') } catch (error) {
      console.warn('[scripts/verify/rate-limit-audit:262]', error instanceof Error ? error.message : error)
    continue }

    // Every position in this file where THIS bucket is limited.
    const positions = []
    for (const shape of CALL_SHAPES) {
      const re = new RegExp(shape.source.replace('BUCKET', name), 'g')
      let mm
      while ((mm = re.exec(text)) !== null) positions.push(mm.index)
    }
    if (positions.length === 0) continue

    const imports = importMap(text)
    for (const pos of positions) {
      const fn = enclosingExport(text, pos)
      unitsTraced += 1
      handlers.push(`${rel}:${fn.name}`)

      const units = [{ where: `${rel} -> ${fn.name}()`, body: fn.body }]
      // ONE HOP: only the identifiers this function actually calls.
      const called = new Set([...fn.body.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)].map(c => c[1]))
      for (const id of called) {
        const target = imports.get(id)
        if (!target) continue
        try {
          units.push({
            where: `${rel} -> ${fn.name}() -> ${id}() in ${relative(ROOT, target).split(String.fromCharCode(92)).join('/')}`,
            body: readFileSync(target, 'utf8'),
          })
        } catch (error) {
          console.warn('[scripts/verify/rate-limit-audit:292]', error instanceof Error ? error.message : error)
    /* unreadable module: not a spend claim either way */ }
      }
      for (const u of units) {
        for (const mk of SPEND_MARKERS) {
          if (!mk.re.test(u.body)) continue
          if (!hits.has(mk.label)) hits.set(mk.label, new Set())
          hits.get(mk.label).add(u.where)
        }
      }
    }
  }
  return { hits, handlers }
}

for (const name of openBuckets) {
  const { hits, handlers } = traceSpend(name)
  if (hits.size === 0) {
    console.log(`  ${name.padEnd(24)} no metered external spend traced`)
    console.log(`  ${' '.repeat(24)} handlers: ${handlers.join(', ') || '(none resolved)'}`)
    continue
  }
  console.log(`  ${name.padEnd(24)} ${hits.size} metered spend path(s):`)
  for (const [label, where] of hits) {
    console.log(`    ${label}`)
    for (const w of where) console.log(`      ${w}`)
    billsPerRequest.push(`${name} (failOPEN) -> ${label}`)
  }
}
scanned.push(`${unitsTraced} rate-limited handler(s) traced to what they spend, function scope plus one hop`)

/*
 * THE CONTROL FOR THE TRACER ITSELF.
 *
 * "launch-compose spends nothing" is a claim of ABSENCE, and an absence reported by
 * a broken tracer looks exactly like an absence reported by a working one. It is
 * also the specific claim a founder ruling now rests on, so it does not get to be
 * taken on trust.
 *
 * launch-compose and launch-email live in the SAME FILE, src/app/launch/actions.ts.
 * One sends mail and one does not. A file-level scan, which is what this section
 * did first, calls both of them senders. So the tracer is required to separate two
 * handlers in one file, in both directions, before its silence about compose means
 * anything.
 */
const EMAIL_LABEL = SPEND_MARKERS[0].label
const composeTrace = traceSpend('launch-compose')
const emailTrace = traceSpend('launch-email')
const composeSends = composeTrace.hits.has(EMAIL_LABEL)
const emailSends = emailTrace.hits.has(EMAIL_LABEL)
console.log('')
console.log('  CONTROL: can this tracer tell two handlers in one file apart?')
console.log(`    launch-email   (same file) sends email: ${emailSends ? 'DETECTED' : 'NOT DETECTED'}   handlers: ${emailTrace.handlers.join(', ')}`)
console.log(`    launch-compose (same file) sends email: ${composeSends ? 'DETECTED' : 'NOT DETECTED'}   handlers: ${composeTrace.handlers.join(', ')}`)
if (emailSends && !composeSends) {
  console.log('    CONTROL PASSES: it detects the sender and clears the composer, in the same file,')
  console.log('    so "launch-compose spends nothing" is a measurement and not a blind spot.')
} else {
  console.log('    CONTROL FAILS: this tracer cannot separate the two, so treat every')
  console.log('    "no metered external spend traced" line above as UNKNOWN, not as clean.')
  problems.push('rate-limit spend tracer failed its own control: it cannot separate launch-email from launch-compose in one file')
}

if (billsPerRequest.length === 0) {
  console.log('\n  NONE of the fail-open policies sits in front of a metered external spend.')
} else {
  console.log(`\n  ${billsPerRequest.length} FAIL-OPEN POLICY/SPEND PAIR(S) FOR A FOUNDER RULING:`)
  for (const b of billsPerRequest) console.log(`    - ${b}`)
  console.log('')
  console.log('  These are REPORTED, not changed. A fail-open posture is a founder decision')
  console.log('  and the last one was reversed on a wrong premise about cost; the point of')
  console.log('  this section is to put the real premise in front of the next one.')
}

/* ---- 3c. WHAT EACH POLICY IS ACTUALLY KEYED BY --------------------------
 *
 * A limit is a number AND a bucket, and the bucket is where this table has been
 * wrong. `event-create` shipped on 19 August 2026 with a rationale reading "per
 * organiser per hour" and a call site of `actionRateLimit('event-create')` with no
 * identifier, which defaults to the forwarded IP. So the sentence in the table and
 * the behaviour of the code disagreed, and nothing could notice, because a
 * rationale is prose.
 *
 * Both halves matter and they fail in opposite directions. Keyed by address, the
 * named threat (one free account looping) walks away by changing address, while a
 * shared office or a carrier NAT range puts every legitimate organiser behind it
 * into one bucket. This platform has already been bitten by the CGNAT half twice,
 * on launch-artefact and launch-compose-daily.
 *
 * So the key is READ FROM THE CALL SITE and printed beside what the prose claims.
 */
/*
 * THE ARGUMENT LIST IS PARSED, NOT PATTERN-MATCHED, AND THAT IS NOT FUSSINESS.
 *
 * The first version of this check used `applyRateLimit\(\s*'BUCKET'` and reported
 * the key as the IP default whenever it matched. It therefore reported ai-chat,
 * ai-chat-daily and payouts-read as prose/code MISMATCHES. All three were fine:
 * applyRateLimit takes a THIRD argument, `identifierOverride`
 * (src/lib/rate-limit/middleware.ts:53), and the AI routes pass
 * `user?.id ?? clientIp(request)`, which is exactly what their rationale claims.
 *
 * That is this project's most expensive recurring bug shape and this audit has now
 * produced it three times: a live thing reported dead or wrong, because the check
 * knew one call shape out of two. So the arity is read by balancing parentheses
 * rather than guessed by a regex.
 */
const HELPERS_WITH_REQUEST = ['applyRateLimit', 'rateLimitWithHeaders', 'rateLimitAction']

function splitTopLevelArgs(text, openIdx) {
  let depth = 0
  const args = []
  let current = ''
  for (let i = openIdx; i < text.length; i += 1) {
    const ch = text[i]
    if (ch === '(' || ch === '[' || ch === '{') { depth += 1; if (depth === 1) continue }
    if (ch === ')' || ch === ']' || ch === '}') {
      depth -= 1
      if (depth === 0) { args.push(current.trim()); return args }
    }
    if (ch === ',' && depth === 1) { args.push(current.trim()); current = ''; continue }
    if (depth >= 1) current += ch
  }
  return null
}

function actualKeys(name) {
  const found = new Set()
  for (const rel of callSites.get(name) ?? []) {
    const abs = join(ROOT, rel)
    if (!existsSync(abs)) continue
    let text
    try { text = readFileSync(abs, 'utf8') } catch (error) {
      console.warn('[scripts/verify/rate-limit-audit:424]', error instanceof Error ? error.message : error)
    continue }

    for (const helper of ['actionRateLimit', ...HELPERS_WITH_REQUEST]) {
      const takesRequest = HELPERS_WITH_REQUEST.includes(helper)
      // The identifier is argument 2 for actionRateLimit, argument 3 for the
      // request-taking helpers.
      const identIndex = takesRequest ? 2 : 1
      const re = new RegExp(`${helper}\\s*\\(`, 'g')
      let mm
      while ((mm = re.exec(text)) !== null) {
        const open = mm.index + mm[0].length - 1
        const args = splitTopLevelArgs(text, open)
        if (!args || args[0] !== `'${name}'`) continue
        let ident = args[identIndex]
        // Resolve ONE level of local const, so `applyRateLimit('ai-chat', request,
        // identity)` reports what identity IS rather than the useless word
        // "identity". Without this the most expensive policy on the platform reads
        // as OTHER, which is a blind spot dressed as an answer.
        if (ident && /^[A-Za-z_$][\w$]*$/.test(ident)) {
          const decl = new RegExp(`const\\s+${ident}\\s*=\\s*([^\\n]+)`).exec(text)
          if (decl) ident = `${ident} = ${decl[1].trim().replace(/;$/, '')}`
        }
        found.add(ident ? ident : `IP (${helper} default)`)
      }
    }

    const direct = new RegExp(`POLICIES\\s*\\[\\s*'${name}'\\s*\\][\\s\\S]{0,400}?key:\\s*\`([^\`]+)\``, 'g')
    let dm
    while ((dm = direct.exec(text)) !== null) found.add(dm[1])
  }
  return [...found]
}
function keyKind(expr) {
  // Order matters: `user?.id ?? clientIp(request)` is BOTH, and calling it plain IP
  // is how the AI spend path came to be reported as a mismatch when it is correct.
  const hasUser = /user\??\.id|userId|session\.userId/.test(expr)
  const hasIp = /clientIp|x-forwarded-for|x-real-ip|^IP \(/i.test(expr)
  // ORG IS ITS OWN BUCKET AND HAD TO BECOME ONE. payouts-read was re-keyed to
  // `scope.org.organisationId` on 19 August 2026 and this function had no category
  // for it, so it read as OTHER, and OTHER is suppressed from the mismatch rule
  // below. The platform's newest bucket was therefore the one bucket this audit
  // could not judge: it printed a row and drew no conclusion. Checked BEFORE user,
  // because a resolver that carries a userId alongside the organisation must not
  // read as a per-user bucket: an owner of three businesses has three windows, not
  // one, and that distinction is the entire reason the re-key needed recording.
  const hasOrg = /organisationId|organizationId|\borgId\b|scope\.org\./.test(expr)
  if (hasOrg && !hasIp) return 'ORG'
  if (hasUser && hasIp) return 'USER_OR_IP'
  if (hasUser) return 'USER'
  if (hasIp) return 'IP'
  return 'OTHER'
}

hr('3c. WHAT EACH POLICY IS KEYED BY, PROSE VERSUS CODE')
console.log(`  ${'policy'.padEnd(24)} ${'code says'.padEnd(12)} ${'prose says'.padEnd(12)} key expression`)
console.log(`  ${'-'.repeat(24)} ${'-'.repeat(12)} ${'-'.repeat(12)} ${'-'.repeat(28)}`)
let keysChecked = 0
for (const [name, p] of [...policies].sort()) {
  const keys = actualKeys(name)
  if (keys.length === 0) { console.log(`  ${name.padEnd(24)} ${'UNREADABLE'.padEnd(12)} ${''.padEnd(12)} (no key expression matched)`); continue }
  keysChecked += 1
  const kinds = new Set(keys.map(keyKind))
  /*
   * REDUCE ACROSS CALL SITES BEFORE JUDGING. ai-chat has two: /api/ai/chat keys by
   * `user?.id ?? clientIp(request)` (guests fall back to address) and
   * /api/ai/magic-start keys by `user.id` (it refuses guests outright). Printing
   * that as MIXED and calling it a mismatch was this check's fourth false positive
   * in one session: both sites do exactly what the rationale says, and the
   * difference between them is that one surface allows guests.
   */
  let codeSays
  const only = k => [...kinds].every(x => k.includes(x))
  if (only(['ORG'])) codeSays = 'ORG'
  else if (only(['USER'])) codeSays = 'USER'
  else if (only(['USER', 'USER_OR_IP'])) codeSays = 'USER_OR_IP'
  else if (only(['IP'])) codeSays = 'IP'
  else if (only(['OTHER'])) codeSays = 'OTHER'
  else codeSays = `INCONSISTENT(${[...kinds].join('/')})`
  const r = p.rationale ?? ''
  const claimsOrg = /per organisation\b|keyed by organisationId/i.test(r)
  const claimsUser = /per (?:user|organiser|performer|sender|admin)\b|keyed by user|per user id/i.test(r)
  const claimsIp = /per IP|per address|per browser/i.test(r)
  /*
   * THE ORGANISATION CLAIM WINS, AND THIS IS NOT A CONVENIENCE. A rationale that
   * records its own correction QUOTES the sentence it replaced, and payouts-read's
   * does exactly that: it contains the words "per user" inside a quotation of the
   * line that was wrong. Read naively, a policy is punished for documenting its own
   * history, and the fix everybody reaches for is to delete the history. So a stated
   * organisation bucket is taken as the claim and the historical quote is left alone.
   */
  const proseSays = claimsOrg
    ? 'ORG'
    : claimsUser && claimsIp ? 'USER_OR_IP' : claimsUser ? 'USER' : claimsIp ? 'IP' : 'unstated'
  /*
   * A MISMATCH IS ONLY THE ONE THAT CHANGES THE BUCKET, stated as an allowlist of
   * agreements rather than an inequality, because the inequality kept flagging
   * correct code. "per user" implemented as user-or-IP is agreement: guests have no
   * user id and the fallback is what the prose means by "(or IP for guests)".
   */
  const AGREES = new Set([
    'USER|USER', 'IP|IP', 'USER_OR_IP|USER_OR_IP',
    'USER_OR_IP|USER',   // prose says per user, code falls back to IP for guests
    'ORG|ORG',           // prose says per organisation, code keys by the organisation id
  ])
  const mismatch =
    proseSays !== 'unstated'
    && codeSays !== 'OTHER'
    && !AGREES.has(`${codeSays}|${proseSays}`)
  console.log(`  ${name.padEnd(24)} ${codeSays.padEnd(12)} ${proseSays.padEnd(12)} ${keys.join(' | ').slice(0, 48)}${mismatch ? '   <<< MISMATCH' : ''}`)
  if (mismatch) {
    problems.push(`${name}: the rationale claims ${proseSays}-keyed, the call site is ${codeSays}-keyed`)
  }
}
scanned.push(`${keysChecked} policy key expression(s) read from the call sites and compared with the rationale`)

hr('3. WHAT THIS MEANS')
console.log(`  policies defined            ${policies.size}`)
console.log(`  policies never called       ${dead.length}${dead.length ? `: ${dead.join(', ')}` : ''}`)
console.log(`  fail OPEN without Upstash   ${openBuckets.length}: ${openBuckets.join(', ')}`)
console.log('')
console.log('  READ THE TWO CASES SEPARATELY. They are not the same and an earlier version of')
console.log('  this audit conflated them, which overstated the risk of an outage.')
console.log('')
console.log('  MISSING CONFIG (no UPSTASH_* set), from src/lib/redis/rate-limit.ts:114:')
console.log('    failClosed AND NODE_ENV === production  -> BLOCK (429)')
console.log('    anything else                           -> ALLOW (unlimited)')
console.log('  So failClosed only ever matters for a deploy with the variables absent, and')
console.log('  only in production. Locally and in tests everything allows, by design.')
console.log('')
console.log('  STORE ERROR (configured but Upstash failing), same file:')
console.log('    -> degrades to a per-instance in-memory window for EVERY policy,')
console.log('       failClosed or not. It is bounded, not unlimited.')
console.log('  An outage therefore does NOT remove the limit from a failOpen policy. That')
console.log('  matters for sizing the risk: the exposure is a MISCONFIGURED DEPLOY, not an')
console.log('  Upstash incident.')

hr('4. WHAT MUST BE CONFIGURED IN PRODUCTION')
console.log('  Two variables, and without BOTH every limiter takes its unconfigured branch:')
console.log('')
console.log('    UPSTASH_REDIS_REST_URL')
console.log('    UPSTASH_REDIS_REST_TOKEN')
console.log('')
console.log('  Both are declared in src/lib/env/manifest.mjs, so the env guards already')
console.log('  know about them; declaring is not the same as setting.')
console.log('')
console.log('  CONSEQUENCE OF LEAVING THEM UNSET IN PRODUCTION, stated concretely:')
console.log(`    - IN PRODUCTION (NODE_ENV === 'production') the ${policies.size - openBuckets.length} failClosed policies REFUSE`)
console.log('      every request. That means checkout,')
console.log('      signup, login and password reset all return 429 to everybody. The')
console.log('      platform is effectively down, loudly, which is the safe direction but')
console.log('      is NOT a state to launch in.')
console.log(`    - the ${openBuckets.length} failOpen policies become unlimited.`)
console.log('')
console.log('  So this is not "nice to have before launch". Without Upstash, production is')
console.log('  either refusing paying customers or unthrottled on the endpoints that cost')
console.log('  money. Verify AFTER setting them by confirming a limiter actually returns')
console.log('  429 on the (limit + 1)th request against the preview.')

hr('WHAT THIS AUDIT SCANNED')
scanned.forEach((s, i) => console.log(`  ${i + 1}. ${s}`))
if (problems.length) {
  hr(`FINDINGS: ${problems.length}`)
  problems.forEach((p, i) => console.log(`  ${i + 1}. ${p}`))
}
console.log('')
