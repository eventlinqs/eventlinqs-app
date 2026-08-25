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
import { measureCoverage } from './lib/copy-coverage.mjs'

const ROOT = process.cwd()

/**
 * AN EXTRA DIRECTORY TO SCAN, AND WHY IT CANNOT WEAKEN THIS GATE.
 *
 * The self test in tests/unit/ci/copy-gate-can-see.test.ts has to plant a known
 * violation somewhere this gate will read it. It used to plant it INSIDE the
 * tree, at src/__copy_gate_scratch__/scratch.tsx, and that cost twice:
 *
 *   1. Every other test that walks src/ could enumerate the scratch file and
 *      then read it after the self test deleted it, throwing ENOENT at module
 *      scope. vitest reports a collection failure as "no tests" rather than as a
 *      failure, so the suite went green having run LESS. That happened to two
 *      test files.
 *   2. If a run was ever interrupted between plant and delete, the scratch was
 *      left behind and THIS GATE then failed on it, on a tree that was actually
 *      clean. That is not hypothetical: it was found sitting in the tree, and
 *      `node scripts/copy-tell-gate.mjs` exited 1 reporting
 *      `src/__copy_gate_scratch__/scratch.tsx:4 placeholder-copy`.
 *
 * So the scratch now lives in the OS temp directory, outside the repository
 * entirely, where no walker over src/ can ever see it, and the self test points
 * this variable at it.
 *
 * THE SAFETY PROPERTY IS THAT THIS IS ADDITIVE. It appends a directory to the
 * scan; it can never remove one. src/ is always scanned regardless of what this
 * is set to, so the variable can only ever make the gate report MORE. There is
 * no value of it that hides a violation, which is the only reason a gate is
 * allowed to take an input from the environment at all.
 *
 * Coverage (LOCK 6, below) is deliberately NOT affected: it is measured over
 * src/ alone, so a scratch file cannot move the recorded eyesight ratio.
 */
const EXTRA_DIR = (process.env.COPY_GATE_EXTRA_DIR ?? '').trim()

/**
 * The floor the gate's own eyesight must clear, MEASURED rather than guessed.
 *
 * Across .tsx the sighted chunker reads 37.2% of non-comment lines and the
 * blind one read 33.1%. The floor sits midway. Raising it is welcome; lowering
 * it to make a red run pass is precisely the failure it exists to catch.
 *
 * ITS LIMIT, STATED. 4 points of separation catches a WHOLESALE narrowing,
 * which is the failure that actually happened. It would not catch someone
 * quietly dropping one narrow case. The self test in
 * tests/unit/ci/copy-gate-can-see.test.ts covers that by planting known
 * violations in the shapes that were blind; the two checks are complementary
 * and neither is sufficient alone.
 */
const COVERAGE_FLOOR = 0.351
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
    file: 'src/lib/stripe/business-profile.ts',
    patterns: ['em-or-en-dash'],
    reason:
      'same case as sanitise.ts above: TYPOGRAPHIC_REPLACEMENTS strips en dash, em dash and minus from an event title before it reaches Stripe, so the character class has to name them. Surfaced when origin/main merged in, because main added the test that runs this gate over the whole tree and this branch added the file',
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
    file: 'src/lib/events/search-params.ts',
    patterns: ['banned-word-community-law'],
    reason:
      'CATEGORY_SLUG_ALIASES has to spell the RETIRED slug arts-culture, because that is the string arriving in a URL somebody already shared. The alias is what stops migration 20260812000002 turning those links into a 200 with zero events. The banned word is being retired here, not used: it appears once, as a map key, and its value is the community-first slug that replaces it',
  },
  {
    file: 'src/lib/seo/permanent-redirects.ts',
    patterns: ['banned-word-community-law'],
    reason:
      'the redirect table has to spell the RETIRED path, because that path is the thing being redirected: /cultures and /culture/:slug are the sources of the permanent 301s that keep every already-shared link working. The same admission and the same reasoning already cover src/lib/broadcast/short-links.ts, which reserves those two paths so a share code cannot shadow them. The strings are route names being retired, not copy: every destination in the table is a /community route',
  },
  {
    file: 'src/lib/broadcast/short-links.ts',
    patterns: ['banned-word-community-law'],
    reason:
      'the RESERVED list has to hold back the two legacy paths that permanently 301 to the community routes. Not reserving them would let a share code be minted that shadows a live redirect, which is a broken link for a real person. The strings are route names being blocked, not copy',
  },
  {
    file: 'src/lib/broadcast/captions.ts',
    patterns: ['banned-word-community-law'],
    reason:
      'the live event_categories row still carries the slug arts-culture, so the caption register map has to match the string the database actually stores. The renaming of that row is a data migration (the Phase 2 taxonomy work), not a copy change, and inventing a different slug here would silently mis-register every arts event',
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
  // Rejecting any line containing < { or ( was still too blunt: it hid the
  // most common shapes of real copy, which mix text with an interpolation
  // or an inline element.
  //
  //     {count} upcoming events
  //     Book with <strong>care</strong> before Friday
  //
  // So the line is STRIPPED of expressions and inline tags rather than
  // rejected, and what remains is judged as prose. Code is excluded by what
  // code has and prose does not: an assignment, a terminator, a leading
  // keyword, or a bare call.
  const bare = line.trim()
  const looksLikeCode =
    /[=;]/.test(bare) ||
    /^["'`]/.test(bare) ||
    /^(import|export|const|let|var|return|type|interface|from|default|function|class|if|for|while|switch|case|await|async)\b/.test(
      bare,
    ) ||
    /^[A-Za-z$_][\w$.]*\(/.test(bare)

  if (!looksLikeCode) {
    const stripped = bare
      .replace(/\{[^{}]*\}/g, ' ')
      .replace(/<[^<>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    // Two words of real letters is the floor for prose. A lone identifier,
    // a closing brace or an attribute name never clears it.
    if (/[A-Za-z]{3,}\s+[A-Za-z]/.test(stripped)) chunks.push(stripped)
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

/**
 * Every directory this run scans. src/ is unconditional and always first; the
 * extra directory is appended only when it is set AND exists, so a stale value
 * pointing at a deleted temp directory is a no-op rather than a crash.
 */
function scanRoots() {
  const roots = [path.join(ROOT, 'src')]
  if (EXTRA_DIR && fs.existsSync(EXTRA_DIR)) roots.push(path.resolve(EXTRA_DIR))
  return roots
}

function* walkAll(roots) {
  for (const root of roots) yield* walk(root)
}

/**
 * How a file is named in the output. A path inside the repository is shown
 * relative, which is what the allowlist matches on. A path OUTSIDE it (the temp
 * scratch) would render as a pile of `../`, so it is shown absolute instead.
 */
function label(file) {
  const rel = path.relative(ROOT, file).replaceAll('\\', '/')
  return rel.startsWith('..') ? file.replaceAll('\\', '/') : rel
}

const violations = []
for (const file of walkAll(scanRoots())) {
  const rel = label(file)
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

// LOCK 6: the gate must be able to SEE. A clean report from a gate that reads
// nothing is the exact failure this suite spent months in, so eyesight is
// asserted alongside the rules. See scripts/lib/copy-coverage.mjs.
// .tsx only. Measured across all sources the ratio moved just 3.1 points
// between the blind chunker and the sighted one, because .ts files are almost
// entirely code and swamp the signal. Restricted to the files where copy
// actually lives, a narrowing shows up as a real drop instead of noise.
const coverage = measureCoverage(
  [...walk(path.join(ROOT, 'src'))].filter(f => f.endsWith('.tsx')),
  f => fs.readFileSync(f, 'utf8'),
  copyChunks,
)
const pct = (coverage.ratio * 100).toFixed(1)
if (coverage.ratio < COVERAGE_FLOOR) {
  console.error(
    `copy-tell-gate: COVERAGE REGRESSION. The gate can read ${pct}% of source lines, ` +
      `below the committed floor of ${(COVERAGE_FLOOR * 100).toFixed(1)}%.\n` +
      `  read ${coverage.numerator} of ${coverage.denominator} non-comment lines.\n` +
      `  The chunker has narrowed. A gate that reads less reports fewer violations\n` +
      `  and looks healthier, which is how the previous blind spot survived.\n` +
      `  Fix the chunker. Do NOT lower the floor to make this pass.`,
  )
  process.exit(1)
}

console.log(
  `copy-tell-gate: clean (dashes, banned word, phrase tells, competitor names) ` +
    `| coverage ${pct}% of ${coverage.denominator} lines`,
)
