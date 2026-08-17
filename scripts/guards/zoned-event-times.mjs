/**
 * AN EVENT TIME IS CONVERTED IN THE EVENT'S ZONE, NEVER THE RUNTIME'S.
 *
 * THE DEFECT THIS GUARDS, 18 August 2026. An organiser typed 12:00 pm on
 * 1 September and the page showed 2:00 am. A second event, 15 October, entered
 * at 7:00 pm, read 7:00 pm correctly. The inconsistency was the finding.
 *
 * `<input type="datetime-local">` yields a ZONELESS string, "2026-09-01T12:00",
 * and ECMAScript specifies that a zoneless date-time is read as the RUNTIME's
 * local time. So `new Date(formData.start_date).toISOString()` silently used the
 * BROWSER's offset while the organiser was choosing a zone from a dropdown that
 * nothing consulted. Loading an event back into the form had the mirror defect,
 * slicing the stored UTC instant straight into the input, so every save moved the
 * event one offset earlier and a create was only accidentally right when the
 * browser's zone matched the event's.
 *
 * WHY A STATIC GUARD AND NOT ONLY TESTS. The behavioural tests are exhaustive
 * across both DST boundaries, but they can only test the converters. What they
 * cannot see is a NEW form field, or a future edit, going back to
 * `new Date(someLocalString)`. That reintroduces the defect somewhere the tests
 * do not look, and it is invisible on any machine whose zone happens to match:
 * when this guard's own drill was run, every Sydney assertion still passed on a
 * Sydney machine and only Perth and Brisbane failed. A developer in Sydney can
 * reintroduce this and see nothing.
 *
 * WHAT IT CANNOT SEE, plainly: it reads source text. It cannot prove a converter
 * is called with the right zone, only that the raw unzoned conversion is not
 * used on a datetime-local value. The behavioural cover is
 * tests/unit/dates/zoned-input-round-trip.test.ts and venue-timezone.test.ts.
 *
 * IT PRINTS WHAT IT SCANNED on every run, and FAILS if it scanned nothing.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SRC = join(ROOT, 'src')

const failures = []

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, acc)
    else if (/\.tsx?$/.test(entry)) acc.push(full)
  }
  return acc
}

const files = walk(SRC)
const rel = (f) => relative(ROOT, f).replace(/\\/g, '/')

// The converters themselves must use raw Date arithmetic; that is their job.
const CONVERTER = 'src/lib/dates/event-time.ts'

/* ---------------------------------------------------------------------------
 * 1. A form that renders a datetime-local input must not round-trip its value
 *    through the unzoned `new Date(...)`.
 * ------------------------------------------------------------------------- */
let formsScanned = 0
let inputsFound = 0
let boundValuesChecked = 0

/**
 * Comment lines are not code. The first version of this guard flagged its own
 * documentation, because the comment explaining the defect quoted the defect.
 * Only whole-line comments are dropped, never a fragment mid-line, so nothing
 * real can hide behind a trailing `//`.
 */
function codeOnly(src) {
  return src
    .split(/\r?\n/)
    .filter((line) => {
      const t = line.trim()
      return !(t.startsWith('*') || t.startsWith('//') || t.startsWith('/*'))
    })
    .join('\n')
}

for (const file of files) {
  const raw = readFileSync(file, 'utf8')
  if (!raw.includes('datetime-local')) continue
  const src = codeOnly(raw)
  formsScanned += 1
  inputsFound += (raw.match(/type="datetime-local"/g) ?? []).length

  /*
   * BIND TO THE INPUTS, do not guess at names. The first version pattern-matched
   * `formData.start_date` and friends, and missed post-gig-form.tsx entirely
   * because its state is called `eventDate`, and missed discounts-client.tsx
   * because it sent the raw string with no conversion at all. Every one of those
   * was the same defect. So: find what each datetime-local input is BOUND to,
   * then judge what the file does with exactly those values.
   */
  const bound = new Set()
  for (const m of src.matchAll(/type="datetime-local"[^>]*?value=\{([^}]+)\}/gs)) {
    bound.add(m[1].trim())
  }
  for (const m of src.matchAll(/value=\{([^}]+)\}[^>]*?type="datetime-local"/gs)) {
    bound.add(m[1].trim())
  }

  for (const expr of bound) {
    boundValuesChecked += 1
    // The leaf, so `form.valid_from` also matches a later `form.valid_from`.
    const leaf = expr.split('.').pop().replace(/[^\w]/g, '')
    if (!leaf) continue
    const unzonedWrite = new RegExp(
      String.raw`new Date\(\s*[\w.]*\b${leaf}\b\s*\)\s*\.toISOString\(\)`,
    )
    if (unzonedWrite.test(src)) {
      failures.push(
        `${rel(file)}: "${expr}" is a datetime-local value converted with new Date(...).toISOString(), ` +
          `which uses the RUNTIME's offset, not the event's zone. Use fromZonedInputValue(value, timezone).`,
      )
    }
    // Sent raw, with no conversion at all: Postgres then reads the wall clock as
    // UTC. discounts-client did exactly this, so a code set to open at noon
    // opened at 11pm the night before.
    const sentRaw = new RegExp(String.raw`:\s*[\w.]*\b${leaf}\b\s*\|\|\s*null`)
    if (sentRaw.test(src)) {
      failures.push(
        `${rel(file)}: "${expr}" is sent to the database as a raw wall-clock string with no zone. ` +
          `Postgres reads it as UTC. Use fromZonedInputValue(value, timezone).`,
      )
    }
  }

  const readShape = /new Date\(\s*[\w.]*(?:start|end|sale)\w*\s*\)\s*\.toISOString\(\)\s*\.slice\(\s*0\s*,\s*16\s*\)/gi
  for (const m of src.match(readShape) ?? []) {
    failures.push(
      `${rel(file)}: "${m}" slices a stored UTC instant into a local input, so the organiser is ` +
        `shown a UTC wall clock labelled as their own time. Use toZonedInputValue(iso, timezone).`,
    )
  }
}

console.log(
  `[zoned-event-times] scanned ${files.length} TypeScript file(s); ${formsScanned} render a datetime-local input, ` +
    `${inputsFound} input(s), ${boundValuesChecked} bound value(s) traced to their conversion`,
)
if (boundValuesChecked === 0) {
  failures.push(
    'ZERO datetime-local inputs were traced to a bound value. The guard can no longer see what ' +
      'the date fields are bound to, so it is passing without checking anything.',
  )
}
if (formsScanned === 0) {
  failures.push(
    'ZERO datetime-local inputs found. The organiser form has date fields, so this guard is no ' +
      'longer looking where they are, and a guard that scans nothing passes everything.',
  )
}

/* ---------------------------------------------------------------------------
 * 2. The converters exist, are exported, and consult the zone.
 * ------------------------------------------------------------------------- */
const converterSrc = readFileSync(join(ROOT, CONVERTER), 'utf8')
const required = ['export function fromZonedInputValue', 'export function toZonedInputValue', 'function zoneOffsetMs']
let convertersVerified = 0
for (const decl of required) {
  if (!converterSrc.includes(decl)) {
    failures.push(`${CONVERTER}: ${decl} is missing, so the zoned conversion has no implementation`)
  } else {
    convertersVerified += 1
  }
}

// The offset must be asked of the zone AT THE INSTANT, not carried as a
// constant. A fixed offset is right on one side of a DST change and wrong on the
// other, which is the failure the two reported events straddled.
if (!/formatToParts/.test(converterSrc)) {
  failures.push(
    `${CONVERTER}: the offset is not derived from Intl.formatToParts, so it cannot know the ` +
      `transition dates. A constant offset is silently wrong for half the year.`,
  )
}
if (/[+-]\s*(?:10|11)\s*\*\s*60\s*\*\s*60\s*\*\s*1000/.test(converterSrc)) {
  failures.push(
    `${CONVERTER}: a hardcoded Australian eastern offset appears in the converter. The whole ` +
      `point is that the offset changes on 4 October and again in April.`,
  )
}
console.log(
  `[zoned-event-times] verified ${convertersVerified}/${required.length} converter declaration(s), offset derived from Intl rather than a constant`,
)

/* ---------------------------------------------------------------------------
 * 3. The event's zone is resolved from the VENUE, not from the browser.
 * ------------------------------------------------------------------------- */
let browserZoneReads = 0
for (const file of files) {
  const r = rel(file)
  const src = codeOnly(readFileSync(file, 'utf8'))
  if (!/resolvedOptions\(\)\.timeZone/.test(src)) continue
  browserZoneReads += 1
  // Reading the browser zone to DISPLAY something to the reader is fine. Using
  // it to decide an EVENT's zone is the Geelong-reads-Sydney defect.
  if (/set\(\s*'timezone'|timezone:\s*Intl/.test(src)) {
    failures.push(
      `${r}: seeds an EVENT's timezone from the browser. Windows carries one setting for the ` +
        `whole eastern seaboard and it resolves to Australia/Sydney, so a Geelong event is ` +
        `stored as Sydney. Resolve it from the venue: see timezoneForVenue.`,
    )
  }
}
console.log(
  `[zoned-event-times] checked ${browserZoneReads} file(s) that read the browser zone; none may decide an event's zone`,
)

if (failures.length > 0) {
  console.error(
    `\n[zoned-event-times] FAILED. ${failures.length} way(s) an event time can be stored or shown ` +
      `in the wrong zone.\n`,
  )
  for (const f of failures) console.error(`    ${f}\n`)
  process.exit(1)
}

console.log('[zoned-event-times] PASS - what an organiser types is what a buyer reads, in the event\'s zone.')
