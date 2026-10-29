/**
 * WHAT EVENTLINQS COUNTED AND WHAT A PLATFORM REPORTED ARE NEVER MIXED, AND A PRESS OUT IS NEVER A SALE (the release
 * checklist of 28 October 2026, K14 and J16; J17 and G4 for the one reader of the decisions).
 *
 * The weekly social report (src/lib/growth/social-report-math.ts, social-report.ts and the page
 * src/app/admin/(authed)/growth/social-report) shows two kinds of figure: COUNTED from the platform's own rows, and
 * ENTERED by a person from Instagram's or Facebook's insights. K14: "Measured data kept apart from estimates and
 * entered figures; external ticket clicks never claimed as sales."
 *
 * 1. No code line of the report adds, subtracts, multiplies or divides an entered figure with a counted one.
 * 2. The counted week (WeekCounted) holds no platform figure: no reach, saves, shares or watch time.
 * 3. The page keeps them in two sections: the counted section names nothing entered, and the entered section nothing
 *    counted.
 * 4. The press out to a booking site is labelled as a press, never a sale, booking or purchase.
 * 5. social_piece_figures and social_report_decisions are read and written only by src/lib/growth/social-report.ts, so
 *    no planner or other code acts on an approval by itself (G4).
 *
 * It reads the tree, never the database; scripts/verify/social-report-drive.mts proves the tables' refusals on TEST.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { readSource, sourceFiles, lineAt } from './lib/source.mjs'
import { declareWork } from '../lib/work-report.mjs'

const TAG = '[social-measured-apart]'
const ROOT = process.cwd()
const MATH = 'src/lib/growth/social-report-math.ts'
const READER = 'src/lib/growth/social-report.ts'
const VIEW = 'src/app/admin/(authed)/growth/social-report/report-view.tsx'
const REPORT_FILES = [MATH, READER, VIEW, 'src/app/admin/(authed)/growth/social-report/page.tsx', 'src/app/admin/(authed)/growth/social-report/actions.ts']
const OWN_TABLES = ['social_piece_figures', 'social_report_decisions']

const failures = []
let lines = 0

for (const rel of REPORT_FILES) {
  if (!existsSync(join(ROOT, rel))) {
    failures.push(`${rel} is missing; the report is held in these files`)
  }
}

/*
 * 1. Never one sum. A line is judged by the figures it names, not by two words: an entered figure is named by
 * "entered", the platforms or their four metrics; a counted one by "counted" or one of WeekCounted's and PostResult's
 * own fields. A line naming one of each with an arithmetic operator between figures fails.
 */
const ENTERED_NAMES = /\b(entered\w*|instagram|facebook|reach\w*|saves|shares|watch_time_seconds)\b/i
const COUNTED_NAMES = /\b(counted\w*|visitors\w*|eventViews|externalBookingClicks|nativeOrder\w*|subscriptions|organiserEnquiries|arrived|pressedOut|tickets|social(?:Visitors\w*)?)\b/
for (const rel of REPORT_FILES) {
  if (!existsSync(join(ROOT, rel))) continue
  const { code } = readSource(join(ROOT, rel))
  code.split('\n').forEach((line, i) => {
    lines += 1
    const bare = line.replace(/=>/g, ' ').replace(/[<>]=?/g, ' ').replace(/\?\?/g, ' ')
    if (ENTERED_NAMES.test(bare) && COUNTED_NAMES.test(bare) && /[^+\-*/][+*/][^+\-*/]|\s-\s/.test(bare)) {
      failures.push(`${rel}:${i + 1} puts an entered figure and a counted one in one calculation: "${line.trim().slice(0, 140)}"`)
    }
  })
}

/* 2. The counted week holds no platform figure. */
if (existsSync(join(ROOT, MATH))) {
  const { code } = readSource(join(ROOT, MATH))
  const at = code.indexOf('interface WeekCounted')
  if (at === -1) failures.push(`${MATH} no longer declares WeekCounted; the counted week must stay its own type`)
  else {
    const block = code.slice(at, code.indexOf('}', at))
    const m = /\b(reach|saves|shares|watch\w*|impressions?|likes?)\b/i.exec(block)
    if (m) failures.push(`${MATH}:${lineAt(code, at + m.index)} WeekCounted carries "${m[0]}", a platform figure; it belongs in the entered figures`)
  }
}

/* 3 and 4. Two sections on the page, and the press out is a press. */
if (existsSync(join(ROOT, VIEW))) {
  const { withStrings } = readSource(join(ROOT, VIEW))
  const section = (name) => {
    const at = withStrings.indexOf(`name="${name}"`)
    if (at === -1) return null
    const next = withStrings.indexOf('<Section', at)
    return { at, text: withStrings.slice(at, next === -1 ? undefined : next) }
  }
  const counted = section('counted')
  const entered = section('entered')
  if (counted === null || entered === null) failures.push(`${VIEW} must keep a "counted" section and an "entered" section`)
  else {
    const a = /\b(entered\w*|enteredTotals)\b/.exec(counted.text.replace(/name="counted"/, ''))
    if (a) failures.push(`${VIEW}:${lineAt(withStrings, counted.at + a.index)} the counted section names "${a[0]}"`)
    const b = /\br\.counted\b|\bcounted\w*\s*[.[]/.exec(entered.text)
    if (b) failures.push(`${VIEW}:${lineAt(withStrings, entered.at + b.index)} the entered section names "${b[0]}"`)
  }
  const press = /key:\s*'externalBookingClicks'[^}]*label:\s*'([^']*)'/.exec(withStrings)
  if (!press) failures.push(`${VIEW} no longer labels externalBookingClicks; it must say what it is, a press out`)
  else if (/\b(sales?|sold|bookings|bought|purchases?|orders?|conversions?|tickets?)\b/i.test(press[1])) {
    failures.push(`${VIEW}:${lineAt(withStrings, press.index)} labels a press out as "${press[1]}"; a press to another site is never a sale`)
  }
}

/* 5. One reader and writer of the report's own tables. */
let sources = 0
for (const file of sourceFiles(ROOT)) {
  const rel = file.replace(/\\/g, '/')
  sources += 1
  if (rel === READER) continue
  const { withStrings } = readSource(join(ROOT, file))
  for (const table of OWN_TABLES) {
    const m = new RegExp(`from\\(['"\`]${table}['"\`]\\)`).exec(withStrings)
    if (m) failures.push(`${rel}:${lineAt(withStrings, m.index)} reads or writes ${table}; only ${READER} does`)
  }
}

declareWork('social-measured-apart', { did: { 'report file': REPORT_FILES.length, 'code line': lines, 'source file': sources }, found: { failure: failures.length } })
if (failures.length > 0) {
  for (const f of failures) console.error(`${TAG} FAIL: ${f}`)
  process.exit(1)
}
console.log(`${TAG} PASS: ${lines} code lines of the report keep entered and counted apart; the press out is a press; ${OWN_TABLES.join(' and ')} have one reader, ${READER}.`)
