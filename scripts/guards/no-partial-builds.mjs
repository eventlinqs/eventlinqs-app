/**
 * NO PARTIAL BUILDS. Founder ruling, 15 August 2026.
 *
 * "Nothing on this platform stays partially built." This fails the build on the
 * marks a half-finished thing leaves behind:
 *
 *   1. TODO, FIXME, HACK, XXX markers in a shipped path
 *   2. a thrown "not implemented"
 *   3. a feature flag with no owner and no dated decision
 *   4. a stub or hardcoded placeholder where a real value belongs
 *   5. a "post-launch", "later" or "temporary" comment in a shipped path
 *
 * WHAT IT CANNOT SEE, and this list is the honest boundary of the guard:
 *
 *   - IT CANNOT TELL FINISHED FROM UNFINISHED. It reads marks, not behaviour. A
 *     feature can be entirely absent with no marker anywhere and this guard is
 *     silent. The audit walk and the tests are what find that.
 *   - IT CANNOT JUDGE PROSE. A comment saying "this is deliberate, post-launch
 *     work is tracked in X" is indistinguishable from a comment deferring
 *     something quietly, except by the DATE and OWNER convention below.
 *   - IT DOES NOT READ NON-CODE. Markdown, JSON and SQL are excluded: docs are
 *     where deferred work is SUPPOSED to be recorded, and failing on that would
 *     push the record out of the repository.
 *   - IT CANNOT SEE A PLACEHOLDER THAT LOOKS LIKE A REAL VALUE. A hardcoded
 *     `29.99` or a fake email that happens to parse is invisible here.
 *   - TESTS ARE EXCLUDED from the placeholder rules. A test's whole job is to
 *     supply fixture values.
 *
 * THE ESCAPE HATCH, and why it is shaped this way. A deferral is a DECISION, and
 * a decision has an owner and a date. So a marker is allowed only when it is
 * followed on the same line by both, in this exact shape:
 *
 *     // TODO(lawal 2026-09-01): re-enable once the photo spine lands
 *
 * That is deliberately harder than a bare TODO. An undated, unowned marker is
 * indistinguishable from something somebody forgot, which is the whole problem.
 *
 * Run standalone (report only, never fails):
 *   node scripts/guards/no-partial-builds.mjs --report
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const REPORT_ONLY = process.argv.includes('--report')

/** Shipped code only. Docs are where deferrals are supposed to live. */
const SCAN_DIRS = ['src', 'scripts']
const CODE_EXT = new Set(['.ts', '.tsx', '.mjs', '.js', '.jsx'])

/** Directories that never ship. */
const SKIP_DIR = new Set(['node_modules', '.next', 'dist', 'build', '__snapshots__'])

/**
 * A marker is EXEMPT when it names an owner and a date on the same line.
 * `TODO(lawal 2026-09-01):` or `FIXME(lawal 2026-09-01):`
 */
const OWNED_AND_DATED = /\((?:[a-z][a-z.\- ]{1,30})\s+\d{4}-\d{2}-\d{2}\)/i

const RULES = [
  {
    name: 'marker',
    // Word-boundary so `TODOS` in prose or a variable called `hack` does not fire.
    re: /(?:^|[^A-Za-z])(TODO|FIXME|HACK|XXX)(?:[^A-Za-z]|$)/,
    /*
     * NOT an HTML placeholder attribute. `placeholder="+61 4XX XXX XXX"` is a
     * real, finished input hint and it matched XXX three times on the first run.
     * A guard that fires on finished work is how a guard gets disabled.
     */
    reject: /placeholder\s*=|aria-|pattern\s*=/i,
    why: 'an unowned, undated marker is indistinguishable from something forgotten',
  },
  {
    name: 'not-implemented',
    re: /throw new (?:Error|TypeError)\(\s*['"`][^'"`]*not[ _-]?implemented/i,
    why: 'a thrown "not implemented" is an unbuilt path that ships',
  },
  {
    name: 'deferral-comment',
    // Only in a COMMENT, and only the words that mean "not now".
    //
    // "come back to" and "later on" were removed after the first run: both fired
    // on ordinary English in JSDoc ("the path to come back to, so a switch keeps
    // the organiser where they are"), which is a description of behaviour rather
    // than a deferral. A rule that fires on prose gets the whole guard switched
    // off, so it is narrowed to phrases that can only mean postponement.
    re: /(?:\/\/|\*)\s*[^\n]*\b(post[- ]launch|for the moment|temporar(?:y|ily)|revisit later|fix later|wire (?:this )?up later|to be implemented)\b/i,
    why: 'a deferral in a shipped path with no owner and no date',
  },
  {
    name: 'placeholder-value',
    re: /(lorem ipsum|sample event \d|placeholder@|example@example|CHANGE_?ME|YOUR_[A-Z_]+_HERE)/i,
    why: 'a placeholder where a real value belongs',
    skipTests: true,
  },
  {
    name: 'placeholder-copy',
    /*
     * "Coming soon" as RENDERED COPY, which Law 1 names a defect. It must not
     * fire on a COMMENT that quotes the phrase to explain why it was removed:
     * four such comments exist and every one of them documents a fix. So this
     * matches the phrase only inside a JSX text node or a string literal, and
     * the line must not be a comment.
     */
    re: /(?:>|['"`])[^<'"`]*\bcoming soon\b/i,
    reject: /^\s*(?:\/\/|\*|\/\*|\{\/\*)/,
    why: 'placeholder copy on a shipped surface (Law 1)',
    skipTests: true,
  },
]

/** Feature-flag call sites. */
const FLAG_DECL = /(?:isFeatureEnabled|FEATURE_FLAGS|featureFlag|flags?\.)\s*[([]\s*['"`]([a-z0-9_]+)['"`]/gi

/**
 * THE FLAG DECISION REGISTRY.
 *
 * A flag is a single decision with a single owner. The first version of this
 * rule asked for a date in the file containing each CALL, which produced 41 hits
 * across about thirty files and could have been silenced by pasting a date
 * comment into every one of them. Thirty copies of a decision rot independently,
 * so the requirement moved to where the decision belongs: beside the flag.
 *
 * `src/lib/flags/broadcast.ts` exports BROADCAST_FLAG_DECISIONS, one entry per
 * flag, each carrying an owner and an ISO date. A call site is satisfied when
 * its flag has an entry there. A flag with no entry fails the build, which is
 * the case worth catching: a switch nobody decided.
 */
const DECISION_REGISTRY = 'src/lib/flags/broadcast.ts'
const DECISION_ENTRY = /^\s*([a-z0-9_]+)\s*:\s*['"`][^'"`]*\b[a-z][a-z.\- ]{1,30}\s+\d{4}-\d{2}-\d{2}/gim

function readDecidedFlags() {
  const decided = new Set()
  let src
  try {
    src = readFileSync(path.join(ROOT, DECISION_REGISTRY), 'utf8')
  } catch {
    return decided
  }
  for (const m of src.matchAll(DECISION_ENTRY)) decided.add(m[1])
  return decided
}

/**
 * DETECTOR FILES: excluded from the placeholder, marker and deferral rules.
 *
 * These files exist to DEFINE the very patterns this guard looks for, so their
 * regex literals matched their own subject matter. On the first run that produced
 * five hits which were all the same joke: `copy-tell-gate.mjs` was reported for
 * containing the string "lorem ipsum" inside the rule that BANS lorem ipsum, and
 * for quoting the constitution line "not a stub to fix later" while explaining
 * why placeholder copy is a defect. `no-partial-builds.mjs` already skipped
 * itself for exactly this reason; the exemption was simply too narrow, because
 * it is not the only detector in the tree.
 *
 * Listed explicitly rather than inferred, and printed on every run, so the list
 * cannot quietly grow into a way of hiding real work.
 */
const DETECTOR_FILES = new Set([
  'scripts/guards/no-partial-builds.mjs',
  'scripts/guards/no-plaintext-credential.mjs',
  'scripts/guards/one-fee-copy.mjs',
  'scripts/copy-tell-gate.mjs',
  'scripts/sweep/walk.mjs',
])

function walk(dir, out = []) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const entry of entries) {
    if (SKIP_DIR.has(entry)) continue
    const full = path.join(dir, entry)
    let st
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (st.isDirectory()) walk(full, out)
    else if (CODE_EXT.has(path.extname(entry))) out.push(full)
  }
  return out
}

const files = SCAN_DIRS.flatMap(d => walk(path.join(ROOT, d)))
const hits = []

for (const file of files) {
  const rel = path.relative(ROOT, file).split('\\').join('/')
  const isTest = /(^|\/)tests?\//.test(rel) || /\.test\.|\.spec\./.test(rel)
  // A detector has to name the very words it bans. See DETECTOR_FILES.
  if (DETECTOR_FILES.has(rel)) continue

  let src
  try {
    src = readFileSync(file, 'utf8')
  } catch {
    continue
  }
  const lines = src.split(/\r?\n/)

  lines.forEach((line, i) => {
    for (const rule of RULES) {
      if (rule.skipTests && isTest) continue
      if (!rule.re.test(line)) continue
      if (rule.reject && rule.reject.test(line)) continue
      if (OWNED_AND_DATED.test(line)) continue
      hits.push({ file: rel, line: i + 1, rule: rule.name, why: rule.why, text: line.trim().slice(0, 120) })
    }
  })
}

/* Feature flags with no dated decision in the registry. */
const decidedFlags = readDecidedFlags()
for (const file of files) {
  const rel = path.relative(ROOT, file).split('\\').join('/')
  if (DETECTOR_FILES.has(rel)) continue
  let src
  try {
    src = readFileSync(file, 'utf8')
  } catch {
    continue
  }
  for (const m of src.matchAll(FLAG_DECL)) {
    const flag = m[1]
    if (decidedFlags.has(flag)) continue
    const line = src.slice(0, m.index).split(/\r?\n/).length
    hits.push({
      file: rel,
      line,
      rule: 'undated-flag',
      why: `feature flag "${flag}" has no owner-and-dated decision in ${DECISION_REGISTRY}`,
      text: m[0].slice(0, 120),
    })
  }
}

const byRule = new Map()
for (const h of hits) byRule.set(h.rule, (byRule.get(h.rule) ?? 0) + 1)

console.log(`[no-partial-builds] scanned ${files.length} file(s) under ${SCAN_DIRS.join(', ')}`)
console.log(
  `[no-partial-builds] flag decisions read from ${DECISION_REGISTRY}: ` +
    `${[...decidedFlags].sort().join(', ') || '(none)'}`,
)
console.log(`[no-partial-builds] detector files exempt by design: ${[...DETECTOR_FILES].join(', ')}`)
for (const [rule, n] of [...byRule].sort((a, b) => b[1] - a[1])) {
  console.log(`[no-partial-builds]   ${String(n).padStart(5)}  ${rule}`)
}

if (hits.length === 0) {
  console.log('[no-partial-builds] PASS - nothing partially built in a shipped path.')
  process.exit(0)
}

const show = REPORT_ONLY ? hits : hits.slice(0, 60)
console.log('')
for (const h of show) {
  console.log(`  ${h.file}:${h.line}  [${h.rule}]  ${h.text}`)
}
if (!REPORT_ONLY && hits.length > show.length) {
  console.log(`  ... and ${hits.length - show.length} more`)
}

if (REPORT_ONLY) {
  console.log(`\n[no-partial-builds] REPORT ONLY, ${hits.length} hit(s). Not failing.`)
  process.exit(0)
}

console.error(`\n[no-partial-builds] FAILED. ${hits.length} partial-build marker(s) in a shipped path.`)
console.error('  Each is one of: finish it, or record the decision with an owner and a date:')
console.error('      // TODO(lawal 2026-09-01): reason')
console.error('  An undated, unowned marker is indistinguishable from something forgotten.')
process.exit(1)
