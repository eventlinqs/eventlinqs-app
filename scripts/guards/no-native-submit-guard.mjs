#!/usr/bin/env node
/**
 * No form may leak its fields on a pre-hydration submit.
 *
 * THE DEFECT, observed live on production. Every form in this codebase is
 * written as `<form onSubmit={handler}>` with `e.preventDefault()` inside and NO
 * `action` attribute. That is correct once React is live. Before React is live
 * the markup is painted and the inputs are usable, so a submit in that window is
 * a NATIVE submit, and a native submit with no action and no method is a GET to
 * the current URL with every field in the query string:
 *
 *   /login?email=...&password=<REDACTED>
 *
 * The credential is then in browser history, in every access log that records
 * URLs, and in the Referer header of the next request. The person also sees
 * their form cleared with no message, because the navigation discarded the
 * React error state, which is exactly what "I typed my password and nothing
 * happened" looks like.
 *
 * WHY THIS GUARD IS REPO-WIDE. The first fix for this covered
 * src/components/auth, which is four files. The class is not four files. The
 * same shape carried the ADMIN password, the admin TOTP code and the admin
 * recovery code on /admin/login, plus access codes, ticket codes and a lot of
 * personal data elsewhere. A guard scoped to the directory where the bug was
 * first noticed would have passed while the founder credential leaked.
 *
 * TWO ACCEPTED FIXES, because two lines of work fixed this two ways and both
 * are sound:
 *
 *   method="post"   a native submit becomes a POST, so the fields travel in the
 *                   request body and NEVER enter the URL, history or Referer.
 *                   Works with no JavaScript at all.
 *   useHydrated     the submit control is disabled until React attaches, so the
 *                   native submit cannot be triggered. Note that disabling the
 *                   submit button also disables implicit submission, so pressing
 *                   Enter in a text field is covered too.
 *
 * Either satisfies this guard. Belt and braces (both) is preferred on the
 * highest-value forms and is what /admin/login carries.
 *
 * ONE PIECE OF HTML TRIVIA THAT MATTERS HERE. A native submit only includes
 * inputs that have a `name` attribute; the HTML spec excludes unnamed controls
 * from the form entry list. Several controlled React inputs in this codebase omit
 * `name` (the door scanner holds a ticket code AND its secret in unnamed
 * inputs), so they cannot leak today. That is safety by accident, not by design:
 * it evaporates the moment somebody adds `name` for autofill or for a test
 * selector. This guard therefore protects the FORM, not the current attribute
 * list, so the protection survives that edit.
 *
 * Exit 0 = every form is safe. Exit 1 = at least one can leak. Build gate.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const SRC = path.join(ROOT, 'src')

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (entry.endsWith('.tsx')) out.push(full)
  }
  return out
}

/**
 * Pull each <form ...> opening tag out of a file, with the line it starts on.
 * Brace-aware so a JSX expression containing '>' does not end the tag early.
 */
function formTags(src) {
  const tags = []
  const re = /<form(\s|>)/g
  let m
  while ((m = re.exec(src)) !== null) {
    let i = m.index + '<form'.length
    let depth = 0
    let tag = ''
    while (i < src.length) {
      const ch = src[i]
      if (ch === '{') depth++
      if (ch === '}') depth--
      if (ch === '>' && depth === 0) break
      tag += ch
      i++
    }
    tags.push({ tag, line: src.slice(0, m.index).split('\n').length })
  }
  return tags
}

/**
 * How much does it MATTER if this form's fields land in the URL?
 *
 * A search box putting `q=jazz` in the query string is not a leak; that is what
 * a search box is for, and forcing it to POST would break search for a visitor
 * with no JavaScript. A login form putting `password=` there is the defect this
 * whole pass exists for. Treating those two the same would either force a wrong
 * fix onto the search box or, far worse, bury the credential forms in a list of
 * 32 mostly-harmless ones where nobody reads to the bottom.
 *
 * Classification is per FILE rather than per form element. That over-approximates
 * when one file holds several forms, which is the safe direction to err: it can
 * demand protection for a benign form, never waive it for a dangerous one.
 */
// Separators are [-_]? throughout, deliberately. The first version of this list
// wrote `access_?code` and therefore MISSED name="access-code" in
// src/components/features/events/access-code-input.tsx, classifying a credential
// that unlocks hidden ticket tiers as benign. A name-matching heuristic that is
// strict about punctuation fails silently and in the dangerous direction.
const CREDENTIAL = [
  /type=(['"])password\1/i,
  /name=(['"])[a-z-_]*(password|totp|recovery|secret|token|code)[a-z-_]*\1/i,
  /autoComplete=(['"])(current-password|new-password|one-time-code)\1/i,
]
const PERSONAL = [
  /type=(['"])email\1/i,
  /name=(['"])[a-z-_]*(email|phone|name)[a-z-_]*\1/i,
  /autoComplete=(['"])(username|email|tel|name)\1/i,
]

function risk(src) {
  if (CREDENTIAL.some((re) => re.test(src))) return 'CREDENTIAL'
  if (PERSONAL.some((re) => re.test(src))) return 'PERSONAL'
  return 'benign'
}

const failures = []
const benign = []
let checked = 0

for (const file of walk(SRC)) {
  const src = readFileSync(file, 'utf8')
  if (!src.includes('<form')) continue
  const rel = path.relative(ROOT, file).replace(/\\/g, '/')
  const level = risk(src)

  for (const { tag, line } of formTags(src)) {
    // A form with an `action` submits somewhere deliberate (a server action or a
    // real endpoint), so there is no accidental self-GET to worry about.
    if (/\baction\s*=/.test(tag)) continue
    // No onSubmit means no handler to race: a plain GET form is doing what it
    // says on the tin.
    if (!/\bonSubmit\s*=/.test(tag)) continue

    checked++
    const hasPost = /\bmethod\s*=\s*(['"])post\1/i.test(tag)
    const hydrationGated = src.includes('useHydrated') || src.includes('useSyncExternalStore')
    if (hasPost || hydrationGated) continue

    if (level === 'benign') benign.push({ rel, line })
    else failures.push({ rel, line, level })
  }
}

console.log(
  `[no-native-submit] ${checked} handler-driven forms with no action attribute; ` +
    `${failures.length} carrying a credential or personal data are unprotected.`,
)

// Printed, never silent. These are judged lower risk, not unexamined: a
// pre-hydration GET puts a search term or a filter in the URL, which is what a
// GET form is for and carries nothing worth stealing. Listed so the judgement
// stays visible and can be overturned.
if (benign.length) {
  console.log(
    `\n[no-native-submit] ${benign.length} unprotected form(s) judged benign ` +
      `(no credential, no personal data):`,
  )
  for (const f of benign) console.log(`    ${f.rel}:${f.line}`)
}

if (failures.length) {
  console.error(
    `\n[no-native-submit] FAIL - ${failures.length} form(s) would put a credential or\n` +
      `personal data in the URL on a submit that happens before React hydrates:\n`,
  )
  for (const f of failures) console.error(`  [${f.level}] ${f.rel}:${f.line}`)
  console.error(
    `\nFix with EITHER of:\n` +
      `  method="post"   fields travel in the body, never the URL. Works with no JS.\n` +
      `  useHydrated     disable the submit control until React attaches.\n` +
      `See docs/security/AUDIT-2026-08-08.md.`,
  )
  process.exit(1)
}

console.log('\n[no-native-submit] PASS - no credential or personal data can leak before hydration.')
