/**
 * A BUILD-TIME SCRIPT DECLARES WHAT THE BUILD HOST CANNOT GIVE IT.
 *
 * Close-out F2.1. Five deployments have been lost to one sentence that had been
 * named too narrowly. The class is not "docs get stripped":
 *
 *     THE VERCEL BUILD HOST IS NOT A DEVELOPER MACHINE.
 *     No docs. No git. No token. No developer environment of any kind.
 *
 * The fifth failure is the proof that the narrow name was the problem. Every
 * safeguard built after the fourth was about docs/, and the fifth arrived
 * through `.git`: stripped by the same ignore file, by the same mechanism, and
 * invisible to every docs-shaped guard in the tree.
 *
 * WHAT THIS FAILS ON, both directions, because a one-way check rots:
 *
 *   UNDECLARED  a script uses git, docs or a token and the registry does not say
 *               so. This is the close-out's requirement in as many words: "A
 *               script that needs git, docs, or a token, and does not declare
 *               it, fails the local gate."
 *   UNUSED      the registry declares a need the source no longer has. Without
 *               this the registry becomes a second place a claim can live, drifts
 *               out of step with the code, and is believed anyway. That is the
 *               shape of every list this repository has had to delete.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not judge whether a script COPES on
 * a host without the capability. Prose does not run, and a review that asserted
 * coping is exactly what let the fourth failure through (F1.9.1). Coping is
 * proved by execution, in excluded-reads-survive-the-upload.mjs, which runs every
 * declaring script inside a materialised upload.
 *
 * Run: node scripts/guards/build-host-needs-declared.mjs
 */
import { declareWork } from '../lib/work-report.mjs'
import { CAPABILITIES, CAPABILITY_NAMES, describeUse, scanBuildTimeScripts } from './lib/build-host.mjs'
import { DECLARED } from './lib/build-host-needs.mjs'
import { importClosure } from './lib/build-time-scripts.mjs'

const ROOT = process.cwd()
const TAG = '[build-host-needs-declared]'

const faults = []
const fail = (m) => {
  faults.push(m)
  console.error(`${TAG} FAIL: ${m}`)
}

const scanned = scanBuildTimeScripts(ROOT)
const onDiskEntries = new Set(scanned.map((s) => s.entry))
const counts = Object.fromEntries(CAPABILITY_NAMES.map((c) => [c, 0]))
let declaring = 0

console.log(`${TAG} what the build host does not have:`)
for (const name of CAPABILITY_NAMES) console.log(`${TAG}   ${name.padEnd(6)} ${CAPABILITIES[name]}`)

for (const { entry, uses } of scanned) {
  const used = Object.keys(uses).sort()
  const declared = Object.keys(DECLARED[entry] ?? {}).sort()
  if (used.length === 0 && declared.length === 0) continue
  if (used.length > 0) declaring += 1
  for (const c of used) counts[c] += 1

  for (const capability of used) {
    if (declared.includes(capability)) continue
    const where = uses[capability].map((u) => describeUse(capability, u)).slice(0, 3)
    fail(
      `${entry} uses ${capability} and does not declare it.\n` +
        `      ${capability} on the build host: ${CAPABILITIES[capability]}\n` +
        `      where:\n        ${where.join('\n        ')}\n` +
        `      Either stop reading it, or add to scripts/guards/lib/build-host-needs.mjs:\n` +
        `        '${entry}': { ${capability}: 'why, in one line' },`,
    )
  }

  for (const capability of declared) {
    if (used.includes(capability)) continue
    fail(
      `${entry} declares ${capability} and its code no longer uses it. ` +
        `Remove that key from scripts/guards/lib/build-host-needs.mjs. ` +
        `A declaration nothing backs is a second place a claim can live, and every list this repository ` +
        `has had to delete started as one entry that was true when it was written.`,
    )
  }
}

/*
 * EVERY GIT READER SAYS THE SAME SENTENCE. Close-out F2.4.
 *
 * Seven build-time scripts reach for git, and on the Vercel build log of
 * ffded236 they degraded in five different sets of words for one fact. Two of
 * them said the REMOTE was missing when there was no repository at all, and one
 * stated a mechanism - "a source tarball with no .git" - that is the exact
 * opposite of the truth that killed that deployment.
 *
 * So a script that declares a git need must REACH lib/git-availability.mjs, and
 * this fails the build when one does not. Without the clause the module is a
 * suggestion, and the eighth git reader writes a sixth sentence.
 *
 * Judged over the import CLOSURE, not the file, so a script that reaches it
 * through a helper satisfies this the same way Vercel would reach it.
 */
const AVAILABILITY = 'scripts/guards/lib/git-availability.mjs'
let gitReaders = 0
for (const [entry, needs] of Object.entries(DECLARED)) {
  if (!needs.git) continue
  if (!onDiskEntries.has(entry)) continue
  gitReaders += 1
  if (importClosure(ROOT, [entry]).includes(AVAILABILITY)) continue
  fail(
    `${entry} declares a git need and never reaches ${AVAILABILITY}.\n` +
      `      Every git-reading build-time script says the SAME sentence when there is no repository, because on\n` +
      `      9 September 2026 five of them said it five different ways in one build log, two of them claiming a\n` +
      `      missing REMOTE on a host with no repository at all.\n` +
      `      Import it and print noGitLine(TAG, what you wanted) on the path where git cannot answer.`,
  )
}

/*
 * AN ENTRY FOR A SCRIPT THAT NO LONGER EXISTS. Not covered by the loop above,
 * which walks the scripts that ARE on disk, so a renamed or deleted guard would
 * leave its declaration behind silently.
 */
for (const entry of Object.keys(DECLARED)) {
  if (onDiskEntries.has(entry)) continue
  fail(
    `scripts/guards/lib/build-host-needs.mjs declares ${entry}, which is not a prebuild entry point on disk. ` +
      `It was renamed or removed; delete the entry.`,
  )
}

for (const { entry, uses } of scanned) {
  const used = Object.keys(uses).sort()
  if (used.length === 0) continue
  console.log(`${TAG}   ${used.join(' ').padEnd(11)} ${entry}`)
}

declareWork('build-host-needs-declared', {
  did: {
    'prebuild entry point scanned': scanned.length,
    'entry point needing the host': declaring,
    'git reader sharing one sentence': gitReaders,
    ...Object.fromEntries(CAPABILITY_NAMES.map((c) => [`entry point needing ${c}`, counts[c]])),
  },
  found: { 'undeclared or stale declaration': faults.length },
  zeroIsFine: {
    'undeclared or stale declaration':
      'every build-time script declaring exactly what the build host cannot give it is the goal state, and it is the state five failed deployments were spent reaching',
  },
  exitOnZero: false,
})

if (faults.length > 0) {
  console.error('')
  console.error(
    `${TAG} FAIL - ${faults.length} fault(s). The build host is not a developer machine: no docs, no git, no token.`,
  )
  process.exit(1)
}

console.log(
  `${TAG} PASS - ${declaring} of ${scanned.length} prebuild entry point(s) need something the build host lacks, ` +
    `every one declared, and nothing declared that is not used. The uses are read out of the import graph, never listed.`,
)
console.log(
  `${TAG} ${gitReaders} build-time script(s) read git, and every one of them reaches ${AVAILABILITY}, ` +
    `so all ${gitReaders} say the same sentence when there is no repository (close-out F2.4).`,
)
