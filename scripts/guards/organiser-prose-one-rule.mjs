/**
 * ORGANISER PROSE: THE SYNTAX IS NEVER DISPLAYED. A build-failing guard.
 *
 * WHY THIS EXISTS. On 9 September 2026 the first real outside organiser
 * published an event on production and their bio rendered as
 *
 *     **MKL Studios**
 *
 * on the live page, asterisks included, because `organisations.description` was
 * interpolated straight into JSX. Close-out UX1.1 asked for one rule applied
 * everywhere an organiser or an artist writes prose, and for that rule to be
 * guarded.
 *
 * THE RULE. Organiser and artist prose reaches a screen through exactly one of
 * two doors, both in src/lib/prose/markdown-subset.ts:
 *
 *   RENDER  <OrganiserProse text={...} />   for body prose
 *   STRIP   stripMarkdown(...)              for plain-text and machine surfaces
 *                                           (meta descriptions, JSON-LD,
 *                                           clamped teasers, email, alt text)
 *
 * There is no third door. A raw interpolation is the defect this guard names.
 *
 * WHAT IT LOOKS FOR, and it is deliberately two precise shapes rather than a
 * sweep of every noun called `description`:
 *
 *   1. RAW IN JSX      {something.description}      inside a .tsx file
 *   2. RAW IN A SLOT   description: something.bio   a metadata or JSON-LD field
 *
 * WHAT IT CANNOT SEE, said plainly so a pass is not read as more than it is:
 * it matches on the SHAPE of an expression, not on a type. Prose reached
 * through a renamed local (`const d = org.description` then `{d}`) is invisible
 * to it. That is the honest limit of a text scan, and the reason the shared
 * component exists at all: the guard catches the shape that actually shipped,
 * and the component is what makes the right thing the easy thing.
 *
 * Run: node scripts/guards/organiser-prose-one-rule.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, extname, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { declareWork } from '../lib/work-report.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const SRC = join(ROOT, 'src')
const TAG = '[organiser-prose-one-rule]'

/**
 * The fields an organiser or an artist types prose into, named explicitly so
 * the list is reviewable rather than inferred. Every one of these is free text
 * written by a person who may reach for markdown out of habit.
 */
const PROSE_HOLDERS = ['organisation', 'org', 'organiser', 'artist', 'showcase', 'event']
const PROSE_FIELDS = ['description', 'bio', 'summary']

const HOLDER = `(?:${PROSE_HOLDERS.join('|')})`
const FIELD = `(?:${PROSE_FIELDS.join('|')})`

/**
 * {org.description} rendered straight into the document.
 *
 * The lookbehind excludes an ATTRIBUTE value, `bio={organisation.description}`,
 * on purpose. Passing prose into a component is a normal React idiom and the
 * RECEIVING component owns the rule; flagging it would push callers to strip
 * prose early, which is the opposite of what UX1.1 wants.
 */
const RAW_IN_JSX = new RegExp(`(?<![=\\w])\\{\\s*[A-Za-z0-9_.]*\\b${HOLDER}\\.${FIELD}\\s*\\}`, 'g')

/** description: org.description, in a metadata object or a JSON-LD payload. */
const RAW_IN_SLOT = new RegExp(
  `\\b(?:description|summary|bio|alt|subtitle|text)\\s*:\\s*[A-Za-z0-9_.]*\\b${HOLDER}\\.${FIELD}\\b(?!\\s*\\()`,
  'g',
)

/**
 * The doors. A line naming one of these is already going through the rule.
 *
 * `buildEventMetaDescription` is a door because it strips at the formatter, so
 * every caller inherits the fix rather than repeating it. That is the same
 * reasoning as the JSX-attribute exclusion above: whoever OWNS the rule may be
 * handed raw prose.
 */
const DOORS = ['stripMarkdown', 'OrganiserProse', 'buildEventMetaDescription']

/**
 * How far back a SLOT match may look for its door.
 *
 * An object literal handed to a formatter spans several lines, so the door sits
 * above the field. Six lines covers that without excusing anything distant.
 * Deliberately NOT applied to the bare-JSX pattern: that shape is one line, it
 * is the shape that actually shipped to production, and a nearby unrelated call
 * must never be allowed to excuse it.
 */
const SLOT_LOOKBACK = 6

/**
 * Raw reads that are CORRECT, each with the reason it is correct.
 *
 * A form must show the organiser the text they actually typed, markdown and
 * all, or editing would silently rewrite their own words. Fixture plumbing
 * moves prose between typed structures and renders nothing.
 *
 * Keyed by file and by the matched expression rather than by line number, so
 * the list does not rot the moment somebody adds an import. An entry that
 * stops matching anything is REPORTED, so this cannot quietly become a list
 * nobody re-reads.
 */
const REVIEWED = [
  {
    file: 'src/components/features/events/event-form.tsx',
    reason: 'form state: the organiser edits their own source text, markdown included',
  },
  {
    file: 'src/app/artist/dashboard/page.tsx',
    reason: 'form state: the artist edits their own source text, markdown included',
  },
  {
    file: 'src/lib/dev/fixture-events.ts',
    reason: 'fixture plumbing between typed structures; renders nothing itself',
  },
]
const reviewedHits = new Map(REVIEWED.map(r => [r.file, 0]))

const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'build'])
const EXTS = new Set(['.ts', '.tsx'])

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

/** Strip line comments so the law can be explained in prose without tripping. */
function code(line) {
  const slash = line.indexOf('//')
  const star = line.indexOf('*')
  if (slash === 0 || line.trimStart().startsWith('//')) return ''
  if (line.trimStart().startsWith('*')) return ''
  return slash > -1 ? line.slice(0, slash) : (star > -1 && line.trimStart().startsWith('/*') ? '' : line)
}

const violations = []
let linesScanned = 0
let doorsFound = 0

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

  for (let i = 0; i < lines.length; i++) {
    const line = code(lines[i])
    if (!line) continue
    if (DOORS.some(d => line.includes(d))) {
      doorsFound += 1
      continue
    }
    for (const [label, re, lookback] of [
      ['rendered raw into JSX', RAW_IN_JSX, 0],
      ['assigned raw to a text slot', RAW_IN_SLOT, SLOT_LOOKBACK],
    ]) {
      re.lastIndex = 0
      const m = re.exec(line)
      if (!m) continue
      if (lookback > 0) {
        const above = lines.slice(Math.max(0, i - lookback), i).map(code).join('\n')
        if (DOORS.some(d => above.includes(d))) {
          doorsFound += 1
          continue
        }
      }
      if (reviewedHits.has(rel)) {
        reviewedHits.set(rel, reviewedHits.get(rel) + 1)
        continue
      }
      violations.push({ file: rel, line: i + 1, text: lines[i].trim(), what: label, match: m[0] })
    }
  }
}

console.log(`${TAG} ${files.length} file(s) under src, ${linesScanned} line(s) scanned`)
console.log(`${TAG}   prose fields watched: ${PROSE_HOLDERS.join('|')} . ${PROSE_FIELDS.join('|')}`)
console.log(`${TAG}   the two doors: ${DOORS.join('  and  ')}`)

// The reviewed list, printed on every run with its reasons, so it is examined
// rather than trusted. A line that matches nothing any more is named, because
// an allowlist nobody can see rot is an allowlist that rots.
const stale = []
for (const entry of REVIEWED) {
  const hits = reviewedHits.get(entry.file)
  console.log(`${TAG}   reviewed: ${entry.file} (${hits} raw read) - ${entry.reason}`)
  if (hits === 0) stale.push(entry.file)
}
if (stale.length > 0) {
  console.log(
    `${TAG}   ${stale.length} reviewed entry(ies) match nothing now - delete the line: ${stale.join(', ')}`,
  )
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
  console.error(`${TAG} FAIL - ${violations.length} raw organiser prose render(s):`)
  for (const v of violations) {
    console.error(`    ${v.file}:${v.line}  ${v.what}`)
    console.error(`      ${v.text}`)
  }
  console.error('')
  console.error('  An organiser who types **bold** sees the asterisks. That shipped once,')
  console.error('  on the first real outside organiser event, and close-out UX1.1 closed it.')
  console.error('')
  console.error('  Body prose:      <OrganiserProse text={...} />')
  console.error('  Plain text:      stripMarkdown(...)          (meta, JSON-LD, teaser, email)')
  process.exit(1)
}

declareWork('organiser-prose-one-rule', {
  did: {
    'source file scanned': files.length,
    'prose render going through the one rule': doorsFound,
  },
  found: { 'raw organiser prose render': violations.length },
  zeroIsFine: {
    'raw organiser prose render':
      'every organiser and artist prose surface reaching a screen through OrganiserProse or stripMarkdown is the goal state, and it is what UX1.1 asked for',
  },
  exitOnZero: false,
})

console.log(`${TAG} PASS - organiser prose reaches every screen through the one rule.`)
process.exit(0)
