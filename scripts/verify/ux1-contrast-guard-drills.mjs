/**
 * Drills `tinted-text-meets-contrast` RED on the real regression and GREEN
 * again after the restore, and drills the two things a guard like this gets
 * wrong: firing on a composite colour it cannot actually measure, and passing
 * on a token table it failed to read.
 *
 * Usage: node scripts/verify/ux1-contrast-guard-drills.mjs [outDir]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const OUT = process.argv[2] ?? 'C:/dev/EVIDENCE/UX1'
mkdirSync(OUT, { recursive: true })

const GUARD = 'scripts/guards/tinted-text-meets-contrast.mjs'
const BADGE = 'src/components/inventory/social-proof-badge.tsx'
const CSS = 'src/app/globals.css'

const run = () => {
  const r = spawnSync(process.execPath, [GUARD], { encoding: 'utf8', env: process.env })
  return { code: r.status, text: ((r.stdout ?? '') + (r.stderr ?? '')).trim() }
}

const drills = [
  {
    name: 'the exact regression: the Selling Fast badge goes back to coral-600 on coral-100 (3.42:1)',
    file: BADGE,
    expect: 1,
    break: t => t.replace("'bg-coral-100 text-coral-700'", "'bg-coral-100 text-coral-600'"),
  },
  {
    name: 'the other half of the sweep: a Sold Out badge back to ink-400 on ink-100 (4.13:1)',
    file: BADGE,
    expect: 1,
    break: t => t.replace("'bg-ink-100 text-ink-600'", "'bg-ink-100 text-ink-400'"),
  },
  {
    name: 'a token darkened in globals.css is picked up, because the table is READ not held',
    file: CSS,
    expect: 1,
    // Lighten coral-700 back past the floor. The guard carries no copy of the
    // value, so it must follow the stylesheet.
    break: t => t.replace('--color-coral-700: #B8321E;', '--color-coral-700: #E63E2C;'),
  },
  {
    /*
     * NEGATIVE. A composite colour depends on what is behind it, which a source
     * file does not know, so the guard must leave it to axe rather than invent
     * a ratio. If this ever goes red the guard has started guessing.
     */
    name: 'NEGATIVE: an opacity modifier is left to axe, never guessed at',
    file: BADGE,
    expect: 0,
    break: t => t.replace("'bg-ink-100 text-ink-600'", "'bg-ink-100/50 text-ink-400/50'"),
  },
]

const lines = ['THE TINTED-TEXT CONTRAST GUARD, DRILLED BOTH WAYS', '='.repeat(49), '']
let ok = true

const green = run()
lines.push(`BASELINE ${GUARD}  exit ${green.code}`, ...green.text.split('\n').map(l => `    ${l}`), '')
if (green.code !== 0) ok = false

for (const drill of drills) {
  const original = readFileSync(drill.file, 'utf8')
  const broken = drill.break(original)
  if (broken === original) {
    lines.push(`DRILL :: ${drill.name}: THE BREAK DID NOTHING, so nothing was proved.`, '')
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
        : 'FIRED ON A COMPOSITE IT CANNOT MEASURE'
  lines.push(
    `DRILL (expect exit ${drill.expect})`,
    `  ${drill.name}`,
    `  mutated  exit ${red.code}   ${verdict}`,
    ...red.text.split('\n').slice(0, 8).map(l => `      ${l}`),
    `  restored exit ${back.code}  ${back.code === 0 ? 'GREEN again' : 'STILL RED'}`,
    '',
  )
  if (red.code !== drill.expect || back.code !== 0) ok = false
}

lines.push(ok ? `ALL ${drills.length} DRILLS BEHAVED AS REQUIRED.` : 'A DRILL DID NOT BEHAVE. See above.')
const text = lines.join('\n') + '\n'
writeFileSync(join(OUT, 'ux1-contrast-guard-drill.txt'), text)
console.log(text)
process.exit(ok ? 0 : 1)
