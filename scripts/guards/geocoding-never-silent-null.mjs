/**
 * AN ORGANISER'S EVENT CANNOT BE SAVED WITH NULL COORDINATES WHEN THE KEY IS
 * ABSENT (close-out C9, 7 September 2026).
 *
 * Until 7 September 2026 the create and update actions resolved a typed
 * address to coordinates, logged the reason when they could not, and saved the
 * event with a null pair regardless. On production that was every typed address,
 * because GOOGLE_MAPS_API_KEY there was the referer-restricted browser key and
 * Google refused it, and nobody was told. The rule now lives in
 * src/lib/geo/venue-save-rule.ts: on a production-like environment a typed
 * address with no coordinates is REFUSED with a message the organiser can act
 * on; on a local checkout it is allowed with the reason in the log.
 *
 * WHAT THIS GUARD CHECKS.
 *   1. THE RULE, DRIVEN. The TypeScript rule is loaded through the alias loader
 *      and run against the cases that matter: the key absent on production
 *      (refused, named as a configuration fault, GOOGLE_MAPS_API_KEY in the
 *      message), the browser key standing in for the server key on production
 *      (refused the same way), Google refusing on preview (refused as a
 *      geocoding fault), the key absent on development (allowed, the reason
 *      kept as the warning), coordinates present (allowed), a virtual event
 *      (allowed). A rule that lets the production case through fails the build.
 *   2. THE CALL SITES, READ. Both the create and the update action in
 *      src/app/(dashboard)/dashboard/events/actions.ts must call judgeVenueSave
 *      and return its error, so the rule cannot be bypassed by one path.
 *
 * Drilled both ways in scripts/verify/guard-failure-drills.mjs: the rule made
 * to allow the production case, and the create action's call removed.
 *
 * Run: node scripts/guards/geocoding-never-silent-null.mjs
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { declareWork } from '../lib/work-report.mjs'

const ROOT = process.cwd()
const ACTIONS = 'src/app/(dashboard)/dashboard/events/actions.ts'
const RULE = 'src/lib/geo/venue-save-rule.ts'
const tag = '[geocoding-never-silent-null]'
const faults = []
const fail = (m) => {
  faults.push(m)
  console.error(`${tag} FAIL: ${m}`)
}

// 1. The rule, driven through the alias loader in a child so this guard stays plain Node.
const script = [
  "import { judgeVenueSave } from '@/lib/geo/venue-save-rule'",
  'const none = (reason) => ({ venue_latitude: null, venue_longitude: null, reason })',
  'const cases = {',
  "  productionKeyAbsent: judgeVenueSave({ eventType: 'in_person', venueAddress: '57 Swan Street', coordinates: none('server geocoding is off: GOOGLE_MAPS_API_KEY is not set'), environment: 'production' }),",
  "  productionBrowserKey: judgeVenueSave({ eventType: 'in_person', venueAddress: '57 Swan Street', coordinates: none('server geocoding is off: GOOGLE_MAPS_API_KEY is the public browser key, which is referer restricted and cannot serve the Geocoding API'), environment: 'production' }),",
  "  previewGoogleRefused: judgeVenueSave({ eventType: 'hybrid', venueAddress: '57 Swan Street', coordinates: none('the Geocoding API answered REQUEST_DENIED: denied'), environment: 'preview' }),",
  "  developmentKeyAbsent: judgeVenueSave({ eventType: 'in_person', venueAddress: '57 Swan Street', coordinates: none('server geocoding is off: GOOGLE_MAPS_API_KEY is not set'), environment: 'development' }),",
  "  productionWithCoordinates: judgeVenueSave({ eventType: 'in_person', venueAddress: '57 Swan Street', coordinates: { venue_latitude: -37.82, venue_longitude: 144.99, reason: null }, environment: 'production' }),",
  "  productionVirtual: judgeVenueSave({ eventType: 'virtual', venueAddress: null, coordinates: none(null), environment: 'production' }),",
  '}',
  'console.log(JSON.stringify(cases))',
  '',
].join('\n')
const r = spawnSync(
  process.execPath,
  ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--import', './scripts/lib/src-alias-loader.mjs', '--input-type=module', '-e', script],
  { cwd: ROOT, encoding: 'utf8' },
)
let cases = null
if (r.status !== 0) {
  fail(`could not load ${RULE} through the alias loader: ${(r.stderr || r.stdout).trim().slice(0, 400)}`)
} else {
  const line = r.stdout.trim().split('\n').find((l) => l.startsWith('{'))
  if (!line) fail(`the rule printed no verdicts: ${r.stdout.slice(0, 200)}`)
  else cases = JSON.parse(line)
}

if (cases) {
  const refused = (name, kind, mentions) => {
    const v = cases[name]
    if (!v || v.ok !== false) fail(`${name}: the rule ALLOWED a typed address with no coordinates on a production-like environment; the event would save with a null pair and nobody would be told`)
    else {
      if (v.kind !== kind) fail(`${name}: refused as ${v.kind}, expected ${kind}`)
      if (mentions && !String(v.error).includes(mentions)) fail(`${name}: the refusal does not name ${mentions}; the organiser would not know what to do`)
      if (!/pick the venue from the suggestions/i.test(String(v.error))) fail(`${name}: the refusal does not offer the path that works (pick the venue from the suggestions)`)
    }
  }
  const allowed = (name, wantWarning) => {
    const v = cases[name]
    if (!v || v.ok !== true) fail(`${name}: the rule refused a save it must allow (${JSON.stringify(v)})`)
    else if (wantWarning && !v.warning) fail(`${name}: allowed silently; the reason must travel as the warning so the server log carries it`)
    else if (!wantWarning && v.warning) fail(`${name}: allowed with a warning where there is nothing to warn about`)
  }
  refused('productionKeyAbsent', 'configuration', 'GOOGLE_MAPS_API_KEY')
  refused('productionBrowserKey', 'configuration', 'GOOGLE_MAPS_API_KEY')
  refused('previewGoogleRefused', 'geocoding', 'REQUEST_DENIED')
  allowed('developmentKeyAbsent', true)
  allowed('productionWithCoordinates', false)
  allowed('productionVirtual', false)
}

// 2. Both actions call the rule and return its refusal.
const actions = readFileSync(join(ROOT, ACTIONS), 'utf8')
const calls = (actions.match(/judgeVenueSave\(/g) || []).length
const returns = (actions.match(/return \{ error: venueVerdict\.error/g) || []).length
if (calls < 2) fail(`${ACTIONS}: judgeVenueSave is called ${calls} time(s); the create and the update action must both call it`)
if (returns < 2) fail(`${ACTIONS}: the rule's refusal is returned ${returns} time(s); both actions must return venueVerdict.error`)
if (!actions.includes("from '@/lib/geo/venue-save-rule'")) fail(`${ACTIONS}: does not import the save rule`)

declareWork('geocoding-never-silent-null', {
  did: { 'case driven': cases ? Object.keys(cases).length : 0, 'file read': 1 },
  found: { 'silent-null fault': faults.length },
  zeroIsFine: true,
})

if (faults.length > 0) {
  console.error(`${tag} ${faults.length} fault(s). A typed address with no coordinates must refuse to save on a production-like environment, by name.`)
  process.exit(1)
}
console.log(`${tag} PASS - six cases judged as the rule requires; both actions call judgeVenueSave and return its refusal.`)
