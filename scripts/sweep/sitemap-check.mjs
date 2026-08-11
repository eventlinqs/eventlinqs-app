#!/usr/bin/env node
/**
 * The sitemap is the SEO compounding engine, and it is the one surface where a
 * dead URL costs for months rather than seconds: Google is told the page
 * matters, crawls it, and finds nothing. Nothing else on the platform checks
 * it, so this does.
 *
 * Fetches /sitemap.xml (following its index if it has one), groups the URLs by
 * shape, and requests a sample of every shape.
 */
const BASE = (process.argv[process.argv.indexOf('--base') + 1] || '').replace(/\/$/, '')
if (!BASE) throw new Error('--base is required')
const PER_SHAPE = Number(process.argv[process.argv.indexOf('--per-shape') + 1]) || 4

async function urlsFrom(url) {
  const res = await fetch(url)
  if (!res.ok) return { error: `${res.status} on ${url}`, urls: [] }
  const xml = await res.text()
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim())
  if (/<sitemapindex/i.test(xml)) {
    const all = []
    for (const child of locs) {
      const r = await urlsFrom(child)
      all.push(...r.urls)
    }
    return { urls: all }
  }
  return { urls: locs }
}

const { urls, error } = await urlsFrom(`${BASE}/sitemap.xml`)
if (error) {
  console.log('SITEMAP UNREACHABLE:', error)
  process.exit(1)
}
console.log(`sitemap URLs: ${urls.length}`)

const shape = (u) => {
  const p = new URL(u).pathname
  const seg = p.split('/').filter(Boolean)
  if (seg.length === 0) return '/'
  if (seg[0] === 'events' && seg.length === 2) return '/events/[slug]'
  if (seg[0] === 'city' && seg.length === 2) return '/city/[slug]'
  if (seg[0] === 'city' && seg.length === 3) return '/city/[slug]/[suburb]'
  if (seg[0] === 'community' && seg.length === 2) return '/community/[c]'
  if (seg[0] === 'community' && seg.length === 3) return '/community/[c]/[city]'
  if (seg[0] === 'culture') return '/culture/* (legacy)'
  if (seg[0] === 'organisers' && seg.length === 2) return '/organisers/[handle]'
  if (seg[0] === 'guides' && seg.length === 2) return '/guides/[slug]'
  if (seg[0] === 'help' && seg.length === 2) return '/help/[slug]'
  return '/' + seg[0]
}

const groups = new Map()
for (const u of urls) {
  const s = shape(u)
  if (!groups.has(s)) groups.set(s, [])
  groups.get(s).push(u)
}

console.log(`\n${'shape'.padEnd(28)}${'count'.padStart(7)}  sampled result`)
console.log('-'.repeat(78))
let failures = 0
for (const [s, list] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
  const step = Math.max(1, Math.floor(list.length / PER_SHAPE))
  const sample = []
  for (let i = 0; i < list.length && sample.length < PER_SHAPE; i += step) sample.push(list[i])
  const results = []
  for (const u of sample) {
    try {
      const r = await fetch(u, { redirect: 'follow' })
      results.push({ u, status: r.status })
      if (!r.ok) failures++
    } catch (e) {
      results.push({ u, status: 0 })
      failures++
    }
  }
  const bad = results.filter((r) => r.status !== 200)
  console.log(
    s.padEnd(28) +
      String(list.length).padStart(7) +
      '  ' +
      (bad.length === 0
        ? `all ${results.length} sampled OK`
        : `FAIL ${bad.length}/${results.length}: ` +
          bad.map((b) => `${b.status} ${new URL(b.u).pathname}`).join(', ')),
  )
}
console.log(`\nsampled failures: ${failures}`)
process.exit(failures > 0 ? 1 : 0)
