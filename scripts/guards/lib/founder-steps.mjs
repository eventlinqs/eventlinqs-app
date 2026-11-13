/**
 * THE FOUNDER STEP LAW, AS RULES A MACHINE CAN JUDGE (Lawal, 12 November 2026, 01:16, through the PM: "NO STEP REACHES
 * LAWAL UNREAD ... THE SCRIPT ENFORCES IT, NOT MEMORY").
 *
 * The error it ends: at 00:44 a window wrote, for Lawal, "cd C:\dev\EventLinqs\wt-ticketmaster; npm run
 * migrate:production"; it had never been run that way in that folder, the folder then moved, and at 01:14 it found 0
 * pending and did nothing.
 *
 * The rules, for every founder step written on or after the law (EFFECTIVE below):
 *   1. A founder step carries its read back beside it: the words READ BACK and what the window read when it ran the
 *      step's read only form, in the folder named. A founder step is a line that addresses Lawal in capitals (LAWAL) or
 *      says FOUNDER STEP, and names something to run (npm run, cd into a folder, a .ps1, node scripts/, npx).
 *   2. Any line naming `npm run migrate:production` names its --expect.
 *   3. Every open row of Lawal's list (a numbered table row above '## Removed') carries READ BACK.
 *   4. A script that an open founder step names (directly, or through package.json's npm script) prints where it runs:
 *      it imports scripts/lib/founder-where.mjs.
 * Pure: the guard reads the files and hands their text here.
 *
 * ONLY EVENTLINQS' OWN NOTES ARE JUDGED (the PM's 13:08 of 13 November 2026): a line in EventLinqs' mark, 'EL | ', as
 * its notes script writes it. The notes file is shared with Bookedproof's window, whose lines ('- 13 Nov 2026 ...') its
 * own gate judges; on 13 November its report of 11:05 quoted the PM's heading with LAWAL in capitals beside a node
 * command, read as a step handed to Lawal, and blocked every EventLinqs gate.
 */

/** The law's moment, in the founder's zone, as written in the notes ('12 Nov 2026 01:16'). Lines before it are history
 * and are corrected by the sweep (the PM's item 3), not judged; a boundary keeps the gate able to go green. */
export const EFFECTIVE = '2026-11-12 01:16'

const MONTHS = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' }

/** '2026-11-12 01:18' from a note line ('EL | 12 Nov 2026 01:18 | ...' or '- 12 Nov 2026 01:12 | ...'), else null. */
export function stampOf(line) {
  const m = line.slice(0, 40).match(/\b(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4}) (\d{2}):(\d{2})\b/)
  if (!m) return null
  return `${m[3]}-${MONTHS[m[2]]}-${m[1].padStart(2, '0')} ${m[4]}:${m[5]}`
}

/** EventLinqs' own note: its notes script's mark at the start of the line. */
export const EVENTLINQS_NOTE = /^EL \| /

const RUNS = /npm run [\w:.-]+|\bcd [A-Za-z]:\\|\.ps1\b|\bnode scripts[\\/]|\bnpx [\w@./-]+/

/**
 * The read back, said: READ BACK in any case (WINDOW 6's sweep of 12 November 2026, 11:22 wrote "read back beside
 * each"), never in a line that says it was not read back or is unread.
 */
export function saysReadBack(line) {
  return /\bread back\b/i.test(line) && !/\b(?:not|never|no)\s+(?:yet\s+)?read back\b|\bunread\b/i.test(line)
}

/** A line that hands Lawal something to run. */
export function isFounderStep(line) {
  return (/\bLAWAL\b/.test(line) || /\bFOUNDER STEP\b/.test(line)) && RUNS.test(line)
}

/** The npm scripts and script files a line names. */
export function scriptsNamed(line, npmScripts = {}) {
  const out = new Set()
  for (const m of line.matchAll(/npm run ([\w:.-]+)/g)) {
    const body = npmScripts[m[1]]
    if (typeof body !== 'string') continue
    // A file given to node's --import (scripts/lib/src-alias-loader.mjs) is a module hook loaded before the step's script,
    // not the step's script: the script it loads is the one that must say where it runs (WINDOW 5A, 13 November 2026).
    const loaders = new Set([...body.matchAll(/--import[= ]+(?:\.\/)?(scripts\/[\w/.-]+\.mjs)/g)].map((x) => x[1]))
    for (const f of body.matchAll(/scripts\/[\w/.-]+\.mjs/g)) if (!loaders.has(f[0])) out.add(f[0])
  }
  for (const m of line.matchAll(/scripts[\\/](?:ops|lib|verify)[\\/][\w.-]+\.mjs/g)) out.add(m[0].replace(/\\/g, '/'))
  return [...out]
}

/**
 * Rules 1 and 2 over a notes file. Returns each fault with its line number, and the open founder steps (for rule 4).
 * @param {string} text
 * @param {string} [effective]
 */
export function judgeNotes(text, effective = EFFECTIVE) {
  const faults = []
  const steps = []
  text.split(/\r?\n/).forEach((line, i) => {
    if (!EVENTLINQS_NOTE.test(line)) return
    const at = stampOf(line)
    if (!at || at < effective) return
    if (isFounderStep(line)) {
      steps.push(line)
      if (!saysReadBack(line)) faults.push(`line ${i + 1} (${at}): a founder step with no READ BACK beside it: ${line.slice(0, 110)}`)
    }
    if (/npm run migrate:production/.test(line) && !/--expect\s+\S/.test(line)) {
      faults.push(`line ${i + 1} (${at}): names npm run migrate:production with no --expect: ${line.slice(0, 110)}`)
    }
  })
  return { faults, steps }
}

/**
 * Rule 3 over Lawal's list: every numbered table row above '## Removed' carries READ BACK.
 * @param {string} text
 */
export function judgeList(text) {
  const faults = []
  const steps = []
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^##\s+Removed/i.test(line)) break
    if (!/^\|\s*\d+\s*\|/.test(line)) continue
    steps.push(line)
    if (!/\bREAD BACK\b/.test(line)) faults.push(`line ${i + 1}: an open step with no READ BACK: ${line.slice(0, 110)}`)
    if (/npm run migrate:production/.test(line) && !/--expect\s+\S/.test(line)) faults.push(`line ${i + 1}: npm run migrate:production with no --expect`)
  }
  return { faults, steps }
}

/**
 * Whether a script prints where it runs: it IMPORTS sayWhere from founder-where.mjs and CALLS it. A file that only names
 * founder-where.mjs (in a comment) does not: the guard's own drill found that, 12 November 2026, when the migration
 * script's import was broken and its header comment alone still passed.
 * @param {string} src
 */
export function printsWhere(src) {
  const imports = /import\s*\{[^}]*\bsayWhere\b[^}]*\}\s*from\s*['"][^'"]*\/founder-where\.mjs['"]/.test(src)
  const calls = /(^|[^\w.])sayWhere\(/m.test(src.replace(/import\s*\{[^}]*\}\s*from\s*['"][^'"]*['"]/g, ''))
  return imports && calls
}

/**
 * Rule 4: every script an open founder step names prints where it runs.
 * @param {string[]} steps
 * @param {Record<string, string>} npmScripts
 * @param {(rel: string) => string | null} read  a repo file's text, or null when absent
 */
export function judgeScripts(steps, npmScripts, read) {
  const faults = []
  const seen = new Set()
  for (const line of steps) {
    for (const rel of scriptsNamed(line, npmScripts)) {
      if (seen.has(rel)) continue
      seen.add(rel)
      const src = read(rel)
      if (src === null) faults.push(`${rel}, named by a founder step, is not in this tree`)
      else if (!printsWhere(src)) faults.push(`${rel}, named by a founder step, does not print where it runs (import scripts/lib/founder-where.mjs and call sayWhere first)`)
    }
  }
  return { faults, judged: seen.size }
}
