/**
 * A PAGE THAT SAYS "SCAN THIS" MUST DRAW SOMETHING TO SCAN.
 * A build-failing guard (close-out UX5).
 *
 * WHY THIS EXISTS. `/admin/enrol-2fa` told every new administrator, in its own
 * user-facing copy:
 *
 *     "Open your authenticator and scan the QR code from your password manager"
 *
 * and drew no QR code. Its header comment even said so out loud - "QR rendering
 * is intentionally not in A1 - copy and paste into the authenticator works on
 * every modern app" - which is only true of somebody enrolling on the same
 * machine they are reading the page on. An authenticator lives on a PHONE. What
 * that instruction actually asked for was a person typing a 32 character base32
 * secret off a laptop screen into a handset, on the one screen where a typo
 * locks them out of the admin console.
 *
 * The gap survived because nothing could see it. A route sweep reads status
 * codes; that page answered 200. A unit test reads a function; no function was
 * wrong. The only thing that could catch it was a person reading the sentence
 * next to the empty space, and people are exactly what a launch runs out of.
 *
 * THE THREE CLAUSES.
 *
 *   1. THE INSTRUCTION MUST HAVE A PICTURE. Any file under src/ whose
 *      USER-FACING COPY tells a person to scan a code must also render one.
 *      Comments are stripped before matching, deliberately: a comment that
 *      explains why the QR is drawn is the documentation working, and a guard
 *      that fired on it would delete the reason.
 *
 *   2. THE FALLBACK MUST SURVIVE. The enrolment page must still print the
 *      base32 secret AND the otpauth URI. Somebody whose authenticator has no
 *      camera, or who is enrolling on the machine itself, must never be left
 *      with only a picture. Replacing the text with a QR would be the same
 *      defect pointing the other way.
 *
 *   3. THE QR MUST CARRY WHAT THE PAGE PRINTS. The value handed to the QR
 *      renderer must be the same expression the page renders as the otpauth
 *      URI. A QR that encodes something OTHER than the URI beside it is worse
 *      than no QR: it is a picture that silently enrols the wrong secret, and
 *      the person only finds out when they are locked out.
 *
 * Run: node scripts/guards/scannable-instruction-has-a-qr.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, extname, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { declareWork } from '../lib/work-report.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const SRC = join(ROOT, 'src')
const TAG = '[scannable-instruction-has-a-qr]'

/** The surface clauses 2 and 3 are about, named once. */
const ENROL_PAGE = 'src/app/admin/(authed)/enrol-2fa/page.tsx'

/**
 * Copy that tells a person to point a camera at THIS page. Deliberately narrow
 * on two axes, and both narrowings were forced by a real false positive rather
 * than guessed at:
 *
 *   - it must name a CODE (qr / barcode), so a door-scanning feature
 *     description that never mentions one cannot trip it;
 *   - it must be an IMPERATIVE. `src/lib/help-content.ts` answers "One person
 *     can scan multiple QR codes from the same phone", which is a statement of
 *     fact about the door, not an instruction to point a camera at the article.
 *     A guard that failed the build on that sentence would be switched off
 *     within a week, and rightly.
 *
 * The distinction is the word in front: an auxiliary or a modal makes it
 * descriptive ("can scan", "is scanned", "to scan"); nothing, or a conjunction,
 * makes it an order addressed to the reader ("Open your authenticator and scan
 * the QR code"), which is exactly what shipped.
 */
const SCAN_INSTRUCTION = /\bscan\b[^.<>{}]{0,40}\b(qr|barcode)\b/gi
const DESCRIPTIVE_LEAD = /\b(can|could|will|would|should|must|may|might|is|are|was|were|be|been|being|to|cannot|never|when|if)\s+$/i

/** Is this occurrence an order to the reader, or a statement about the world? */
function isImperative(text, index) {
  return !DESCRIPTIVE_LEAD.test(text.slice(Math.max(0, index - 24), index))
}

/**
 * Evidence that this file actually draws one. Either it calls the `qrcode`
 * renderer itself (the house pattern, server-side, used by `/t/[code]`), or it
 * renders a component whose name says it is a QR.
 */
const RENDERS_A_QR = /QRCode\.to(String|DataURL|Buffer)\s*\(|<[A-Z][A-Za-z]*(Qr|QR)[A-Za-z]*\b/

/** Strip comments so a sentence EXPLAINING the QR is never mistaken for copy. */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[^\n]*?\/\/[^\n]*$/gm, ' ')
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, out)
    else if (['.tsx', '.ts'].includes(extname(full))) out.push(full)
  }
  return out
}

const files = walk(SRC)
const violations = []
const unreadable = []
let instructionsFound = 0
let qrSurfaces = 0

for (const full of files) {
  const rel = relative(ROOT, full).replace(/\\/g, '/')
  let raw
  try {
    raw = readFileSync(full, 'utf8')
  } catch (cause) {
    unreadable.push(`${rel} (${cause.message})`)
    continue
  }
  const copy = stripComments(raw)
  const drawsOne = RENDERS_A_QR.test(raw)
  if (drawsOne) qrSurfaces += 1
  SCAN_INSTRUCTION.lastIndex = 0
  for (const m of copy.matchAll(SCAN_INSTRUCTION)) {
    if (!isImperative(copy, m.index)) continue
    instructionsFound += 1
    if (drawsOne) continue
    violations.push({
      file: rel,
      line: copy.slice(0, m.index).split('\n').length,
      clause: 1,
      detail: `tells a person to "${m[0].trim()}" and renders no QR`,
    })
  }
}

// ---- clauses 2 and 3, on the named surface ----
let enrol
try {
  enrol = readFileSync(join(ROOT, ENROL_PAGE), 'utf8')
} catch (cause) {
  console.error(`${TAG} FAIL - the enrolment page could not be read: ${ENROL_PAGE} (${cause.message})`)
  console.error('  A guard that could not read the surface it is about cannot report a pass.')
  process.exit(1)
}

if (!/\{\s*prep\.secretBase32\s*\}/.test(enrol) || !/\{\s*prep\.otpauthUri\s*\}/.test(enrol)) {
  violations.push({
    file: ENROL_PAGE,
    line: 1,
    clause: 2,
    detail:
      'the page no longer prints BOTH the base32 secret and the otpauth URI; a person who cannot scan would be left with only a picture',
  })
}

if (!/QRCode\.to(String|DataURL|Buffer)\s*\(\s*prep\.otpauthUri\b/.test(enrol)) {
  violations.push({
    file: ENROL_PAGE,
    line: 1,
    clause: 3,
    detail:
      'the QR is not built from `prep.otpauthUri`, the same expression the page prints, so the picture and the text below it can encode different secrets',
  })
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
  console.error(`${TAG} FAIL - ${violations.length} surface(s) ask for a scan they cannot support:`)
  for (const v of violations) console.error(`    clause ${v.clause}  ${v.file}:${v.line}  ${v.detail}`)
  console.error('')
  console.error('  /admin/enrol-2fa said "scan the QR code" and drew nothing to scan, which asked')
  console.error('  a person to type a 32 character secret off a laptop into a phone, on the one')
  console.error('  screen where a typo locks them out of the admin console (close-out UX5).')
  console.error('')
  console.error('  Render the QR server-side with `qrcode`, the way /t/[code] already does, and')
  console.error('  keep the secret and the URI on the page beside it.')
  process.exit(1)
}

declareWork('scannable-instruction-has-a-qr', {
  did: {
    'file scanned': files.length,
    'surface that renders a QR': qrSurfaces,
  },
  found: { 'scan instruction with nothing to scan': violations.length },
  zeroIsFine: {
    'scan instruction with nothing to scan':
      'every surface that asks for a scan drawing one is the goal state; the enrolment page shipped the opposite (UX5)',
  },
  exitOnZero: false,
})

console.log(
  `${TAG} PASS - ${instructionsFound} scan instruction(s), each with a QR beside it; the enrolment page keeps its secret and URI fallbacks.`,
)
process.exit(0)
