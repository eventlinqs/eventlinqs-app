/**
 * ONE FEE: no customer-facing surface may name a second fee.
 *
 * WHY THIS EXISTS. The founder ruling of 15 August 2026 deleted the separate
 * 2.5 per cent payment processing fee. The CODE changed that day. The COPY did
 * not, and it took a full sweep to find how far it had spread: the AI support
 * knowledge base told anyone who asked that there was "a payment processing fee
 * shown at checkout", the organiser guide opened with "Two fees apply to each
 * paid ticket", the live checkout summed the line under the label "Service +
 * processing fees", the event form asked the organiser to choose who pays "the
 * EventLinqs service and processing fees", and docs/PRICING.md, the document
 * that declares itself the only place a fee figure may exist, carried three
 * worked examples built on the deleted fee.
 *
 * Every one of those was a misleading pricing representation to a prospective
 * organiser, and not one of them failed a test, a type check or a gate, because
 * prose is not executed.
 *
 * WHAT IT CHECKS, and the line it draws. The word "processing" is not banned.
 * The DATABASE COLUMN `processing_fee_cents` is real and holds real history; the
 * rule `processing_fee_pass_through` is live and decides who carries the one fee;
 * and the correct copy for an assistant includes the sentence "there is no
 * payment processing fee", which must obviously survive. So this guard matches
 * PROSE ASSERTIONS of a second fee, never identifiers, and it requires the
 * assertive form rather than the mere presence of a word.
 *
 * WHAT IT DELIBERATELY DOES NOT CHECK. Dated records. docs/audit, docs/roast,
 * docs/verification, docs/benchmark and the rest are the log of what was true on
 * a given day, and rewriting them to match today would be falsifying the record
 * rather than fixing a defect. They are excluded by path, and the exclusion is
 * listed on every run so it cannot quietly widen.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, sep } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/**
 * Customer-facing roots. `src` is the running product. `docs/marketing` is the
 * copy the founder pastes into a post or an email, which reaches an organiser
 * just as directly as a page does. The three authority documents are included
 * because a wrong fee in them becomes a wrong fee everywhere else next week.
 */
const SCAN_ROOTS = [
  'src',
  'docs/marketing',
  'docs/PRICING.md',
  'docs/EventLinqs-Fee-Structure-LOCKED.md',
  'docs/FEE-SYSTEM.md',
  'docs/ADMIN-GUIDE.md',
  'CLAUDE.md',
]

/** Dated records, excluded on purpose. Printed on every run. */
const EXCLUDED_AS_HISTORICAL = [
  'docs/audit',
  'docs/roast',
  'docs/verification',
  'docs/benchmark',
  'docs/redesign',
  'docs/sprint1',
  'docs/m6',
  'docs/brand-sweep',
  'docs/design',
  'docs/surpass',
  'docs/research',
  'docs/legal',
  'docs/sessions',
  'supabase/migrations',
]

const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'build', '.vercel', 'coverage'])
const EXT = /\.(ts|tsx|js|jsx|mjs|cjs|md|mdx)$/i

/**
 * The assertive forms. Each must be something a reader would take as "the
 * platform charges a second fee".
 *
 * `processing[ -]fee` is required to be PROSE: preceded by a space or start of
 * a word boundary that is not an underscore, so `processing_fee_cents` and
 * `payment_processing_fee_cents` never match.
 */
const RULES = [
  {
    id: 'second-fee-asserted',
    re: /\btwo fees\b|\bboth fees\b|\btwo separate fees\b|\ba second fee\b(?! of any kind)|\bthere are two fees\b/i,
    why: 'asserts the platform charges more than one fee',
  },
  {
    id: 'processing-fee-named',
    // A processing fee named as a thing that is charged. Excludes the denial
    // forms ("no ... processing fee", "not a processing fee") which are correct.
    re: /(?<![_a-z0-9])(payment[ -]processing fee|processing fee)(?![_a-z0-9])/i,
    why: 'names a payment processing fee, which the platform does not charge',
    // Lines that DENY the fee are correct copy and must pass.
    unless: /\b(no|not|never|nor|without|there is no|deleted|removed|used to|no longer|instead of|rather than)\b[^.]{0,80}?processing fee|processing fee[^.]{0,60}?\b(deleted|removed|no longer|does not exist|never charged)\b/i,
  },
  {
    id: 'plus-processing',
    re: /\bplus (a )?(card |payment )?processing\b/i,
    why: 'adds processing as a second charge on top of the fee',
  },
  {
    id: 'deleted-figure',
    /*
     * The two-fee anchors. A fee word is REQUIRED on the line, because these are
     * ordinary numbers and the first run proved it: `lighthouse@13.1.0 declares
     * node >=22.19` tripped the money rule on a line about a Node engine range.
     * A guard that cries wolf on a version string is a guard somebody switches
     * off, so the money rules carry a context requirement exactly like the
     * percentage rule does.
     */
    re: /\$?\b(2\.19|22\.19|20\.50)\b/,
    why: 'is an all-in figure from the deleted two-fee model',
    requiresFeeWord: true,
  },
  {
    id: 'deleted-rate',
    re: /\b2\.5\s*(%|per ?cent)/i,
    why: 'is the deleted processing rate',
    requiresFeeWord: true,
  },
]

const FEE_WORD_RE =
  /\b(fee|fees|charge|charged|processing|platform|all[- ]in|per ticket|ticket|buyer|pays?|paid|total|attendees?)\b/i

/**
 * Explicit, reasoned exemptions. Two forms, both requiring a written reason:
 *
 *   ONE-FEE-ALLOW: <reason>          exempts this line and the line below it
 *   ONE-FEE-ALLOW-BEGIN: <reason>    opens a passage
 *   ONE-FEE-ALLOW-END                closes it
 *
 * The block form exists because the honest historical passages are PARAGRAPHS
 * (the docblock in fee-math.ts explaining what was deleted and why, the history
 * section of docs/PRICING.md), and marking eight consecutive lines individually
 * produces noise that nobody reads and everybody copies. A block must be closed;
 * an unclosed one is reported as a failure of its own, so the form cannot be used
 * to silence the rest of a file by accident.
 */
const ALLOW_MARKER = /ONE-FEE-ALLOW:/
const ALLOW_BEGIN = /ONE-FEE-ALLOW-BEGIN:/
const ALLOW_END = /ONE-FEE-ALLOW-END/

const files = []
function walk(p) {
  let st
  try {
    st = statSync(join(ROOT, p))
  } catch {
    return
  }
  if (st.isFile()) {
    if (EXT.test(p)) files.push(p)
    return
  }
  for (const entry of readdirSync(join(ROOT, p))) {
    if (SKIP_DIRS.has(entry)) continue
    const child = `${p}/${entry}`
    if (EXCLUDED_AS_HISTORICAL.some((x) => child === x || child.startsWith(`${x}/`))) continue
    walk(child)
  }
}
for (const r of SCAN_ROOTS) walk(r)

const violations = []
const allowed = []

for (const rel of files) {
  let text
  try {
    text = readFileSync(join(ROOT, rel), 'utf8')
  } catch {
    continue
  }
  const lines = text.split(/\r?\n/)
  let inBlock = false
  let blockOpenedAt = 0
  lines.forEach((line, i) => {
    if (ALLOW_BEGIN.test(line)) {
      inBlock = true
      blockOpenedAt = i + 1
      return
    }
    if (ALLOW_END.test(line)) {
      inBlock = false
      return
    }
    const prev = i > 0 ? lines[i - 1] : ''
    const exempt = inBlock || ALLOW_MARKER.test(line) || ALLOW_MARKER.test(prev)
    for (const rule of RULES) {
      rule.re.lastIndex = 0
      if (!rule.re.test(line)) continue
      if (rule.unless && rule.unless.test(line)) continue
      if (rule.requiresFeeWord && !FEE_WORD_RE.test(line)) continue
      const hit = { file: rel.split('/').join(sep), line: i + 1, rule: rule.id, why: rule.why, text: line.trim().slice(0, 160) }
      if (exempt) allowed.push(hit)
      else violations.push(hit)
    }
  })
  if (inBlock) {
    violations.push({
      file: rel.split('/').join(sep),
      line: blockOpenedAt,
      rule: 'unclosed-exemption',
      why: 'opened ONE-FEE-ALLOW-BEGIN and never closed it, so the rest of the file was silently exempt',
      text: lines[blockOpenedAt - 1]?.trim().slice(0, 160) ?? '',
    })
  }
}

console.log(`[one-fee] scanned ${files.length} files across ${SCAN_ROOTS.length} customer-facing roots.`)
console.log(`[one-fee] dated records excluded by design: ${EXCLUDED_AS_HISTORICAL.join(', ')}`)

if (allowed.length > 0) {
  console.log(`[one-fee] ${allowed.length} reviewed exemption(s) carrying ONE-FEE-ALLOW:`)
  for (const a of allowed) console.log(`    ${a.file}:${a.line}  [${a.rule}]  ${a.text}`)
}

if (violations.length > 0) {
  console.error(`\n[one-fee] FAILED. ${violations.length} customer-facing line(s) describe a fee the platform does not charge.\n`)
  for (const v of violations) {
    console.error(`    ${v.file}:${v.line}`)
    console.error(`        rule : ${v.rule} - ${v.why}`)
    console.error(`        line : ${v.text}`)
  }
  console.error(
    '\n    There is ONE fee. It is written down in exactly one place, the' +
      '\n    PRICING-LOCK block in docs/PRICING.md, and every surface derives from' +
      '\n    it through getLivePublicFee / getPricingRule.' +
      '\n' +
      '\n    If a line genuinely needs to name the old fee (a historical note, a' +
      '\n    correction, a test asserting the old value is gone), mark it:' +
      '\n        // ONE-FEE-ALLOW: <the reason>' +
      '\n    on that line or the line above. Exemptions print on every run.\n',
  )
  process.exit(1)
}

console.log('[one-fee] PASS - no customer-facing surface names a second fee.')
