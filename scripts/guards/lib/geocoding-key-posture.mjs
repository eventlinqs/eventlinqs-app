/**
 * THE GEOCODING KEY POSTURE, decided in one place for the guard, the founder's
 * verification script and the tests.
 *
 * Three shapes, and what each means:
 *
 *   ABSENT      GOOGLE_MAPS_API_KEY is not set. Server geocoding is off by a
 *               visible decision (src/lib/geo/geocode.ts says so on every skip).
 *               Not a build failure: the platform runs without it, the Places
 *               pick in the organiser form still fills coordinates.
 *   BROWSER     GOOGLE_MAPS_API_KEY equals NEXT_PUBLIC_GOOGLE_MAPS_API_KEY. The
 *               state found on 4 September 2026 in production, preview and
 *               local: a referer-restricted browser key standing in for a
 *               server key, which Google answers with REQUEST_DENIED. Also off
 *               by decision, and named as the founder's step (mint a server
 *               key). Not a build failure, for the same reason.
 *   DISTINCT    A separate server key is present. THIS is the shape that can
 *               fail silently: it looks configured, and if it is wrong, expired
 *               or unrestricted-for-the-wrong-API every save and the whole
 *               backfill get REQUEST_DENIED at runtime while every gate stays
 *               green. So a distinct key is PROBED, one Geocoding request for
 *               a fixed address, and a denial fails the build.
 *
 * The probe is the only network call and costs one geocode per build. The key
 * is never printed; a fingerprint (first 8 hex of its SHA-256) is.
 */
import { createHash } from 'node:crypto'

export const GEOCODING_ENDPOINT = 'https://maps.googleapis.com/maps/api/geocode/json'
/** A fixed, unambiguous Australian address the probe geocodes. */
export const PROBE_ADDRESS = 'Parliament House, Canberra ACT 2600, Australia'

export function fingerprint(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 8)
}

/** @returns {{ shape: 'ABSENT' | 'BROWSER' | 'DISTINCT', serverFp: string | null }} */
export function classifyKeys(serverKey, publicKey) {
  const server = (serverKey ?? '').trim()
  const pub = (publicKey ?? '').trim()
  if (!server) return { shape: 'ABSENT', serverFp: null }
  if (pub && pub === server) return { shape: 'BROWSER', serverFp: fingerprint(server) }
  return { shape: 'DISTINCT', serverFp: fingerprint(server) }
}

/**
 * Probe a key against the Geocoding API. Returns Google's status and message,
 * never throws for a Google-side outcome. `fetchImpl` is injectable for tests.
 * @param {string} key
 * @param {(url: string) => Promise<{ status: number, json: () => Promise<any> }>} [fetchImpl]
 * @returns {Promise<{ status: string, message: string, http: number }>}
 */
export async function probeGeocoding(key, fetchImpl = (url) => fetch(url)) {
  const params = new URLSearchParams({ address: PROBE_ADDRESS, region: 'au', key })
  let res
  try {
    res = await fetchImpl(GEOCODING_ENDPOINT + '?' + params.toString())
  } catch (err) {
    return { status: 'UNREACHABLE', message: err instanceof Error ? err.message : String(err), http: 0 }
  }
  let body
  try {
    body = await res.json()
  } catch {
    return { status: 'MALFORMED', message: 'not JSON', http: res.status }
  }
  return {
    status: typeof body?.status === 'string' ? body.status : 'MALFORMED',
    message: typeof body?.error_message === 'string' ? body.error_message : '',
    http: res.status,
  }
}

/**
 * The verdict the guard prints. Pure over the classification and the probe so
 * every branch is a unit test.
 * @returns {{ verdict: 'PASS' | 'SKIP' | 'FAIL', lines: string[] }}
 */
export function judge(classification, probe) {
  const { shape, serverFp } = classification
  if (shape === 'ABSENT') {
    return {
      verdict: 'SKIP',
      lines: [
        'GOOGLE_MAPS_API_KEY is not set, so server geocoding is OFF by decision.',
        'Typed addresses save without coordinates; a Places pick still carries them.',
        'FOUNDER STEP (KEY ONLY): mint a Google Maps Platform server key with the',
        'Geocoding API enabled and no referer restriction, store it as',
        'GOOGLE_MAPS_API_KEY (Sensitive) on production and preview, then run',
        '  node --env-file=.env.local scripts/ops/verify-google-maps-keys.mjs',
      ],
    }
  }
  if (shape === 'BROWSER') {
    return {
      verdict: 'SKIP',
      lines: [
        `GOOGLE_MAPS_API_KEY (fp ${serverFp}) is the SAME VALUE as the public browser key.`,
        'A referer-restricted key cannot serve the Geocoding API (Google: "API keys with',
        'referer restrictions cannot be used with this API"), so server geocoding is OFF',
        'by decision and the code never attempts it. Not a failure: the shape is known and named.',
        'FOUNDER STEP (KEY ONLY): mint a separate server key (Geocoding API, no referer',
        'restriction, IP-restricted to Vercel if you like), store it as GOOGLE_MAPS_API_KEY',
        '(Sensitive) on production and preview, then run',
        '  node --env-file=.env.local scripts/ops/verify-google-maps-keys.mjs',
      ],
    }
  }
  if (!probe) {
    return { verdict: 'FAIL', lines: [`GOOGLE_MAPS_API_KEY (fp ${serverFp}) is distinct from the browser key but was not probed.`] }
  }
  if (probe.status === 'OK') {
    return { verdict: 'PASS', lines: [`GOOGLE_MAPS_API_KEY (fp ${serverFp}) geocoded "${PROBE_ADDRESS}": OK.`] }
  }
  if (probe.status === 'UNREACHABLE') {
    return {
      verdict: 'SKIP',
      lines: [`the Geocoding API could not be reached from this build (${probe.message}), so the key's posture is UNKNOWN, not good.`],
    }
  }
  return {
    verdict: 'FAIL',
    lines: [
      `GOOGLE_MAPS_API_KEY (fp ${serverFp}) is a distinct server key and Google answered ${probe.status}${probe.message ? ': ' + probe.message : ''}.`,
      'This is the silent shape: the key looks configured and every save and the whole backfill',
      'would be refused at runtime with every gate green. Fix the key (enable the Geocoding API,',
      'remove the referer restriction, check billing) or remove it so the decision is visible.',
    ],
  }
}
