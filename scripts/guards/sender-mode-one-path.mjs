/**
 * GUARD: THE SENDER'S MODE IS SET IN ONE PLACE IN THE CODE (the PM's 03:38 of 19 November 2026: "a record that only a mode
 * change writes (who, when, from and to), with every path that sets the sender's mode writing it ... and a guard that
 * names any write to outreach_sender.mode outside that path").
 *
 * Car D's migration (20261119040001_sender_mode_record.sql) has the sender's own trigger write outreach_sender_mode_changes
 * for every mode change, whatever made it, so a direct write in SQL is recorded too. In the code, the one path that sets the
 * mode is the admin switch (src/app/admin/(authed)/automation/actions.ts), which names its person and writes the audit
 * log. This guard fails the build when any other file under src writes the mode, so a second path cannot appear unseen.
 * The DNS check writes only its own columns and is not a mode write. Reads src only (always on the build host).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const TAG = '[sender-mode-one-path]'
const ROOT = 'src'
const THE_ONE_PATH = 'src/app/admin/(authed)/automation/actions.ts'

const files = []
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.(ts|tsx|mts|mjs|js)$/.test(name)) files.push(p.replace(/\\/g, '/'))
  }
}
walk(ROOT)

const writes = []
for (const f of files) {
  const text = readFileSync(f, 'utf8').replace(/\r\n/g, '\n')
  // A Supabase update of the sender whose object names the mode, within the call.
  for (const m of text.matchAll(/from\(\s*['"]outreach_sender['"]\s*\)\s*\.\s*(update|upsert|insert)\s*\(\s*\{([^}]*)\}/g)) {
    if (/\bmode\s*:/.test(m[2])) writes.push(f)
  }
  // SQL in a string: an update of the sender that sets its mode.
  if (/update\s+(public\.)?outreach_sender\s+set\s+[^;'"`]*\bmode\s*=/i.test(text)) writes.push(f)
}
const elsewhere = [...new Set(writes)].filter((f) => f !== THE_ONE_PATH)
const atTheOnePath = writes.includes(THE_ONE_PATH)

console.log(`${TAG} ${files.length} source file(s) read under ${ROOT}; the mode is written at ${atTheOnePath ? THE_ONE_PATH : 'no path at all'}`)
if (!atTheOnePath) {
  console.error(`${TAG} FAIL: the admin switch (${THE_ONE_PATH}) no longer writes the sender's mode; this guard's one path moved, so read where and say it here`)
  process.exit(1)
}
if (elsewhere.length > 0) {
  console.error(`${TAG} FAIL: the sender's mode is written outside the one path:`)
  for (const f of elsewhere) console.error(`  ${f}`)
  console.error(`${TAG} Set the mode through the admin switch, which names its person and writes the audit log (the trigger records every change either way).`)
  process.exit(1)
}
console.log(`${TAG} PASS: the sender's mode is written in the code only by the admin switch; every change, by any path, is recorded by the trigger`)
