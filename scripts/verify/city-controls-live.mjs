/**
 * EVERY CITY CONTROL, PRESSED ON A LIVE SITE (21 November 2026, the PM's 20:41 and 20:45).
 *
 * For every guide city, every address a city control sends (scripts/verify/lib/city-control-targets.mjs, the list the
 * unit test walks) is requested and its redirects followed one hop at a time. PASS needs every target to end 200 on
 * /events or on that city's own guide, and on the guide only when nothing else /events reads was asked (nothing
 * pressed is dropped). Prints one line per failure and a summary; exit 1 on any failure.
 *
 *   node --import ./scripts/lib/src-alias-loader.mjs scripts/verify/city-controls-live.mjs https://www.eventlinqs.com.au
 *
 * Read only: GET requests, six at a time.
 */
import { getAllCities } from '../../src/lib/cities/data.ts'
import { EVENTS_PARAM_KEYS } from '../../src/lib/events/events-param-keys.ts'
import { cityControlTargets } from './lib/city-control-targets.mjs'

const BASE = (process.argv[2] ?? '').replace(/\/+$/, '')
if (!/^https?:\/\//.test(BASE)) {
  console.error('usage: city-controls-live.mjs <base url>')
  process.exit(2)
}

async function walk(path) {
  let url = new URL(path, BASE)
  const hops = []
  for (let i = 0; i < 6; i++) {
    const res = await fetch(url, { redirect: 'manual', headers: { 'user-agent': 'EventLinqs city-controls-live' } })
    hops.push(`${res.status} ${url.pathname}${url.search}`)
    const to = res.headers.get('location')
    if (res.status >= 300 && res.status < 400 && to) {
      url = new URL(to, url)
      continue
    }
    return { status: res.status, url, hops }
  }
  return { status: 0, url, hops: [...hops, 'too many hops'] }
}

const jobs = []
for (const c of getAllCities()) for (const [control, path] of cityControlTargets(c)) jobs.push({ c, control, path })

const failures = []
let next = 0
async function worker() {
  while (next < jobs.length) {
    const { c, control, path } = jobs[next++]
    let r
    try {
      r = await walk(path)
    } catch (e) {
      failures.push(`${c.name}, ${control}: ${path} -> ${e instanceof Error ? e.message : String(e)}`)
      continue
    }
    const where = r.url.pathname
    const onGuide = where === `/city/${c.slug}`
    const asked = [...new URL(path, BASE).searchParams].filter(([k, v]) => v !== '' && k !== 'city' && EVENTS_PARAM_KEYS.includes(k))
    const why =
      r.status !== 200 ? `ended ${r.status}` :
      !(onGuide || where === '/events') ? `ended on ${where}, not /events or /city/${c.slug}` :
      onGuide && asked.length > 0 ? `the guide dropped ${asked.map(([k]) => k).join(', ')}` :
      null
    if (why) failures.push(`${c.name}, ${control}: ${path} ${why} (${r.hops.join(' > ')})`)
  }
}
await Promise.all(Array.from({ length: 6 }, worker))

for (const f of failures) console.log(`FAIL ${f}`)
console.log(`${failures.length === 0 ? 'PASS' : 'FAIL'} city controls on ${BASE}: ${jobs.length - failures.length} of ${jobs.length} targets end 200 on the page that honours them (${getAllCities().length} cities)`)
process.exit(failures.length === 0 ? 0 : 1)
