/**
 * ONE CONTACT DOMAIN. A build-failing guard (close-out UX2.4).
 *
 * WHY THIS EXISTS. The platform published SEVEN different public contact
 * addresses - hello, support, organisers, privacy, legal, press, careers - as
 * hand-written literals in about forty places across the legal pages, the press
 * and careers pages, checkout, the contact form, the unsubscribe pages and six
 * email builders. None of them derived from anything.
 *
 * Meanwhile `src/lib/email/sender.ts` was already the one source for the
 * SENDING identity, with its own guard. So the platform had one half of its
 * email identity enforced and the other half loose, and the two could drift
 * apart without any check noticing. That is exactly how the site came to invite
 * people to write to `@eventlinqs.com` while being served from
 * `eventlinqs.com.au`, which is the defect the close-out reported.
 *
 * WHAT IT CHECKS. No TypeScript file outside the one source may contain a
 * literal address at a contact domain. Everything derives from
 * `contactAddress()` / `contactMailto()`, which derive from `getSenderDomain()`,
 * so the address a visitor is invited to write to and the address the platform
 * sends from cannot be different domains. When the founder verifies
 * eventlinqs.com.au at Resend, the flip is one edit and this guard proves
 * nothing was left behind.
 *
 * WHAT IT DELIBERATELY DOES NOT CHECK
 *   - COMMENTS. `destinations.ts` records that hello@ was proven deliverable on
 *     2026-08-03 and that alerts@ hard-bounced. Naming an address in the
 *     sentence that explains it is the documentation working, and a guard that
 *     forbade it would delete the reason.
 *   - The static `.html` auth templates. They are reference COPIES of what is
 *     pasted into the Supabase dashboard, they cannot import a function, and
 *     they are listed below so the flip does not silently miss them.
 *
 * Run: node scripts/guards/one-contact-domain.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, extname, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { declareWork } from '../lib/work-report.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const SRC = join(ROOT, 'src')
const TAG = '[one-contact-domain]'

/** The one file allowed to name a contact domain. */
const ONE_SOURCE = 'src/lib/email/sender.ts'

/**
 * Domains the platform owns, READ FROM THE ONE SOURCES rather than typed.
 *
 * Typing them here was the first draft, and `canonical-host.mjs` refused it,
 * correctly: a guard about single sources that carries its own copy of the
 * value is the defect it exists to stop. The sending domain comes out of
 * sender.ts and the site host out of site-url.ts, so when either moves this
 * guard follows without an edit.
 */
function readLiteral(file, pattern, what) {
  let text
  try {
    text = readFileSync(join(ROOT, file), 'utf8')
  } catch (err) {
    console.error(`${TAG} FAIL - ${file} could not be read (${err.code ?? err.message}); it is where ${what} is defined.`)
    process.exit(1)
  }
  const m = pattern.exec(text)
  if (!m) {
    console.error(`${TAG} FAIL - ${file} no longer declares ${what} as a plain literal, so this guard cannot derive it.`)
    process.exit(1)
  }
  return m[1]
}

const SENDING_DOMAIN = readLiteral(
  'src/lib/email/sender.ts',
  /const DEFAULT_SENDER_DOMAIN = '([^']+)'/,
  'the sending domain',
)
const SITE_HOST = readLiteral(
  'src/lib/site-url.ts',
  /export const CANONICAL_HOST = '([^']+)'/,
  'the canonical host',
)
/** The site host without its www, so an address at the apex is caught too. */
const SITE_DOMAIN = SITE_HOST.replace(/^www\./, '')

const OWNED_DOMAINS = [...new Set([SENDING_DOMAIN, SITE_DOMAIN])]

/**
 * Files that legitimately carry a literal address and cannot derive one.
 *
 * These are HAND-MAINTAINED COPIES of the templates pasted into the Supabase
 * dashboard. They are listed here rather than ignored so that whoever flips the
 * sending domain is TOLD they exist: changing the constant in sender.ts will not
 * change what Supabase sends, and that is a footgun worth naming.
 */
const REVIEWED_STATIC = [
  {
    file: 'src/lib/email/templates/auth/confirm-signup.html',
    reason: 'a copy of the Supabase-hosted template; it cannot import, and the dashboard must be updated by hand',
  },
  {
    file: 'src/lib/email/templates/auth/email-change.html',
    reason: 'a copy of the Supabase-hosted template; the dashboard must be updated by hand',
  },
  {
    file: 'src/lib/email/templates/auth/magic-link.html',
    reason: 'a copy of the Supabase-hosted template; the dashboard must be updated by hand',
  },
  {
    file: 'src/lib/email/templates/auth/password-reset.html',
    reason: 'a copy of the Supabase-hosted template; the dashboard must be updated by hand',
  },
  {
    file: 'src/lib/email/templates/auth/reauthentication.html',
    reason: 'a copy of the Supabase-hosted template; the dashboard must be updated by hand',
  },
]
const staticHits = new Map(REVIEWED_STATIC.map(r => [r.file, 0]))

const ADDRESS = new RegExp(
  `[A-Za-z0-9._%+-]+@(?:${OWNED_DOMAINS.map(d => d.replace(/\./g, '\\.')).join('|')})\\b`,
  'g',
)

const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'build'])
const EXTS = new Set(['.ts', '.tsx', '.mjs', '.html'])

const files = []
const unreadable = []
function walk(dir) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch (err) {
    unreadable.push(`${relative(ROOT, dir)} (${err.code ?? err.message})`)
    return
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue
    const full = join(dir, name)
    let st
    try {
      st = statSync(full)
    } catch (err) {
      unreadable.push(`${relative(ROOT, full)} (${err.code ?? err.message})`)
      continue
    }
    if (st.isDirectory()) walk(full)
    else if (EXTS.has(extname(name))) files.push(full)
  }
}
walk(SRC)

/** True when this line is a comment. Documentation may name an address. */
function isComment(line) {
  const t = line.trimStart()
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')
}

const violations = []
let linesScanned = 0
let derived = 0

for (const file of files) {
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch (err) {
    unreadable.push(`${relative(ROOT, file)} (${err.code ?? err.message})`)
    continue
  }
  const rel = relative(ROOT, file).replace(/\\/g, '/')
  const lines = text.split('\n')
  linesScanned += lines.length
  if (rel === ONE_SOURCE) continue

  derived += (text.match(/contactAddress\(|contactMailto\(/g) ?? []).length

  const reviewed = staticHits.has(rel)
  for (let i = 0; i < lines.length; i++) {
    if (isComment(lines[i])) continue
    ADDRESS.lastIndex = 0
    const m = ADDRESS.exec(lines[i])
    if (!m) continue
    if (reviewed) {
      staticHits.set(rel, staticHits.get(rel) + 1)
      continue
    }
    violations.push({ file: rel, line: i + 1, value: m[0] })
  }
}

console.log(`${TAG} ${files.length} file(s) under src, ${linesScanned} line(s) scanned`)
console.log(`${TAG}   the one source: ${ONE_SOURCE}`)
console.log(`${TAG}   domains watched: ${OWNED_DOMAINS.join(', ')}`)
console.log(`${TAG}   ${derived} address(es) derived through contactAddress / contactMailto`)

const stale = []
for (const r of REVIEWED_STATIC) {
  const hits = staticHits.get(r.file)
  console.log(`${TAG}   reviewed: ${r.file} (${hits} literal) - ${r.reason}`)
  if (hits === 0) stale.push(r.file)
}
if (stale.length > 0) {
  console.log(`${TAG}   ${stale.length} reviewed file(s) carry no literal now - delete the entry: ${stale.join(', ')}`)
}

if (unreadable.length > 0) {
  console.error('')
  console.error(`${TAG} FAIL - ${unreadable.length} path(s) could not be read:`)
  for (const u of unreadable) console.error(`    ${u}`)
  console.error('  A guard that scanned less than the whole tree cannot report a pass.')
  process.exit(1)
}

if (violations.length > 0) {
  console.error('')
  console.error(`${TAG} FAIL - ${violations.length} hardcoded contact address(es):`)
  for (const v of violations) console.error(`    ${v.file}:${v.line}  ${v.value}`)
  console.error('')
  console.error('  The site is served from one domain and invited people to write to another,')
  console.error('  because the addresses on the page derived from nothing (close-out UX2.4).')
  console.error('')
  console.error(`  Use contactAddress('hello') or contactMailto('support') from ${ONE_SOURCE}.`)
  process.exit(1)
}

declareWork('one-contact-domain', {
  did: {
    'file scanned': files.length,
    'address derived through the one source': derived,
  },
  found: { 'hardcoded contact address': violations.length },
  zeroIsFine: {
    'hardcoded contact address':
      'every published contact address deriving from the sending domain is the goal state, and it is what makes the domain flip a one-line change (UX2.4)',
  },
  exitOnZero: false,
})

console.log(`${TAG} PASS - every published contact address derives from the sending domain.`)
process.exit(0)
