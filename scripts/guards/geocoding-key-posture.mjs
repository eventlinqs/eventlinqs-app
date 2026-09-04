/**
 * GEOCODING KEY POSTURE. A distinct server key that Google refuses is the silent
 * shape (configured-looking, serving nothing), and this fails the build for it.
 * An absent key, or the browser key standing in for the server key, is a known
 * decision and is SKIPPED loudly with the founder's step named. The decision
 * logic and the probe live in ./lib/geocoding-key-posture.mjs so the founder's
 * verification script and the tests share them.
 *
 * Registered in run-guards.mjs, therefore blocking on prebuild. One Geocoding
 * request per build when a distinct key exists; none otherwise.
 */
import { existsSync, readFileSync } from 'node:fs'
import { classifyKeys, judge, probeGeocoding } from './lib/geocoding-key-posture.mjs'
import { declareWork } from '../lib/work-report.mjs'

// Same courtesy as schema-ahead-of-code: a local build without the variables in
// its environment reads the checked-in test env, so "nothing to check" is not
// mistaken for "checked".
if (!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY && existsSync('.env.test')) {
  for (const line of readFileSync('.env.test', 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
  }
}

const classification = classifyKeys(process.env.GOOGLE_MAPS_API_KEY, process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)
const probe = classification.shape === 'DISTINCT' ? await probeGeocoding(process.env.GOOGLE_MAPS_API_KEY.trim()) : null
const { verdict, lines } = judge(classification, probe)

const tag = '[geocoding-key-posture]'
// What this guard did, in numbers that move: two variables read every time, and
// one probe only when a distinct server key exists (steps-declare-work).
declareWork('geocoding-key-posture', {
  did: {
    'key variable read': 2,
    'geocoding probe sent': probe ? 1 : 0,
  },
  found: { 'refusal from Google': probe && probe.status !== 'OK' && probe.status !== 'UNREACHABLE' ? 1 : 0 },
  zeroIsFine: { 'geocoding probe sent': 'no distinct server key to probe; the shape is ABSENT or BROWSER and the decision is printed below' },
})
console.log(`${tag} ${verdict}${verdict === 'PASS' ? ' - ' : ' - '}${lines[0]}`)
for (const l of lines.slice(1)) console.log(`${tag}   ${l}`)
// exitCode rather than process.exit(): on Node 24 for Windows, exiting straight after a
// fetch trips libuv's UV_HANDLE_CLOSING assertion (exit 127) while the socket closes.
process.exitCode = verdict === 'FAIL' ? 1 : 0
