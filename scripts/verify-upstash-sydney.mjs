#!/usr/bin/env node
/**
 * INFRA-01 verification: prove the live Upstash Redis is in the Sydney region
 * (ap-southeast-2) and that latency from Vercel SYD compute is single-digit /
 * sub-20ms.
 *
 * Hits the deployed /api/health/redis endpoint, which derives the region from
 * the configured UPSTASH_REDIS_REST_URL hostname and PINGs Redis for latency.
 * Run it against the warmed production (or preview) deployment AFTER swapping
 * the Vercel env vars to the Sydney instance and redeploying.
 *
 * Usage:
 *   node scripts/verify-upstash-sydney.mjs https://www.eventlinqs.com
 *
 * Sydney Upstash REST hostnames carry an AU region code (e.g. `apse2-...` or
 * `ap-southeast-2`). PASS = region looks AU/Sydney AND latency < 20ms.
 */

const base = (process.argv[2] || 'https://www.eventlinqs.com').replace(/\/$/, '')
const url = `${base}/api/health/redis`

const res = await fetch(url, { headers: { 'cache-control': 'no-cache' } })
const body = await res.json().catch(() => ({}))

console.log(`GET ${url} -> HTTP ${res.status}`)
console.log(JSON.stringify(body, null, 2))

const region = String(body.region ?? '').toLowerCase()
const latency = typeof body.latencyMs === 'number' ? body.latencyMs : null

// Sydney region codes Upstash exposes in the REST subdomain.
const SYDNEY = ['apse2', 'apse', 'syd', 'ap-southeast-2', 'au']
const regionOk = SYDNEY.some(code => region.includes(code))
const latencyOk = latency !== null && latency < 20

console.log(`region "${region}" Sydney? ${regionOk}`)
console.log(`latencyMs ${latency} < 20? ${latencyOk}`)

if (res.status === 200 && regionOk && latencyOk) {
  console.log('PASS: Upstash Redis is Sydney-region with sub-20ms latency.')
  process.exit(0)
}
console.error('FAIL: region is not Sydney and/or latency >= 20ms. Provision the ap-southeast-2 instance, swap the Vercel env vars, redeploy, then re-run.')
process.exit(1)
