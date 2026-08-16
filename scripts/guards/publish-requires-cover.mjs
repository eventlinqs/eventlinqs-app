/**
 * BUILD-FAILING GUARD: publish is refused without a cover.
 *
 * THE RULE. Every event that reaches `status = 'published'` carries a real
 * cover image. Not a null, not an empty string, and not a picsum placeholder.
 * It is the platform's photo-required rule and it is why a browse surface never
 * shows a grey rectangle where a night should be.
 *
 * THE HOLE THIS CLASS ALREADY PRODUCED ONCE, recorded so the guard is read as
 * evidence rather than as ceremony. The gate's condition used to begin
 * `'coverImageUrl' in input`, so a caller that simply OMITTED the key skipped
 * the check in silence and published an event with no cover. The requirement
 * was real, was documented, was tested, and was opt-in by accident. That is
 * exactly the family this repository keeps finding: the thing that reports the
 * outcome was not the thing that did the work.
 *
 * FOUR THINGS ARE CHECKED, because the rule has four load-bearing parts and
 * removing any one of them leaves the other three looking healthy:
 *
 *   1. THE PREDICATE EXISTS and still rejects the three non-covers.
 *   2. THE FIELD IS REQUIRED BY THE TYPE. `coverImageUrl?:` would restore the
 *      omission hole exactly, and nothing else in the tree would go red.
 *   3. THE REFUSAL COMES FIRST, before any path that can return ok. A cover
 *      check sitting after an early success is a check that does not run.
 *   4. EVERY PUBLISH SITE IS COVERED. The site list is DERIVED by scanning the
 *      tree for writes to events that mention published, so a new publish path
 *      written next month is caught on the day it is written rather than on the
 *      day somebody remembers this file exists.
 *
 * AND THE BACKSTOP: the validated database constraint. The application gate can
 * be edited; the constraint cannot be bypassed by any code path at all, which
 * is why the migration that ADDS it and the migration that VALIDATES it are
 * both asserted here. A constraint left NOT VALID checks new rows only, which
 * is a different and much weaker promise than the one being made.
 *
 * HOW MUCH WORK IT DID, PUBLISHED, per the standing lesson: the counts below
 * are printed on every run, and a publish-site scan that finds nothing FAILS
 * rather than passing quietly, because on this tree it must find at least the
 * organiser action, the scheduled-publish cron and the admin transition.
 *
 * Run by `npm run guards`, which `prebuild` invokes, so `npm run build` fails.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const ROOT = process.cwd()
const GATE = 'src/lib/events/publish-gate.ts'

/**
 * The floor on the derived publish-site scan. Three sites exist today. Zero
 * would mean the scan has stopped seeing the platform, and a guard that
 * inspects nothing prints the same PASS as one that inspects everything.
 */
const MIN_PUBLISH_SITES = 3

/**
 * Reviewed allowances: a file that writes to events and mentions published, and
 * legitimately does not need the cover gate. Each carries its reason and is
 * printed on every run. An entry matching nothing FAILS the build.
 */
const ALLOWANCES = [
  {
    file: 'src/lib/admin/organisers.ts',
    reason:
      'Transitions AWAY from published only (suspending an organiser moves their live events to paused). Reinstating does not auto-republish, so this path can never put an event live.',
  },
]

/** The database backstop, which no code path can bypass. */
const CONSTRAINT_MIGRATIONS = [
  {
    file: 'supabase/migrations/20260504000001_event_photo_required.sql',
    must: /ADD CONSTRAINT\s+events_published_real_cover/i,
    what: 'adds the events_published_real_cover constraint',
  },
  {
    file: 'supabase/migrations/20260509000010_validate_real_cover_constraint.sql',
    must: /VALIDATE CONSTRAINT\s+events_published_real_cover/i,
    what: 'VALIDATES it, so it binds existing rows and not merely new ones',
  },
]

const failures = []
const rel = (p) => relative(ROOT, p).split(sep).join('/')

/* ── 1, 2, 3: the gate itself ─────────────────────────────────────────────── */

let gateSrc = ''
try {
  gateSrc = readFileSync(join(ROOT, GATE), 'utf8')
} catch {
  failures.push(`${GATE} is missing. It is the publish gate; nothing else enforces the cover rule in code.`)
}

let predicateChecks = 0
if (gateSrc) {
  if (!/export function hasRealCover\(/.test(gateSrc)) {
    failures.push(`${GATE}: hasRealCover() is gone. It is the cover predicate the gate and the ranking share.`)
  }
  const predicate = [
    { re: /if \(!url\)/, what: 'a null or undefined cover' },
    { re: /trim\(\)\s*===\s*''/, what: 'an empty-string cover' },
    { re: /picsum/i, what: 'a picsum placeholder, which is not real imagery' },
  ]
  for (const p of predicate) {
    predicateChecks += 1
    if (!p.re.test(gateSrc)) {
      failures.push(`${GATE}: hasRealCover no longer rejects ${p.what}.`)
    }
  }

  if (/coverImageUrl\?\s*:/.test(gateSrc)) {
    failures.push(
      `${GATE}: coverImageUrl is OPTIONAL again (\`coverImageUrl?:\`).\n` +
        `          That is the exact hole that let a caller skip the cover check by omitting\n` +
        `          a field. It must be required by the type so omitting it fails to compile.`,
    )
  }
  if (!/coverImageUrl:\s*string \| null/.test(gateSrc)) {
    failures.push(
      `${GATE}: checkPublishGate no longer takes \`coverImageUrl: string | null\` as a required input.`,
    )
  }

  const fnAt = gateSrc.indexOf('export async function checkPublishGate(')
  if (fnAt === -1) {
    failures.push(`${GATE}: checkPublishGate() is gone.`)
  } else {
    const body = gateSrc.slice(fnAt)
    const refusalAt = body.indexOf("reason: 'cover_image_required'")
    const firstOkAt = body.indexOf('return { ok: true }')
    if (refusalAt === -1) {
      failures.push(`${GATE}: checkPublishGate no longer refuses with reason 'cover_image_required'.`)
    } else if (firstOkAt !== -1 && refusalAt > firstOkAt) {
      failures.push(
        `${GATE}: the cover refusal now sits AFTER a path that returns ok.\n` +
          `          A free event would reach that early success and publish with no cover.\n` +
          `          The cover check runs first, for free and paid events alike.`,
      )
    }
  }
}

/* ── 4: every publish site ────────────────────────────────────────────────── */

const files = []
;(function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full)
  }
})(join(ROOT, 'src'))

const allowanceHits = new Map(ALLOWANCES.map((a) => [a.file, 0]))
const publishSites = []
let gatedSites = 0

for (const full of files) {
  const src = readFileSync(full, 'utf8')
  const name = rel(full)
  const writesEvents =
    /\.from\(\s*'events'\s*\)/.test(src) && /\.(update|insert|upsert)\(/.test(src)
  if (!writesEvents) continue
  if (!/'published'/.test(src)) continue
  publishSites.push(name)

  if (allowanceHits.has(name)) {
    allowanceHits.set(name, allowanceHits.get(name) + 1)
    continue
  }
  if (/checkPublishGate\(/.test(src) || /hasRealCover\(/.test(src)) {
    gatedSites += 1
    continue
  }
  failures.push(
    `${name}: writes events.status and mentions 'published', and calls neither\n` +
      `          checkPublishGate() nor hasRealCover(). Either gate it, or add it to\n` +
      `          ALLOWANCES in this guard with the reason it cannot publish anything.`,
  )
}

if (publishSites.length < MIN_PUBLISH_SITES) {
  failures.push(
    `the publish-site scan found ${publishSites.length} site(s), floor is ${MIN_PUBLISH_SITES}.\n` +
      `          The organiser action, the scheduled-publish cron and the admin transition all\n` +
      `          exist, so a smaller number means this scan has stopped seeing the platform.`,
  )
}

for (const [file, hits] of allowanceHits) {
  if (hits === 0) failures.push(`STALE ALLOWANCE: ${file} matches nothing any more. Delete it.`)
}

/* ── The database backstop ────────────────────────────────────────────────── */

let migrationsVerified = 0
for (const m of CONSTRAINT_MIGRATIONS) {
  const full = join(ROOT, m.file)
  if (!existsSync(full)) {
    failures.push(`${m.file} is missing. It ${m.what}.`)
    continue
  }
  if (!m.must.test(readFileSync(full, 'utf8'))) {
    failures.push(`${m.file} no longer ${m.what}.`)
    continue
  }
  migrationsVerified += 1
}

if (failures.length > 0) {
  console.error('\n[publish-requires-cover] FAILED\n')
  for (const f of failures) console.error(`  ${f}\n`)
  console.error(
    `  ${failures.length} violation(s). An event published without a cover is a grey\n` +
      `  rectangle on the first surface a stranger sees, and the constitution's photo-required\n` +
      `  rule exists so that cannot happen.\n`,
  )
  process.exit(1)
}

console.log(
  `[publish-requires-cover] PASS - scanned ${files.length} source file(s); ` +
    `${publishSites.length} publish site(s) found, ${gatedSites} gated, ` +
    `${ALLOWANCES.length} reviewed allowance(s).`,
)
console.log(
  `[publish-requires-cover] gate: ${predicateChecks} predicate condition(s), ` +
    `field required, refusal ordered first. Backstop: ${migrationsVerified} of ` +
    `${CONSTRAINT_MIGRATIONS.length} constraint migration(s) verified.`,
)
for (const site of publishSites) console.log(`[publish-requires-cover]   site  ${site}`)
