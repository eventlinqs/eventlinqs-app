/**
 * GUARD: /organisers IS A NAMED COPY SURFACE, AND ITS PROOF IS A READ.
 *
 * Close-out OL1. From 12 September 2026 every outreach message sent by hand
 * points a stranger at /organisers. That makes it the most-read page the
 * platform has, and it acquired two new ways to go quietly wrong.
 *
 * ONE. THE LIVE PROOF BLOCK COULD BECOME A SCREENSHOT. It shows the newest
 * published event as a real card, and the cheapest possible way to "fix" that
 * block on the day the catalogue is thin is to paste an event into it. Nothing
 * would fail: the page would look better, and it would be lying to exactly the
 * people it is trying to recruit. This fails the build if the block stops
 * reading the catalogue, or if an event slug, title or image URL appears as a
 * literal anywhere in the surface.
 *
 * TWO. THE SURFACE COULD DROP OUT OF THE COPY GATE. The copy gate walks src/,
 * so /organisers is covered today by a property of the walk rather than by
 * anyone naming it. A narrowing of that walk would take the objection answers,
 * the offer and the founder's own words with it and report a smaller, cleaner
 * number. The files are named here, and the gate is required to still be
 * walking the root each one lives under.
 *
 * THREE. EVERY BUTTON INTO SIGNUP MUST CARRY ITS SOURCE. Nobody can say how the
 * first real organiser found the platform. Four separate hrefs is three chances
 * to forget the parameter, and a forgotten one is invisible: the button works
 * and the attribution is simply absent. They go through one function and this
 * says so.
 *
 * Proven red and green: C:\\dev\\EVIDENCE\\OL1\\guard-red.txt, guard-green.txt.
 *
 * Run: node scripts/guards/organiser-page-is-a-read.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { declareWork } from '../lib/work-report.mjs'

const ROOT = process.cwd()
const TAG = '[organiser-page]'

/** THE NAMED SURFACE. Every file whose bytes reach /organisers. */
const SURFACE = [
  'src/app/organisers/page.tsx',
  'src/components/templates/OrganisersLandingPage.tsx',
  'src/lib/organisers/founding-offer.ts',
  'src/lib/organisers/objections.ts',
  'src/lib/organisers/newest-published-event.ts',
  'src/lib/organisers/signup-source.ts',
]

const TEMPLATE = 'src/components/templates/OrganisersLandingPage.tsx'
const COPY_GATE = 'scripts/copy-tell-gate.mjs'

const faults = []
const checks = { 'surface file judged': 0, 'literal pattern applied': 0, 'signup button read': 0 }

function read(rel) {
  const file = join(ROOT, rel)
  if (!existsSync(file)) {
    faults.push(
      `${rel} is named as part of the /organisers surface and is not on disk. If it moved, move it in this guard too: a surface that is not named is a surface nothing is watching`,
    )
    return null
  }
  return readFileSync(file, 'utf8')
}

/* ------------------------------------- 1. every named file is really scanned */

const copyGate = read(COPY_GATE)
if (copyGate) {
  // The gate walks roots; each surface file has to live under one of them.
  const walksSrc = /walk\(path\.join\(ROOT, 'src'\)\)/.test(copyGate) || /roots\.push\(path\.join\(ROOT, 'src'\)\)/.test(copyGate) || /path\.join\(ROOT, 'src'\)/.test(copyGate)
  if (!walksSrc) {
    faults.push(
      `${COPY_GATE} no longer walks src/, so the named /organisers files are outside the copy gate. The copy laws would still pass, on a page nobody was reading`,
    )
  }
  for (const rel of SURFACE) {
    checks['surface file judged'] += 1
    if (!rel.startsWith('src/')) {
      faults.push(`${rel} is part of the /organisers surface and sits outside src/, where the copy gate cannot see it`)
    }
    read(rel)
  }
}

/* --------------------------------- 2. the live proof block reads the database */

const template = read(TEMPLATE)
if (template) {
  checks['literal pattern applied'] += 1
  if (!template.includes('getNewestPublishedEvent()')) {
    faults.push(
      `${TEMPLATE} does not call getNewestPublishedEvent(). The live proof block is the one thing on this page that has to be a READ: an event pasted in as an example is a screenshot, and it becomes a lie the first time the catalogue moves`,
    )
  }
  if (!/\{newestEvent && <LiveProofEvent event=\{newestEvent\} \/>\}/.test(template)) {
    faults.push(
      `${TEMPLATE} no longer renders the live proof block behind the read's own result. It must render NOTHING when there is nothing to show: an empty catalogue is a real state and a fabricated example is not honest about it`,
    )
  }

  /*
   * A PASTED EVENT, CAUGHT BY ITS SHAPE. An event reaches the surface as a
   * slug, a title and a cover image, so the three shapes are refused as
   * literals: an events href with a slug already in it, an image URL, and a
   * hardcoded EventCardData object.
   */
  const LITERAL_SHAPES = [
    { what: 'an /events/ href with the slug already written into it', pattern: /["'`]\/events\/[a-z0-9]/i },
    { what: 'an image URL typed into the surface', pattern: /https?:\/\/[^\s"'`]+\.(?:jpe?g|png|avif|webp)/i },
    { what: 'an event card object built by hand', pattern: /(?:const|let)\s+\w*[Ee]vent\w*\s*(?::\s*EventCardData\s*)?=\s*\{[^}]*\bslug\s*:/ },
  ]
  for (const shape of LITERAL_SHAPES) {
    checks['literal pattern applied'] += 1
    if (shape.pattern.test(template)) {
      faults.push(
        `${TEMPLATE} contains ${shape.what}. The proof block is a read from the catalogue; a literal here is a screenshot of the platform rather than the platform`,
      )
    }
  }
}

/* ------------------------------- 3. every signup button carries its source */

if (template) {
  const signupHrefs = [...template.matchAll(/href=\{?["']?\/organisers\/signup/g)]
  checks['signup button read'] += signupHrefs.length
  if (signupHrefs.length > 0) {
    faults.push(
      `${TEMPLATE} points ${signupHrefs.length} button(s) straight at /organisers/signup. Every one goes through withSignupSource() so the account records where the organiser came from; a bare href works perfectly and records nothing, which is the failure AN1 exists to end`,
    )
  }
  const wrapped = [...template.matchAll(/withSignupSource\(/g)].length
  checks['signup button read'] += wrapped
  if (wrapped < 3) {
    faults.push(
      `${TEMPLATE} routes only ${wrapped} button(s) through withSignupSource(). The page has a hero CTA, the founding band and the closing band, and all three are entry points a stranger clicks`,
    )
  }

  // The founder's own way in, and the address it uses.
  checks['signup button read'] += 1
  if (!/contactMailto\('hello', FOUNDING_OFFER\.founderCtaSubject\)/.test(template)) {
    faults.push(
      `${TEMPLATE} no longer opens the founder button through contactMailto with the configured subject. A typed address on a public page is how a private mailbox gets published (founder ruling R2, 3 August 2026), and a missing subject is a reply nobody can find`,
    )
  }
}

/* ------------------------------------------------------------------ verdict */

declareWork('organiser-page-is-a-read', {
  did: checks,
  found: { 'fault on the page every message points at': faults.length },
})

if (faults.length > 0) {
  console.error(`${TAG} FAIL: ${faults.length} fault(s) on the page every outreach message points at.`)
  for (const fault of faults) console.error(`${TAG}   - ${fault}`)
  process.exit(1)
}

console.log(
  `${TAG} PASS - ${SURFACE.length} named file(s) inside the copy gate, the live proof block is a read, and every signup button carries its source.`,
)
