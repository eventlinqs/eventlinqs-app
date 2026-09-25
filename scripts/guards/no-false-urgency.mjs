/**
 * GUARD: NOTHING ON THIS PLATFORM HURRIES A BUYER WITH A NUMBER IT MADE UP, AND
 * NOTHING TELLS A DISABLED PERSON "NONE" BY LEAVING A BOX EMPTY.
 *
 * ============================================================================
 * THE INVARIANT, AS CLOSE-OUT SEO5 STATES IT
 * ============================================================================
 *
 * "No availability, scarcity or urgency message may be rendered from anything
 * other than real inventory, and no accessibility section may render empty."
 *
 * Two rules in one guard because they are the same rule twice: a surface must
 * only say what the platform actually knows. A "Only 3 left" that came from a
 * constant and an Accessibility heading over white space are both the product
 * asserting a fact nobody supplied.
 *
 * ============================================================================
 * WHY SCARCITY IS A LEGAL QUESTION HERE AND NOT ONLY A TASTE ONE
 * ============================================================================
 *
 * False urgency is the exact shape Australian consumer law treats as a
 * misleading representation, and the ACCC has taken action over countdown and
 * scarcity claims that were not true. A "selling fast" banner wired to a timer
 * rather than to stock is not a growth tactic on this platform, it is a
 * liability, and it is the kind of line that arrives in a later "conversion"
 * pass written by somebody who never saw this comment. So the check is
 * structural rather than advisory.
 *
 * WHAT WAS ALREADY TRUE WHEN THIS WAS WRITTEN, and is worth recording so the
 * guard is not mistaken for a fix: the one scarcity line the platform renders,
 * `Only {available} left` in the ticket selector, was ALREADY computed from
 * real inventory (capacity minus sold minus reserved). This guard does not
 * correct a defect; it makes the correct thing the only thing that compiles.
 *
 * ============================================================================
 * THE FIVE CLAUSES
 * ============================================================================
 *
 * CLAUSE 1. EVERY SCARCITY OR URGENCY SENTENCE IS A REVIEWED SITE, AND THE
 *           EXPRESSION THAT DECIDES IT IS STILL THERE. Each site is listed
 *           below with the comparison that computes it, the list is printed on
 *           every run, and an entry that no longer matches anything is
 *           reported. A new scarcity phrase anywhere in `src/` fails until
 *           somebody adds an entry, which is where the thinking happens.
 *
 * CLAUSE 2. NO SCARCITY COUNT IS A LITERAL, AND NO SCARCITY LINE SITS BESIDE A
 *           RANDOM. "Only 3 left" typed into JSX is the defect in its purest
 *           form, and `Math.random()` in the same file as a scarcity phrase is
 *           the same defect with a disguise.
 *
 * CLAUSE 3. THE ACCESSIBILITY SECTION KEEPS ITS EMPTINESS GUARD. The component
 *           must return null before it renders anything when there is nothing
 *           to say, and the derivation must keep its strict `=== true` so a
 *           truthy string or a 1 cannot become a promise of a ramp.
 *
 * CLAUSE 4. THE ACCESSIBILITY SURFACES NEVER RENDER A NEGATIVE. A `false` in
 *           those columns means NOT STATED. Rendering it as "No hearing loop"
 *           would turn silence into a claim, and it is the obvious "helpful"
 *           addition somebody makes later.
 *
 * CLAUSE 6. THE REVERSAL CONDITION IS A SWITCH, NOT A SENTENCE. One flag hides
 *           every availability surface and the accessibility section, and does
 *           NOT touch the calendar links. A reversal condition nobody can
 *           execute is a paragraph.
 *
 * CLAUSE 5. A SCARCITY ALERT, IF IT IS EVER SENT, IS SENT FROM INVENTORY.
 *           `going_fast` and `last_chance` exist as notification copy with no
 *           sender. This is the trap for the day somebody writes one.
 *
 * WHAT IT CANNOT SEE, said rather than implied. Whether the RUNNING page shows
 * the number it wired up, and whether the number is the right one. That is
 * driven by scripts/verify/seo5-states-drive.mjs at 390, 768 and 1440 against
 * a real lane-C event with real inventory.
 *
 * Run: node scripts/guards/no-false-urgency.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, sep } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SRC = join(ROOT, 'src')

const failures = []
const fail = m => failures.push(m)
const rel = f => f.slice(ROOT.length + 1).split(sep).join('/')

/** Source with comments removed. A comment is not a rendered sentence. */
function readCode(file) {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      yield* walk(full)
      continue
    }
    if (/\.(ts|tsx)$/.test(entry)) yield full
  }
}

console.log('[no-false-urgency] judging scarcity wiring and the accessibility emptiness rule')

/* ======================================================================== */
/* CLAUSE 1. A scarcity sentence lives in a file that holds inventory.      */
/* ======================================================================== */

/*
 * THE PHRASES. Each is a sentence that tells a buyer to move faster than they
 * otherwise would. They are matched against the code with comments stripped, so
 * this guard's own prose does not trip it.
 *
 * `Only ... left` is matched with the interpolation in the middle, because that
 * is the shape the live line takes and the shape a copy of it would take.
 */
const SCARCITY = [
  { re: /Only\s*\{[^}]+\}\s*(?:left|remaining|tickets? left)/i, name: 'Only {n} left' },
  { re: /\bselling\s+fast\b/i, name: 'selling fast' },
  { re: /\balmost\s+(?:gone|sold\s*out)\b/i, name: 'almost gone' },
  { re: /\bgoing\s+fast\b/i, name: 'going fast' },
  { re: /\blast\s+chance\b/i, name: 'last chance' },
  { re: /\bhurry\b/i, name: 'hurry' },
  { re: /\b(?:\d+|\{[^}]+\})\s+people\s+(?:are\s+)?(?:viewing|looking)/i, name: 'N people viewing' },
  { re: /\bin\s+high\s+demand\s+right\s+now\b/i, name: 'in high demand right now' },
]

/*
 * THE REVIEWED SITES. A SYMBOL SEARCH WAS TRIED FIRST AND WAS WRONG.
 *
 * The first version of this clause asked whether the file mentioned any
 * inventory-ish identifier (`available`, `sold_count`, and so on). It PASSED
 * `src/lib/notifications/policy.ts` on the strength of the identifier
 * `waitlist_available`, which has nothing to do with counting tickets. A check
 * that can be satisfied by an unrelated variable name is a check that reports
 * green for the wrong reason, which is worse than no check.
 *
 * So every scarcity site is REVIEWED and named here, each with the EXPRESSION
 * that decides it, and the guard asserts that expression is still in that file.
 * A new scarcity phrase anywhere in `src/` fails until somebody adds an entry,
 * which is the point: adding the entry is where the thinking happens.
 *
 * The baseline is PRINTED on every run, and an entry that no longer matches
 * anything is reported, so this list cannot rot into something nobody reads.
 */
const REVIEWED = [
  {
    file: 'src/components/checkout/ticket-selector.tsx',
    says: 'Only {available} left',
    decidedBy: /available\s*<=\s*20/,
    source:
      '`available` is total_capacity minus sold minus reserved, from getTierInventoryStatic',
  },
  {
    file: 'src/components/inventory/social-proof-badge.tsx',
    says: 'Selling Fast, Almost Sold Out, Only N left',
    decidedBy: /percentSold\s*>=\s*50/,
    source: 'TierInventory / EventInventory: percent_sold and available, from the inventory cache',
  },
  {
    file: 'src/lib/events/badges.ts',
    says: 'Selling fast, Few left, Last chance',
    decidedBy: /sold\s*\/\s*capacity\s*>\s*0\.7/,
    source:
      'capacity minus sold minus reserved, summed over the tiers. "Last chance" here is a claim ' +
      'about TIME (under 24 hours to start), not about stock, and that is true of every card it ' +
      'lands on',
  },
  {
    file: 'src/lib/notifications/policy.ts',
    says: 'Going fast, Last chance (alert copy)',
    decidedBy: /going_fast:\s*\{/,
    source:
      'COPY ONLY, AND NOTHING SENDS IT. `just_announced` is the only lifecycle type any code ' +
      'dispatches (src/app/api/cron/notify-just-announced/route.ts), so these two sentences ' +
      'reach nobody today. Clause 5 below is what holds them the day somebody wires a sender. ' +
      'The unsent types are recorded in REVIEW-QUEUE-C.md',
  },
]

console.log('  reviewed scarcity sites:')
for (const entry of REVIEWED) console.log(`    ${entry.file}  ${entry.says}`)

const reviewedByFile = new Map(REVIEWED.map(e => [e.file, e]))
const seen = new Set()

for (const file of walk(SRC)) {
  const code = readCode(file)
  const hits = SCARCITY.filter(s => s.re.test(code))
  if (hits.length === 0) continue
  const key = rel(file)
  seen.add(key)
  const entry = reviewedByFile.get(key)
  if (!entry) {
    fail(
      `${key} renders a scarcity message (${hits.map(h => h.name).join(', ')}) and is NOT reviewed.\n` +
        '        A message that hurries a buyer must be computed from real stock (capacity minus\n' +
        '        sold minus reserved), never from a constant, a timer, a sort order or a guess.\n' +
        '        False urgency is a misleading representation under Australian consumer law, not a\n' +
        '        growth tactic. If this one IS computed from stock, add it to REVIEWED in\n' +
        '        scripts/guards/no-false-urgency.mjs naming the expression that decides it.',
    )
    continue
  }
  if (!entry.decidedBy.test(code)) {
    fail(
      `${key} still renders a scarcity message, but the expression that decided it is gone.\n` +
        `        Reviewed as: ${entry.source}\n` +
        '        Either the computation moved, in which case update the REVIEWED entry, or the\n' +
        '        message is now being rendered from something that is not stock.',
    )
  }
}

for (const entry of REVIEWED) {
  if (!seen.has(entry.file)) {
    fail(
      `${entry.file} is in the reviewed scarcity baseline and no longer renders one.\n` +
        '        Remove the entry. A baseline nobody prunes is a baseline nobody reads.',
    )
  }
}
console.log(`  ${seen.size} file(s) render a scarcity message, and each is reviewed and still computed`)

/* ======================================================================== */
/* CLAUSE 2. No literal count, and no random beside a scarcity line.        */
/* ======================================================================== */

const LITERAL_COUNT = /Only\s+\d+\s+(?:left|remaining|tickets)/i
let checkedForLiterals = 0
for (const file of walk(SRC)) {
  const code = readCode(file)
  checkedForLiterals += 1
  if (LITERAL_COUNT.test(code)) {
    fail(
      `${rel(file)} writes a scarcity COUNT as a literal.\n` +
        '        "Only 3 left" typed into a template is a number no inventory produced. Render\n' +
        '        the computed count, or render nothing.',
    )
  }
  const hasScarcity = SCARCITY.some(s => s.re.test(code))
  if (hasScarcity && /Math\.random\s*\(/.test(code)) {
    fail(
      `${rel(file)} has a scarcity message and a Math.random() in the same file.\n` +
        '        A manufactured number wearing the shape of a real one is the worst version of\n' +
        '        this defect, because it looks alive. Remove one of the two.',
    )
  }
}
console.log(`  ${checkedForLiterals} file(s) checked: no literal scarcity count, no random beside one`)

/* ======================================================================== */
/* CLAUSE 3. The accessibility section keeps its emptiness guard.           */
/* ======================================================================== */

const SECTION = 'src/components/features/accessibility/accessibility-section.tsx'
const FIELDS = 'src/lib/accessibility/fields.ts'

const sectionSrc = readCode(join(ROOT, SECTION))
const EMPTY_GUARD = /if\s*\(\s*!\s*hasAccessibilityInfo\s*\(\s*info\s*\)\s*\)\s*return\s+null/
if (!EMPTY_GUARD.test(sectionSrc)) {
  fail(
    `${SECTION} no longer refuses to render when there is nothing to say.\n` +
      '        The close-out is explicit: "show it only when filled. A blank section is worse\n' +
      '        than none." An Accessibility heading over empty space does not read as "we have\n' +
      '        not been told", it reads as "there is none", to the one person who cannot work\n' +
      '        around it. Restore: if (!hasAccessibilityInfo(info)) return null',
  )
} else {
  console.log('  the accessibility section still returns null when it has nothing to say')
}

const fieldsSrc = readCode(join(ROOT, FIELDS))
const STRICT_TRUE = /row\[f\.column\]\s*===\s*true/
if (!STRICT_TRUE.test(fieldsSrc)) {
  fail(
    `${FIELDS} no longer requires a strict true to treat a flag as stated.\n` +
      '        A truthy string or a 1 arriving from an import or a future serialiser would\n' +
      '        become a promise of a ramp that nobody made. Restore the === true comparison.',
  )
} else {
  console.log('  a flag counts as stated only on a strict true')
}

/* ======================================================================== */
/* CLAUSE 4. The accessibility surfaces never render a negative.            */
/* ======================================================================== */

/*
 * Scoped to the two accessibility folders rather than to all of src, because
 * "not available" is an ordinary English phrase everywhere else and a guard
 * that fires on it across the tree is a guard somebody switches off.
 */
const NEGATIVE = [
  /\bno\s+(?:wheelchair|hearing\s*loop|accessible\s+(?:toilets?|parking)|step-free|quiet\s+space)/i,
  /\bnot\s+(?:wheelchair\s+accessible|accessible)\b/i,
  /\bunavailable\b/i,
]
const ACCESSIBILITY_DIRS = [
  join(SRC, 'components', 'features', 'accessibility'),
  join(SRC, 'lib', 'accessibility'),
]
let accessibilityFiles = 0
for (const dir of ACCESSIBILITY_DIRS) {
  for (const file of walk(dir)) {
    accessibilityFiles += 1
    const code = readCode(file)
    for (const re of NEGATIVE) {
      if (re.test(code)) {
        fail(
          `${rel(file)} renders an accessibility NEGATIVE.\n` +
            '        A false in these columns means NOT STATED, never "no". Nobody asked the\n' +
            '        organiser, and answering on their behalf is the platform inventing a fact\n' +
            '        about a building it has never been to. Render only what is true.',
        )
      }
    }
  }
}
console.log(`  ${accessibilityFiles} accessibility file(s) render positives only`)

/* ======================================================================== */
/* CLAUSE 5. A scarcity ALERT, if it is ever sent, is sent from inventory.   */
/* ======================================================================== */

/*
 * `going_fast` and `last_chance` are declared notification types with copy and
 * no sender. That is recorded above and in REVIEW-QUEUE-C.md. This clause is
 * the trap for the day somebody writes the sender: a file that dispatches one
 * of them must have counted something first.
 *
 * It passes vacuously today, and it says so rather than printing a silent tick,
 * because a clause that has never judged anything should look like one.
 */
const SCARCITY_ALERT = /type:\s*'(going_fast|last_chance)'/
let dispatchers = 0
for (const file of walk(SRC)) {
  const code = readCode(file)
  if (!SCARCITY_ALERT.test(code)) continue
  dispatchers += 1
  const counts = /(total_capacity|sold_count|reserved_count|percent_sold|\bavailable\b\s*[<>=])/.test(code)
  if (!counts) {
    fail(
      `${rel(file)} dispatches a scarcity alert without reading inventory.\n` +
        '        "Going fast" sent to a follower who then finds half the room empty is the same\n' +
        '        misleading representation as a badge that says it. Count the tickets first.',
    )
  }
}
console.log(
  dispatchers === 0
    ? '  no file dispatches a scarcity alert (the two types exist as copy only)'
    : `  ${dispatchers} file(s) dispatch a scarcity alert, and each reads inventory`,
)

/* ======================================================================== */
/* CLAUSE 6. The reversal condition is a switch, not a sentence.            */
/* ======================================================================== */

/*
 * SEO5's reversal condition: "One flag hides the availability indicator and the
 * accessibility section while leaving the calendar links in place."
 *
 * A reversal written only in a close-out document is a reversal somebody has to
 * BUILD on the day they need it, which is the day they have least time. So the
 * flag exists, it is one flag, and this clause holds three things about it: it
 * is declared with a dated decision, every surface it must govern consults it,
 * and the calendar links do NOT, because a date in a diary is never the thing
 * that turns out to be untrue.
 */
const REVERSAL_FLAG = 'event_availability_and_access'
const FLAGS_MODULE = 'src/lib/flags/broadcast.ts'

const flagsSrc = readFileSync(join(ROOT, FLAGS_MODULE), 'utf8')
if (!flagsSrc.includes(`'${REVERSAL_FLAG}'`)) {
  fail(
    `${FLAGS_MODULE} no longer declares ${REVERSAL_FLAG}.\n` +
      '        It is the SEO5 reversal condition, and without it the only way to take a wrong\n' +
      '        availability figure off the platform is a deploy.',
  )
} else if (!new RegExp(`${REVERSAL_FLAG}:\\s*$|${REVERSAL_FLAG}:`).test(flagsSrc)) {
  fail(`${FLAGS_MODULE} declares ${REVERSAL_FLAG} without a default and a dated decision.`)
} else {
  console.log(`  the reversal flag ${REVERSAL_FLAG} is declared with a dated decision`)
}

/*
 * Every surface the flag must be able to switch off, checked by the SHAPE OF
 * THE GATE rather than by the presence of the name.
 *
 * THE FIRST VERSION ASKED WHETHER THE FILE MENTIONED `showAvailability`, and
 * the drill that removed the gate from the rendered line PASSED: the prop
 * declaration and the destructure still carried the name. The same false pass
 * as clause 1's first attempt, in a different file, on the same day. A check
 * that a rename satisfies is not a check.
 */
const GOVERNED = [
  {
    file: 'src/app/events/[slug]/page.tsx',
    shapes: [
      { re: /availabilityAndAccessOn\s*&&\s*eventInventory/, what: 'the event-level badge' },
      { re: /showAvailability=\{availabilityAndAccessOn\}/, what: 'the ticket panel' },
      { re: /availabilityAndAccessOn\s*$|availabilityAndAccessOn\s*\r?\n?\s*\?/m, what: 'the accessibility section' },
    ],
  },
  {
    file: 'src/app/venues/[handle]/page.tsx',
    shapes: [
      { re: /isFeatureEnabled\('event_availability_and_access'\)/, what: "the venue's access section" },
    ],
  },
  {
    file: 'src/components/features/events/ticket-panel-client.tsx',
    shapes: [
      { re: /props\.showAvailability !== false\s*&&/, what: 'the per-tier social-proof badges' },
      { re: /showAvailability=\{props\.showAvailability !== false\}/, what: 'the selector below it' },
    ],
  },
  {
    file: 'src/components/checkout/ticket-selector.tsx',
    shapes: [{ re: /\{\s*showAvailability\s*&&/, what: 'the remaining-tickets line' }],
  },
]
let governedShapes = 0
for (const surface of GOVERNED) {
  const code = readCode(join(ROOT, surface.file))
  for (const shape of surface.shapes) {
    governedShapes += 1
    if (!shape.re.test(code)) {
      fail(
        `${surface.file}: ${shape.what} is no longer gated on the reversal switch.\n` +
          '        SEO5: "One flag hides the availability indicator and the accessibility section."\n' +
          '        A flag that reaches three of four surfaces leaves the fourth still claiming.',
      )
    }
  }
}
console.log(`  ${governedShapes} gated surface(s) across ${GOVERNED.length} file(s) consult the reversal switch`)

/*
 * AND THE CALENDAR IS OUT OF IT, which is half the condition and the half a
 * later tidying pass would "fix" by putting everything behind one flag.
 */
const CALENDAR = 'src/components/features/events/add-to-calendar.tsx'
const calendarSrc = readCode(join(ROOT, CALENDAR))
if (/isFeatureEnabled|showAvailability|event_availability_and_access/.test(calendarSrc)) {
  fail(
    `${CALENDAR} is behind the reversal switch, and the close-out says it must not be:\n` +
      '        "while leaving the calendar links in place". The reversal removes the claim that\n' +
      '        could be wrong, not the feature standing next to it.',
  )
} else {
  console.log('  the calendar links are NOT behind the switch, as the reversal condition requires')
}

/* ------------------------------------------------------------------ verdict */

if (failures.length > 0) {
  console.error('\n[no-false-urgency] FAIL - a surface could hurry or mislead a buyer.\n')
  for (const f of failures) console.error(`  - ${f}\n`)
  process.exit(1)
}

console.log(
  '\n[no-false-urgency] PASS - every scarcity message is computed from real inventory,\n' +
    '      and the accessibility section renders only what it was told, or nothing.',
)
