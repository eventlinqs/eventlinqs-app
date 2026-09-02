/**
 * GUARD: the names of real organisations stay the names of real organisations.
 *
 * FOUNDER RULING, 3 September 2026:
 *
 *   "Proper nouns are exempt from the word ban. The ban stops EventLinqs
 *    describing itself as culture-first; it was never meant to rename other
 *    people's organisations."
 *
 * WHAT HAPPENED. A find-and-replace of the banned word ran across the tree and
 * did not stop at EventLinqs' own voice. It rewrote the NAMES of real Australian
 * bodies: the Multicultural Council of the Northern Territory was published as
 * the "Multicommunity Council of the Northern Territory", the National
 * Multicultural Festival as the "National Multicommunity Festival", and 41 more.
 * They sit on the /community pages, 441 of the 552 URLs in the production
 * sitemap.
 *
 * WHY A GUARD AND NOT A NOTE. The corruption was invisible to every gate the
 * repository had. The word ban gate was satisfied, because "Multicommunity"
 * contains no banned letters: the find-and-replace had made the tree MORE
 * compliant while making it untrue. A defect that makes a gate greener is
 * exactly the kind that comes back, because the next sweep for the banned word
 * will run the same replacement and hit the same names.
 *
 * WHAT THIS CHECKS, in three parts:
 *
 *   1. CORRUPTION. The string "multicommunity", in any case, must not appear
 *      anywhere except the reviewed UNRESOLVED list. It is not an English word.
 *      Any new occurrence is the find-and-replace having run again.
 *
 *   2. PRESENCE. Every registered name must still appear somewhere. A registry
 *      entry that matches nothing is an entry nobody has read, and this guard
 *      exists because unread justifications are how the last defect survived.
 *      This mirrors the staleness rule in no-banned-word-anywhere.mjs.
 *
 *   3. THE UNRESOLVED LIST SHRINKS, NEVER GROWS SILENTLY. Each entry names one
 *      exact occurrence awaiting a founder ruling on the copy. When one is
 *      fixed, its entry must be deleted, and this guard fails until it is, so
 *      the list cannot rot into a permanent excuse.
 *
 * WHAT THIS DOES NOT DO. It does not judge whether a name is spelled correctly
 * against the world. That was done once, by hand, against each organisation's
 * own published page, and the source URLs are recorded beside every entry in
 * scripts/guards/lib/proper-nouns.mjs. This guard holds that verified result in
 * place; it cannot re-derive it.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { PROPER_NOUNS, UNRESOLVED, CORRUPTION } from './lib/proper-nouns.mjs'
import { declareWork } from '../lib/work-report.mjs'

const SEP = String.fromCharCode(92)
const ROOTS = ['src', 'scripts', 'supabase/seed', 'docs']
const EXT = /\.(ts|tsx|mjs|js|json|css|sql|yml|yaml|md)$/

/* This guard has to spell the corruption it hunts, so it exempts itself and the
 * registry it reads. Nothing else is exempt. */
const SELF = new Set([
  'scripts/guards/proper-nouns-intact.mjs',
  'scripts/guards/lib/proper-nouns.mjs',
])

function walk(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry === 'dist') continue
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (EXT.test(entry)) out.push(p)
  }
  return out
}

const files = []
for (const root of ROOTS) walk(root, files)

const corrupted = []
const seenNames = new Set()
const unresolvedSeen = new Map()
const unresolvedTexts = UNRESOLVED.map((u) => u.text)

for (const file of files) {
  const rel = file.replaceAll(SEP, '/')
  if (SELF.has(rel)) continue

  const src = readFileSync(file, 'utf8')

  for (const entry of PROPER_NOUNS) {
    if (src.includes(entry.name)) seenNames.add(entry.name)
  }

  if (!CORRUPTION.test(src)) continue

  const lines = src.split(String.fromCharCode(10))
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (!CORRUPTION.test(line)) continue

    const known = unresolvedTexts.find((t) => line.includes(t))
    if (known) {
      unresolvedSeen.set(known, (unresolvedSeen.get(known) || 0) + 1)
      continue
    }
    corrupted.push({ file: rel, line: i + 1, text: line.trim().slice(0, 120) })
  }
}

const missing = PROPER_NOUNS.filter((e) => !seenNames.has(e.name))
const staleUnresolved = UNRESOLVED.filter((u) => !unresolvedSeen.has(u.text))

const say = (s = '') => process.stdout.write(s + String.fromCharCode(10))

say('proper-nouns-intact: ' + files.length + ' file(s) under ' + ROOTS.join(', '))
say('  registry: ' + PROPER_NOUNS.length + ' verified name(s), all sourced')
say('  awaiting a founder ruling: ' + UNRESOLVED.length + ' occurrence(s)')

declareWork('proper-nouns-intact', {
  did: {
    'source file read': files.length,
    'registered organisation name checked': PROPER_NOUNS.length,
  },
  found: {
    'corrupted organisation name': corrupted.length,
    'registry entry matching nothing': missing.length,
    'stale entry': staleUnresolved.length,
  },
})

let failed = false

if (corrupted.length > 0) {
  failed = true
  say('')
  say('FAIL: a real organisation name is corrupted in ' + corrupted.length + ' place(s).')
  say('The word "multicommunity" is not English. A find-and-replace of the banned')
  say('word has walked into a proper noun again. Proper nouns are EXEMPT from that')
  say('ban by founder ruling of 3 September 2026.')
  say('')
  for (const c of corrupted) say('  ' + c.file + ':' + c.line + '  ' + c.text)
  say('')
  say('Fix by restoring the real name. Confirm it against the organisation own')
  say('published page first, and record the source in')
  say('scripts/guards/lib/proper-nouns.mjs. Do not guess a name.')
}

if (missing.length > 0) {
  failed = true
  say('')
  say('FAIL: ' + missing.length + ' registered name(s) match nothing in the tree.')
  say('An entry that excuses nothing is an entry nobody has read. Either the name')
  say('was removed from the copy, in which case delete the entry, or it was')
  say('corrupted into a form this guard did not recognise.')
  say('')
  for (const m of missing) say('  ' + m.name + '  (' + m.source + ')')
}

if (staleUnresolved.length > 0) {
  failed = true
  say('')
  say('FAIL: ' + staleUnresolved.length + ' unresolved entr(y/ies) no longer match.')
  say('The copy was fixed but the list was not pruned. Delete the entry so the')
  say('list keeps shrinking and cannot become a permanent excuse.')
  say('')
  for (const s of staleUnresolved) say('  ' + s.text + '  (' + s.file + ':' + s.line + ')')
}

if (failed) process.exit(1)

say('')
say('PASS: every registered organisation name is intact.')
for (const e of PROPER_NOUNS) say('  ok  ' + e.name)
if (UNRESOLVED.length > 0) {
  say('')
  say('STILL AWAITING A FOUNDER RULING, not corruption this guard can fix:')
  for (const u of UNRESOLVED) say('  ' + u.file + ':' + u.line + '  ' + u.text)
}
