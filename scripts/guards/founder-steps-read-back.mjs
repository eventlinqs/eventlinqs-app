/**
 * FOUNDER STEPS ARE READ BACK BEFORE THEY REACH LAWAL (the founder step law, Lawal, 12 November 2026, 01:16).
 *
 * Reads the shared progress notes and Lawal's EventLinqs list on the build machine, and fails when a founder step
 * written on or after the law has no read back beside it, when a migrate:production line has no --expect, or when a
 * script an open founder step names does not print the folder, branch and commit it runs from. The rules and why they
 * exist: scripts/guards/lib/founder-steps.mjs.
 *
 * Those files live on the build machine, outside the repository, so on a host without them (CI, Vercel) this guard
 * says NOT JUDGED HERE for each and passes; the pre-push gate, which runs on the machine where the steps are written,
 * judges them. FOUNDER_STEP_NOTES and FOUNDER_STEP_LIST name other files (a test's fixtures).
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { judgeList, judgeNotes, judgeScripts } from './lib/founder-steps.mjs'

const TAG = '[founder-steps-read-back]'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const NOTES = process.env.FOUNDER_STEP_NOTES || 'C:/dev/START-16OCT/PROGRESS-8NOV.md'
const LIST = process.env.FOUNDER_STEP_LIST || 'C:/dev/START-16OCT/EL-LAWAL-LIST-8NOV.md'

const npmScripts = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts ?? {}
const readRepo = (rel) => {
  const p = join(ROOT, rel)
  return existsSync(p) ? readFileSync(p, 'utf8') : null
}

const faults = []
const steps = []
let judged = 0
for (const [file, judge] of [[NOTES, judgeNotes], [LIST, judgeList]]) {
  if (!existsSync(file)) {
    console.log(`${TAG} NOT JUDGED HERE: ${file} is not on this host (it lives on the build machine).`)
    continue
  }
  judged += 1
  const r = judge(readFileSync(file, 'utf8'))
  for (const f of r.faults) faults.push(`${file}: ${f}`)
  steps.push(...r.steps)
}
const scripts = judgeScripts(steps, npmScripts, readRepo)
faults.push(...scripts.faults)

if (faults.length > 0) {
  console.error(`${TAG} FAIL: ${faults.length} founder step fault(s). No step reaches Lawal unread (the founder step law):`)
  for (const f of faults) console.error(`${TAG}   ${f}`)
  process.exit(1)
}
console.log(`${TAG} PASS: ${judged} file(s) judged, ${steps.length} open founder step(s), each read back; ${scripts.judged} script(s) they name print where they run.`)
