#!/usr/bin/env node
/**
 * HARD-03 verification: prove the public Mapbox token is URL-restricted to the
 * eventlinqs.com domains.
 *
 * A token restricted in the Mapbox dashboard (Account > Tokens > the public
 * token > URL restrictions: eventlinqs.com, www.eventlinqs.com) returns 403
 * Forbidden for any request whose Referer is a different origin, and 200 for an
 * allowed origin. This script fires both and asserts the contrast.
 *
 * Usage (founder runs after applying the restriction):
 *   NEXT_PUBLIC_MAPBOX_TOKEN=pk.xxxx node scripts/verify-mapbox-restriction.mjs
 *
 * Exit 0 = restriction is in force (foreign origin blocked, allowed origin OK).
 * Exit 1 = restriction NOT in force (foreign origin still served) or token unset.
 */

const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
if (!token) {
  console.error('FAIL: NEXT_PUBLIC_MAPBOX_TOKEN is not set in the environment.')
  process.exit(1)
}

// A cheap, restriction-enforced endpoint: a style document fetch.
const endpoint = `https://api.mapbox.com/styles/v1/mapbox/streets-v12?access_token=${encodeURIComponent(token)}`

async function probe(referer) {
  const res = await fetch(endpoint, { headers: { Referer: referer, Origin: new URL(referer).origin } })
  return res.status
}

const FOREIGN = 'https://evil.example.com/'
const ALLOWED = 'https://www.eventlinqs.com/'

const foreignStatus = await probe(FOREIGN)
const allowedStatus = await probe(ALLOWED)

console.log(`foreign origin (${FOREIGN}) -> HTTP ${foreignStatus}  (expect 403)`)
console.log(`allowed origin (${ALLOWED}) -> HTTP ${allowedStatus}  (expect 200)`)

const restricted = foreignStatus === 403 || foreignStatus === 401
const allowedOk = allowedStatus === 200

if (restricted && allowedOk) {
  console.log('PASS: Mapbox token is restricted to eventlinqs.com (foreign origin blocked, allowed origin served).')
  process.exit(0)
}
if (!restricted) {
  console.error('FAIL: foreign origin was NOT blocked - the token still has no URL restriction. Add eventlinqs.com + www.eventlinqs.com in the Mapbox dashboard.')
}
if (!allowedOk) {
  console.error(`FAIL: allowed origin returned ${allowedStatus} - the restriction may be too tight (add both apex and www).`)
}
process.exit(1)
