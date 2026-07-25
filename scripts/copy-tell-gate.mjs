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

  lines.forEach((line, i) => {
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
    for (const tell of STRING_SCOPED) {
      if (allowed.includes(tell.name)) continue
      if (chunks.some(c => tell.re.test(c))) violations.push(`${where} ${tell.name}`)
    }
  })
}

if (violations.length > 0) {
  console.error(`copy-tell-gate: ${violations.length} violation(s)`)
  for (const v of violations) console.error('  ' + v)
  process.exit(1)
}
console.log('copy-tell-gate: clean (dashes, banned word, phrase tells, competitor names)')
