/**
 * BUILD-FAILING GUARD: no control character may sit in a source file.
 *
 * THIS IS A PATTERN, NOT AN ACCIDENT. Two branches shipped a corrupted file
 * from the identical mechanism, and neither was found deliberately:
 *
 *   1. scripts/copy-tell-gate.mjs carried a literal BACKSPACE (0x08) where a
 *      regex `\b` was intended, because a shell heredoc consumed the
 *      backslash. The regex therefore required a backspace character before
 *      the word it was matching, so it could never match anything. The gate
 *      reported clean and nobody could tell it apart from a real pass.
 *
 *   2. Another branch shipped "Four hour of hou e and break acro two room"
 *      onto a rendered card. Same cause: a heredoc ate the backslashes, and
 *      what survived was text with characters silently removed.
 *
 * Both are invisible to every other gate. Types pass, lint passes, the build
 * passes, the page renders. A backspace inside a regex is valid JavaScript; a
 * mangled sentence is valid English to a compiler.
 *
 * WHAT IS ALLOWED. Tab, newline and carriage return, because they are real
 * formatting. Everything else in the C0 range, plus DEL and the zero-width and
 * bidirectional Unicode controls, is a corruption or a homoglyph attack, and
 * neither belongs in source. ZWJ (U+200D) is NOT forbidden: it legitimately
 * joins emoji sequences, and a guard that fires on an emoji gets ignored.
 *
 * Run by `npm run guards`, which `prebuild` invokes, so `npm run build` fails.
 */
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()

/** Directories that are not hand-written source. */
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'build', 'coverage', 'design-captures'])

/** Extensions worth checking: anything a person edits. */
const EXTS = /\.(ts|tsx|js|jsx|mjs|cjs|json|css|md|sql|ya?ml)$/

/**
 * Forbidden: C0 controls except tab (09), newline (0A) and carriage return
 * (0D); DEL (7F); zero-width space/joiner/non-joiner and the BOM when it is
 * not the first character; and the bidirectional override characters used in
 * Trojan Source attacks.
 */
const FORBIDDEN = new RegExp(
  // Built from escapes, never literal characters: an earlier version of
  // this line contained the very bytes it forbids and flagged itself.
  [
    '[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F',
    '\\u200B\\u200C\\u2060',
    '\\u202A-\\u202E\\u2066-\\u2069]',
  ].join(''),
  'u',
)

const NAMES = {
  0x00: 'NUL', 0x07: 'BEL', 0x08: 'BACKSPACE', 0x0b: 'VTAB', 0x0c: 'FORMFEED',
  0x1b: 'ESC', 0x7f: 'DEL', 0x200b: 'ZERO-WIDTH SPACE', 0x200c: 'ZWNJ',
  0x200d: 'ZWJ', 0x2060: 'WORD JOINER', 0x202e: 'RIGHT-TO-LEFT OVERRIDE',
}

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.github') continue
    if (SKIP_DIRS.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else if (EXTS.test(entry.name)) yield full
  }
}

/**
 * Files that legitimately contain a control character, with the reason.
 * Deliberately tiny: this is the escape hatch that must not become a
 * dumping ground, so each entry names the character and why.
 */
const ALLOWLIST = new Map([
  [
    'tests/unit/ai-layer.test.ts',
    'asserts the prompt sanitiser strips smuggled zero-width characters; the fixture must contain a real one',
  ],
])

const findings = []
let scanned = 0

for (const file of walk(ROOT)) {
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch (error) {
    console.warn('[scripts/guards/no-control-characters:93]', error instanceof Error ? error.message : error)
    continue
  }
  scanned++
  const rel = path.relative(ROOT, file).replace(/\\/g, '/')
  if (ALLOWLIST.has(rel)) continue
  if (!FORBIDDEN.test(text)) continue

  const lines = text.split(/\r?\n/)
  lines.forEach((line, i) => {
    // A leading BOM on line 1 is tolerated: some editors write it and it is
    // not corruption.
    const subject = i === 0 ? line.replace(/^﻿/, '') : line
    const m = subject.match(FORBIDDEN)
    if (!m) return
    const cp = m[0].codePointAt(0)
    const name = NAMES[cp] ?? `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`
    findings.push({
      file: rel,
      line: i + 1,
      name,
      context: subject.replace(FORBIDDEN, `<${name}>`).trim().slice(0, 110),
    })
  })
}

if (scanned === 0) {
  console.error('[no-control-characters] FAIL - scanned no files at all; the walker is broken.')
  process.exit(1)
}

/*
 * NO SHEBANG ON ANY .mjs UNDER scripts/, and it lives here because this guard
 * already walks every source file looking for a byte that breaks a parser
 * silently. A shebang is exactly that byte sequence.
 *
 * WHAT IT COSTS WHEN IT HAPPENS. Vite does not strip `#!` when a TEST imports
 * the module. The importing suite dies at collection with
 * `SyntaxError: Invalid or unexpected token` and NO line number, vitest reports
 * "no tests", and the file passes vacuously. That is not hypothetical:
 * `tests/unit/security/rls-column-exposure.test.ts` did precisely this for the
 * entire life of the integration branch, so the guard for the
 * world-readable-column class was not running while every gate stayed green.
 * Seventeen tests were restored by deleting one line.
 *
 * WHY ALL OF THEM AND NOT JUST THE IMPORTED ONE. Twenty-nine other scripts
 * carried one. Each is harmless until somebody writes a test that imports it,
 * and at that moment the failure is silent and looks like the test file's fault.
 * Removing the trap is cheaper than remembering it, and nothing here is invoked
 * directly: every caller uses `node <path>` or `process.execPath`, and no file
 * under scripts/ is mode 100755 in git.
 */
const shebangs = []
for (const file of walk(path.join(ROOT, 'scripts'))) {
  if (!file.endsWith('.mjs')) continue
  let head
  try {
    head = readFileSync(file, 'utf8').slice(0, 2)
  } catch (error) {
    console.warn('[scripts/guards/no-control-characters:152]', error instanceof Error ? error.message : error)
    continue
  }
  if (head === '#!') shebangs.push(path.relative(ROOT, file).replace(/\\/g, '/'))
}

if (shebangs.length > 0) {
  console.error(
    `[no-control-characters] FAIL - ${shebangs.length} script(s) under scripts/ start with a shebang:\n`,
  )
  for (const f of shebangs) console.error(`  ${f}`)
  console.error(
    '\n  Vite does not strip a shebang when a test imports the module, so the whole\n' +
      '  importing suite fails to collect with "Invalid or unexpected token" and no\n' +
      '  line number, and reports "no tests" rather than a failure. Delete the line.\n' +
      '  Every caller here invokes these as `node <path>`, so it buys nothing.\n',
  )
  process.exit(1)
}

if (findings.length > 0) {
  console.error(`[no-control-characters] FAIL - ${findings.length} control character(s) in source:\n`)
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line}  ${f.name}`)
    console.error(`    ${f.context}\n`)
  }
  console.error('  These are almost always a shell heredoc eating a backslash.')
  console.error('  Rewrite the line from a raw string rather than patching it in place.')
  process.exit(1)
}

console.log(
  `[no-control-characters] PASS - ${scanned} files, no control characters, no shebang under scripts/.`,
)
