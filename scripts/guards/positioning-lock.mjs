/**
 * THE POSITIONING LOCK: no user-facing surface calls EventLinqs a ticketing
 * platform or a ticket seller.
 *
 * WHY THIS EXISTS. The owner's ruling of 7 September 2026 sets the category:
 * "EventLinqs is NOT a ticketing platform. It is the platform where events get
 * made. Ticketing is one module. Never describe the platform as a ticketing
 * platform, in copy, in metadata, in social cards, in emails, or in the About
 * page." It names the two phrases that are never used for us: "ticketing
 * platform" and "ticket seller".
 *
 * When the ruling landed, the sentence "The ticketing platform built for every
 * community" was the platform's own description in FIFTEEN source files: the
 * root title tag, the Open Graph and Twitter cards, the homepage hero H1, the
 * site footer, the auth shell, four page metadata blocks, the site JSON-LD that
 * production was serving inside its Organization schema, the help centre, and
 * four transactional email footers. Prose is not executed, so not one of those
 * failed a type check, a test or any other gate. That is exactly the shape of
 * the deleted-fee incident that `one-fee-copy.mjs` exists to stop, and this
 * guard is its sibling.
 *
 * THE LINE IT DRAWS, and why the line is necessary. Describing a COMPETITOR as
 * a ticketing platform is correct and must survive: the owner's own positioning
 * statement says "Unlike ticketing platforms that stop at the checkout", the
 * pricing page compares three named competitors, and the About page says we
 * measure ourselves "against the best ticketing platforms in the world". A
 * guard that banned the words outright would have to be switched off within a
 * week, and a gate somebody switches off protects nothing.
 *
 * So a hit is allowed only when the SAME SENTENCE carries a competitor marker
 * (other, mainstream, major, dominant, best, unlike, than, rival, incumbent,
 * traditional, conventional, competitor, competing, versus). Everything else
 * fails. The retired strapline itself has NO escape: "ticketing platform built
 * for every community" fails wherever it appears, marker or not, because there
 * is no reading of that sentence in which it describes somebody else.
 *
 * WHAT IT DELIBERATELY DOES NOT CHECK. Code comments, which are not copy: they
 * are blanked by the shared stripper before matching. Dated records under
 * docs/roast, docs/verification, docs/benchmark and the rest, which are the log
 * of what was true on a given day; rewriting those would falsify the record.
 * The exclusions are printed on every run so they cannot quietly widen.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, sep } from 'node:path'
import { stripComments, normaliseEol } from './lib/source.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const TAG = '[positioning-lock]'

/**
 * Customer-facing roots. `src` is the running product, including the email
 * builders and the HTML email templates. `docs/marketing` is the copy the
 * founder pastes into a post, which reaches an organiser as directly as a page.
 */
const SCAN_ROOTS = ['src', 'docs/marketing']

/** Dated records, excluded on purpose. Printed on every run. */
const EXCLUDED_AS_HISTORICAL = [
  'docs/audit',
  'docs/roast',
  'docs/verification',
  'docs/benchmark',
  'docs/sessions',
]

const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'build', '.vercel', 'coverage'])
const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/i
const PROSE_EXT = /\.(md|mdx|html|txt)$/i

/** The two phrases the ruling names. */
const BANNED = /ticket(?:ing platform|ing platforms|\s+seller|\s+sellers)/i

/** The retired strapline. No competitor reading exists, so no marker excuses it. */
const RETIRED_STRAPLINE = /ticketing platform built for every community/i

/**
 * A sentence that is talking about somebody else. Deliberately generous: the
 * cost of letting one competitor sentence through is nil, and the cost of
 * failing the build on a correct sentence is a guard nobody keeps.
 */
const COMPETITOR_MARKER =
  /\b(other|others|most|mainstream|major|dominant|best|unlike|than|rival|rivals|incumbent|incumbents|traditional|conventional|competitor|competitors|competing|versus|vs)\b/i

/**
 * The file that declares the ban. It quotes both phrases in its own
 * documentation and in `BANNED_SELF_DESCRIPTIONS`, and it carries the owner's
 * positioning statement verbatim. Exempting it by exact path rather than by
 * pattern keeps the exemption to one file that a reader can open.
 */
const DECLARES_THE_BAN = join('src', 'lib', 'brand', 'positioning.ts')

function walk(dir, out = []) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch (error) {
    /*
     * An ABSENT directory is the answer, not an incident: .vercelignore strips
     * docs/ from the Vercel upload, so docs/marketing is legitimately missing
     * there and this guard walks what exists (that is exactly the reason it is
     * listed as TOLERANT in vercelignore-covers-guard-reads). Anything else is
     * a real read failure and says so, because a scanner that reads nothing
     * finds nothing and reports PASS.
     */
    if (error?.code !== 'ENOENT') console.warn(`${TAG} could not read ${dir}: ${error.message}`)
    return out
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    let st
    try {
      st = statSync(full)
    } catch (error) {
      if (error?.code !== 'ENOENT') console.warn(`${TAG} could not stat ${full}: ${error.message}`)
      continue
    }
    if (st.isDirectory()) walk(full, out)
    else if (CODE_EXT.test(entry) || PROSE_EXT.test(entry)) out.push(full)
  }
  return out
}

function excluded(relPath) {
  const posix = relPath.split(sep).join('/')
  return EXCLUDED_AS_HISTORICAL.some(p => posix === p || posix.startsWith(`${p}/`))
}

/** Split on sentence ends AND on JSX/HTML tag boundaries, so a marker in a neighbouring element cannot launder a hit. */
function sentencesOf(text) {
  return text
    .replace(/<[^>]*>/g, ' | ')
    .split(/(?<=[.!?])\s+|\|/)
}

const failures = []
const allowed = []
let scanned = 0

for (const root of SCAN_ROOTS) {
  const abs = join(ROOT, root)
  let st
  try {
    st = statSync(abs)
  } catch (error) {
    if (error?.code !== 'ENOENT') console.warn(`${TAG} could not stat ${abs}: ${error.message}`)
    continue
  }
  const files = st.isDirectory() ? walk(abs) : [abs]
  for (const file of files) {
    const rel = relative(ROOT, file)
    if (excluded(rel)) continue
    scanned += 1
    const raw = normaliseEol(readFileSync(file, 'utf8'))
    // Comments are not copy. Strings and JSX text survive the stripper.
    const text = CODE_EXT.test(file) ? stripComments(raw) : raw
    if (!BANNED.test(text) && !RETIRED_STRAPLINE.test(text)) continue
    const isDeclaration = rel === DECLARES_THE_BAN
    const lines = text.split('\n')
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]
      if (!BANNED.test(line) && !RETIRED_STRAPLINE.test(line)) continue
      if (RETIRED_STRAPLINE.test(line)) {
        if (isDeclaration) {
          allowed.push({ rel, line: i + 1, why: 'declares the ban', text: line.trim().slice(0, 100) })
          continue
        }
        failures.push({
          rel,
          line: i + 1,
          text: line.trim().slice(0, 120),
          why: 'the retired strapline. Import BRAND_STRAPLINE from src/lib/brand/positioning.ts.',
        })
        continue
      }
      const sentence = sentencesOf(line).find(s => BANNED.test(s)) ?? line
      if (COMPETITOR_MARKER.test(sentence)) {
        allowed.push({ rel, line: i + 1, why: 'competitor', text: line.trim().slice(0, 100) })
        continue
      }
      if (isDeclaration) {
        allowed.push({ rel, line: i + 1, why: 'declares the ban', text: line.trim().slice(0, 100) })
        continue
      }
      failures.push({
        rel,
        line: i + 1,
        text: line.trim().slice(0, 120),
        why: 'describes EventLinqs with a phrase the positioning lock forbids.',
      })
    }
  }
}

console.log(`${TAG} scanned ${scanned} file(s) under ${SCAN_ROOTS.join(', ')}`)
console.log(`${TAG} excluded as dated records: ${EXCLUDED_AS_HISTORICAL.join(', ')}`)
for (const a of allowed) {
  console.log(`${TAG}   allowed (${a.why})  ${a.rel}:${a.line}  ${a.text}`)
}

if (failures.length) {
  console.error(`${TAG} FAIL: ${failures.length} surface(s) call EventLinqs a ticketing platform or a ticket seller.`)
  console.error(
    `${TAG} The owner's ruling of 7 September 2026: EventLinqs is the platform where events get made, and those two phrases are never used for us.`,
  )
  for (const f of failures) {
    console.error(`${TAG}   ${f.rel}:${f.line}  ${f.text}`)
    console.error(`${TAG}     ${f.why}`)
  }
  process.exit(1)
}

console.log(`${TAG} PASS: no user-facing surface describes EventLinqs with a forbidden phrase.`)
