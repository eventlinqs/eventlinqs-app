/**
 * The CI copy gate (C3): enforces the copy laws and the AI-tell lexicon on
 * the platform's own copy. Single source of truth: src/lib/ai/copy-tells.json
 * (the same lexicon the runtime gate applies to generated copy).
 *
 * What is enforced where:
 * - Em and en dashes: anywhere in src (the law says never, anywhere).
 * - The banned word: anywhere in src, word-boundary form.
 * - Phrase tells + competitor names: in STRING LITERALS and JSX text only.
 *   Code comments legitimately cite competitors as design evidence, and code
 *   identifiers legitimately use words like unlock; copy strings may not.
 * - Exclamation marks are NOT repo-gated (code uses ! structurally); the
 *   runtime gate strips them from every generated string instead.
 *
 * Allowlist entries carry their reason and are re-justified here, not waved.
 * Exit 1 on any violation, with file:line output.
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const LEXICON = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'src/lib/ai/copy-tells.json'), 'utf8'),
)

/** file -> patterns exempt there, with the reason on record. */
const ALLOWLIST = [
  {
    file: 'src/lib/ai/sanitise.ts',
    patterns: ['em-or-en-dash'],
    reason: 'the strip regexes must name the characters they strip',
  },
  {
    file: 'src/lib/ai/magic-start.ts',
    patterns: ['banned-word-community-law'],
    reason: 'the system prompt must name the banned word to prohibit it',
  },
  {
    file: 'src/lib/images/spine.ts',
    patterns: ['banned-word-community-law'],
    reason: 'legacy licensed-photo library key arts-culture (renaming breaks the image spine)',
  },
  {
    file: 'src/lib/communities/intersection-editorial.ts',
    patterns: ['whether-youre-x-or-y'],
    reason:
      'founder-approved editorial enumerating five named communities; the tell is the generic filler form, which the runtime gate still blocks in generated copy',
  },
]

/**
 * FEE LITERALS (LOCK 4, 2026-07-27). docs/PRICING.md is the ONLY place a fee
 * figure may exist in prose. Everywhere else reads the live value through
 * getPricingRule / getLivePublicFee, so the number shown can never drift from
 * the number charged.
 *
 * Context-gated on purpose. A bare percentage is legitimate copy ("100 percent
 * Australian owned"), so a match requires BOTH a fee-shaped figure AND a
 * fee word in the same copy chunk. That keeps the gate precise enough to stay
 * on, which a noisy gate never does.
 */
const FEE_WORD_RE = /\b(fee|fees|charge|charged|commission|service charge|processing|platform fee|payout|per ticket|all[- ]in|take[- ]rate)\b/i
const FEE_PERCENT_RE = /\b\d{1,3}(\.\d+)?\s*(%|per ?cent)/i
const FEE_MONEY_RE = /\b(?:AUD|A?\$)\s?\d+\.\d{2}\b|\b\d+\.\d{2}\s?(?:AUD|dollars)\b/i
/** The locked figures are barred from copy even without a fee word nearby. */
const LOCKED_FIGURE_RE = /\b3\.5\s*%|\b2\.5\s*%|\bAUD\s?0\.99\b|\$0\.99\b/i

function feeLiteralViolation(chunk) {
  if (LOCKED_FIGURE_RE.test(chunk)) return 'fee-literal-locked-figure'
  if (!FEE_WORD_RE.test(chunk)) return null
  if (FEE_PERCENT_RE.test(chunk)) return 'fee-literal-percentage'
  if (FEE_MONEY_RE.test(chunk)) return 'fee-literal-money'
  return null
}

/**
 * LOCK 5: no placeholder copy on a shipped surface.
 *
 * CLAUDE.md Law 1 is explicit that a "Coming soon" placeholder "is a defect by
 * definition, not a stub to fix later", and Copy and banned content repeats it.
 * Nothing checked for it, and one shipped: /dashboard/insights greeted an
 * organiser with "Insights are coming soon ... are being built". The public
 * sweep walker looked for this string but only walked PUBLIC pages, so an
 * authed organiser surface was outside every net.
 *
 * Scanned in copy chunks only, so a code comment explaining the rule does not
 * trip it.
 */
const PLACEHOLDER_RE = /\b(coming soon|lorem ipsum|sample event \d|placeholder text|to be announced)\b/i

const DASH_RE = /[—–]/
const BANNED_WORD_RE = new RegExp(
  LEXICON.hard.find(h => h.name === 'banned-word-community-law').source,
  'iu',
)
const STRING_SCOPED = [
  ...LEXICON.phrases,
  { name: 'competitor-name', source: LEXICON.hard.find(h => h.name === 'competitor-name').source },
].map(t => ({ name: t.name, re: new RegExp(t.source, 'iu') }))

/** Pull quoted strings and JSX text out of one line of source. */
function copyChunks(line) {
  const chunks = []
  const stringRe = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g
  let m
  while ((m = stringRe.exec(line)) !== null) chunks.push(m[1] ?? m[2] ?? m[3] ?? '')
  const jsxRe = />([^<>{}]*[A-Za-z]{3,}[^<>{}]*)</g
  while ((m = jsxRe.exec(line)) !== null) chunks.push(m[1])

  // JSX TEXT ON ITS OWN LINE. The matcher above needs `>` and `<` on the SAME
  // line, and Prettier wraps any copy longer than the print width onto its own
  // line:
  //
  //     <h2 className="...">
  //       Insights are coming soon      <-- invisible to every rule here
  //     </h2>
  //
  // Most user-facing copy in this codebase is formatted exactly that way, so
  // the gate was passing while unable to see it. That is how a banned
  // "coming soon" reached a shipped organiser surface with the gate green.
  //
  // A bare text line carries no angle brackets, no braces, no assignment and
  // no statement punctuation, which is what separates it from code.
  const bare = line.trim()
  if (
    bare.length > 0 &&
    !/[<>{}=;()[\]]/.test(bare) &&
    !/^["'`]/.test(bare) &&
    !/^(import|export|const|let|var|return|type|interface|from|default)/.test(bare) &&
    /[A-Za-z]{3,}\s+[A-Za-z]/.test(bare)
  ) {
    chunks.push(bare)
  }
  return chunks
}

function isCommentLine(trimmed) {
  return (
    trimmed.startsWith('//') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('/*') ||
    trimmed.startsWith('{/*')
  )
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) yield full
  }
}

const violations = []
for (const file of walk(path.join(ROOT, 'src'))) {
  const rel = path.relative(ROOT, file).replaceAll('\\', '/')
  const allowed = ALLOWLIST.find(a => a.file === rel)?.patterns ?? []
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/)

  // Track block-comment depth across lines. isCommentLine only recognises a
  // line that STARTS a comment, so a continuation line inside a {/* ... */}
  // block read as copy once wrapped JSX text became visible. That produced a
  // false positive on auth-shell.tsx, where a competitor is named in a design
  // provenance comment, which is documentation and not user-facing copy.
  let inBlockComment = false

  lines.forEach((line, i) => {
    const trimmedLine = line.trim()
    const opens = trimmedLine.includes('/*')
    const closes = trimmedLine.includes('*/')
    const wasInComment = inBlockComment
    if (opens && !closes) inBlockComment = true
    else if (closes) inBlockComment = false
    if (wasInComment || (opens && !closes)) return

    const where = `${rel}:${i + 1}`
    if (!allowed.includes('em-or-en-dash') && DASH_RE.test(line)) {
      violations.push(`${where} em-or-en-dash`)
    }
    if (!allowed.includes('banned-word-community-law') && BANNED_WORD_RE.test(line)) {
      violations.push(`${where} banned-word-community-law`)
    }
    if (isCommentLine(line.trim())) return
    const chunks = copyChunks(line)
    if (chunks.length === 0) return
    if (!allowed.includes('placeholder-copy') && chunks.some(c => PLACEHOLDER_RE.test(c))) {
      violations.push(`${where} placeholder-copy`)
    }
    for (const tell of STRING_SCOPED) {
      if (allowed.includes(tell.name)) continue
      if (chunks.some(c => tell.re.test(c))) violations.push(`${where} ${tell.name}`)
    }
    // LOCK 4: no fee figure as a literal in copy. docs/PRICING.md is the only
    // place a fee number is allowed to exist, and it is not scanned here.
    if (allowed.includes('fee-literal')) return
    for (const c of chunks) {
      const kind = feeLiteralViolation(c)
      if (kind) {
        violations.push(`${where} ${kind}  -> read the live value (getLivePublicFee); docs/PRICING.md is the only home for a fee figure`)
        break
      }
    }
  })
}

if (violations.length > 0) {
  console.error(`copy-tell-gate: ${violations.length} violation(s)`)
  for (const v of violations) console.error('  ' + v)
  process.exit(1)
}
console.log('copy-tell-gate: clean (dashes, banned word, phrase tells, competitor names)')
