/**
 * THE FOUNDER'S ONE COMMAND after pasting a Google Maps server key (Law 10).
 *
 * Prints, for the server key and the browser key, what Google answers on the
 * Geocoding API, so the whole posture of item A3 (Scope v5 3.1.1) is read off
 * one screen. Never prints a key; prints an 8-hex fingerprint.
 *
 *   node --env-file=.env.local scripts/ops/verify-google-maps-keys.mjs
 *
 * What it means:
 *   server key OK                     server geocoding and the backfill can run
 *   server key REQUEST_DENIED         the key is wrong for this API (referer
 *                                     restricted, API not enabled, or billing)
 *   server key == browser key         the founder's step is still open
 *   browser key REQUEST_DENIED with   correct and expected: a browser key is
 *   "referer restrictions"            referer restricted and must not serve
 *                                     server APIs
 *
 * For the Vercel stores, pull the values first (they are not this machine's):
 *   npx vercel@55 env pull .tmp/production.env --environment=production --yes
 *   node --env-file=.tmp/production.env scripts/ops/verify-google-maps-keys.mjs
 *   (and delete .tmp/production.env afterwards; .tmp/ is gitignored)
 */
import { classifyKeys, fingerprint, judge, probeGeocoding } from '../guards/lib/geocoding-key-posture.mjs'

const server = (process.env.GOOGLE_MAPS_API_KEY ?? '').trim()
const browser = (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '').trim()

console.log('Google Maps key posture')
console.log(`  GOOGLE_MAPS_API_KEY              ${server ? `present, fp ${fingerprint(server)}` : 'ABSENT'}`)
console.log(`  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY  ${browser ? `present, fp ${fingerprint(browser)}` : 'ABSENT'}`)

if (browser) {
  const b = await probeGeocoding(browser)
  console.log(`  browser key on the Geocoding API: ${b.status}${b.message ? ` (${b.message})` : ''}`)
  if (b.status === 'OK') {
    console.log('  WARNING: the browser key serves the Geocoding API, so it is NOT referer restricted;')
    console.log('  a public key with no referer restriction can be lifted from any page and billed to you.')
  }
}

const classification = classifyKeys(server, browser)
const probe = classification.shape === 'DISTINCT' ? await probeGeocoding(server) : null
const { verdict, lines } = judge(classification, probe)
console.log(`  server key verdict: ${verdict}`)
for (const l of lines) console.log(`    ${l}`)
// exitCode rather than process.exit(): on Node 24 for Windows, exiting straight after a
// fetch trips libuv's UV_HANDLE_CLOSING assertion (exit 127) while the socket closes.
process.exitCode = verdict === 'FAIL' ? 1 : 0
