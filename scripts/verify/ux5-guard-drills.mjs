/**
 * Drills `scannable-instruction-has-a-qr` RED on every clause and GREEN again
 * after every restore, and drills the one thing a guard like this usually gets
 * wrong: firing on prose that merely MENTIONS scanning.
 *
 * The last drill is the important one. Clause 1 has to tell an order to the
 * reader ("scan the QR code") apart from a statement about the world ("one
 * person can scan multiple QR codes"), and the second of those is real copy
 * already in this tree. A guard that cannot tell them apart fails the build on
 * a help article, gets switched off, and then the defect it existed to stop
 * ships again. So the narrowing is proved to HOLD, not just asserted.
 *
 * Usage: node scripts/verify/ux5-guard-drills.mjs [outDir]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const OUT = process.argv[2] ?? 'C:/dev/EVIDENCE/UX5'
mkdirSync(OUT, { recursive: true })

const GUARD = 'scripts/guards/scannable-instruction-has-a-qr.mjs'
const ENROL = 'src/app/admin/(authed)/enrol-2fa/page.tsx'
/* A rendered surface that draws no QR, used to prove clause 1 bites tree-wide
 * and not only on the one page it was written for. */
const OTHER_SURFACE = 'src/app/admin/(authed)/enrol-2fa/enrol-form.tsx'

const run = () => {
  const r = spawnSync(process.execPath, [GUARD], { encoding: 'utf8', env: process.env })
  return { code: r.status, text: ((r.stdout ?? '') + (r.stderr ?? '')).trim() }
}

const drills = [
  {
    clause: 1,
    name: 'the enrolment page keeps the instruction and loses the picture (the defect that shipped)',
    file: ENROL,
    expect: 1,
    break: t => t.replace(/qrSvg = await QRCode\.toString\(/, 'qrSvg = await notAQrAtAll('),
  },
  {
    clause: 1,
    name: 'another rendered surface tells a person to scan a QR it does not draw',
    file: OTHER_SURFACE,
    expect: 1,
    break: t =>
      t.replace(
        'Type the 6-digit code your authenticator is currently showing.',
        'Scan the QR code with your authenticator, then type the 6-digit code it shows.',
      ),
  },
  {
    clause: 2,
    name: 'the base32 secret fallback is removed, leaving a person with only a picture',
    file: ENROL,
    expect: 1,
    break: t => t.replace('{prep.secretBase32}', '{/* removed */}'),
  },
  {
    clause: 2,
    name: 'the otpauth URI fallback is removed',
    file: ENROL,
    expect: 1,
    break: t => t.replace('{prep.otpauthUri}', '{/* removed */}'),
  },
  {
    clause: 3,
    name: 'the QR is built from the bare secret instead of the URI the page prints',
    file: ENROL,
    expect: 1,
    break: t => t.replace('QRCode.toString(prep.otpauthUri', 'QRCode.toString(prep.secretBase32'),
  },
  {
    /*
     * THE NEGATIVE DRILL. Descriptive prose about scanning must NOT fail the
     * build. `src/lib/help-content.ts` already answers "One person can scan
     * multiple QR codes from the same phone", and the first version of this
     * guard went red on exactly that sentence.
     */
    clause: 1,
    name: 'NEGATIVE: descriptive prose about scanning must not fail the build',
    file: OTHER_SURFACE,
    expect: 0,
    break: t =>
      t.replace(
        'Type the 6-digit code your authenticator is currently showing.',
        'Your authenticator can scan a QR code, and staff will scan the QR code on the ticket at the door.',
      ),
  },
]

const lines = ['THE SCAN-INSTRUCTION GUARD, DRILLED BOTH WAYS', '='.repeat(45), '']
let ok = true

const green = run()
lines.push(`BASELINE ${GUARD}  exit ${green.code}`, ...green.text.split('\n').map(l => `    ${l}`), '')
if (green.code !== 0) ok = false

for (const drill of drills) {
  const original = readFileSync(drill.file, 'utf8')
  const broken = drill.break(original)
  if (broken === original) {
    lines.push(`DRILL clause ${drill.clause} :: ${drill.name}: THE BREAK DID NOTHING, so nothing was proved.`, '')
    ok = false
    continue
  }
  writeFileSync(drill.file, broken)
  const red = run()
  writeFileSync(drill.file, original)
  const back = run()
  const verdict =
    drill.expect === 1
      ? red.code === 1
        ? 'RED, as required'
        : 'DID NOT FAIL'
      : red.code === 0
        ? 'STAYED GREEN, as required'
        : 'FIRED ON PROSE, which is the false positive this drill exists to stop'
  lines.push(
    `DRILL clause ${drill.clause}  (expect exit ${drill.expect})`,
    `  ${drill.name}`,
    `  mutated  exit ${red.code}   ${verdict}`,
    ...red.text.split('\n').map(l => `      ${l}`),
    `  restored exit ${back.code}  ${back.code === 0 ? 'GREEN again' : 'STILL RED'}`,
    '',
  )
  if (red.code !== drill.expect || back.code !== 0) ok = false
}

lines.push(ok ? `ALL ${drills.length} DRILLS BEHAVED AS REQUIRED.` : 'A DRILL DID NOT BEHAVE. See above.')
const text = lines.join('\n') + '\n'
writeFileSync(join(OUT, 'ux5-guard-drill.txt'), text)
console.log(text)
process.exit(ok ? 0 : 1)
