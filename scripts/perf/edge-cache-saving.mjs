/**
 * WHAT AN EDGE CACHE IS ACTUALLY WORTH ON THIS PLATFORM, MEASURED RATHER THAN
 * ASSUMED, AND WHETHER A GIVEN ROUTE IS GETTING IT AT ALL.
 *
 * ============================================================================
 * WHY THIS EXISTS
 * ============================================================================
 *
 * Close-out C8B.1's cost table found that time to first byte is the largest
 * single phase of the homepage's paint in all ten runs across two collections
 * (402 to 1277 ms against 136 to 275 ms of element render delay). So the work
 * C8B.3 points at is the server response, and the lever on a server response
 * that has already been computed for somebody else is the CDN.
 *
 * C8B.3 then says: "state the expected saving, make the change, re-measure the
 * same route on the same gate". A CDN header cannot be measured on the same
 * gate. `next start` has no CDN, so `CDN-Cache-Control` changes NOTHING
 * locally, and a local Lighthouse run before and after such a change is
 * guaranteed to be identical whether the header is right, wrong or absent.
 * Quoting one as evidence would be measuring the harness.
 *
 * So the saving is measured where the CDN exists, against the deployed site,
 * and the experiment holds the network path still: ONE route, sampled warm
 * (served from the edge) and again with a unique query string that cannot be in
 * the cache (rendered by the origin function). Same host, same route, same
 * minute, same laptop. The delta between those two medians is what the cache is
 * worth per request, and it is the only number here that is not contaminated by
 * which continent the tester is sitting in.
 *
 *     https://vercel.com/docs/caching/cdn-cache/purge
 *     "The request URL (query strings are ignored for static files)"
 *     fetched 2026-09-18
 *
 * A query string is part of the cache key for a FUNCTION response, which is
 * what makes the cache-busted sample an honest origin render rather than a
 * different page.
 *
 * ============================================================================
 * WHAT IT REPORTS, AND WHY THE DISPOSITION MATTERS MORE THAN THE TIME
 * ============================================================================
 *
 * `X-Vercel-Cache` per sample, counted. A route that answers MISS on every
 * single request is not slow because the cache is cold; it is not in the cache
 * at all, and no amount of re-sampling will turn it into a HIT. That count is
 * the finding. The times explain what it costs.
 *
 * MEDIAN, never the best run, per CLAUDE.md and C8B.6. The spread is printed
 * beside it so a median taken over a noisy network is visibly noisy rather than
 * quietly wrong.
 *
 * ============================================================================
 * WHAT IT CANNOT SEE
 * ============================================================================
 *
 * It measures from wherever it runs, over whatever link that machine has, to
 * one Vercel region. It cannot tell you the experience in Perth. It cannot
 * separate origin compute from the network leg on the MISS samples, only their
 * sum. And it says nothing about whether a cached response is SAFE to share:
 * that is scripts/guards/edge-cache-is-viewer-independent.mjs and
 * scripts/verify/edge-cache-headers-drive.mjs, and this script deliberately
 * does not duplicate their judgement.
 *
 * Usage (paths carry NO leading slash: MSYS rewrites a leading slash to a
 * Windows path before the process starts, and this repository has already lost
 * a route that way once - see scripts/perf/lh-local-median.mjs):
 *
 *   node scripts/perf/edge-cache-saving.mjs https://www.eventlinqs.com.au \
 *     --path=events --path=events/browse/melbourne --samples=8 --out=x.json
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

/** Median of a numeric list. Even lengths average the two middle values. */
export function median(values) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/**
 * REFUSE A MANGLED ARGUMENT RATHER THAN SILENTLY DROPPING IT.
 *
 * `--path=/events` under MSYS arrives as `--path=C:/Program Files/Git/events`.
 * The first version of the sibling harness filtered such a value out and
 * reported a confident median over the routes that survived. A path that
 * contains a drive letter or a backslash was not written by the caller, and the
 * run stops rather than reporting a smaller table with the same confidence.
 */
export function assertUnmangled(path) {
  if (/^[A-Za-z]:/.test(path) || path.includes('\\')) {
    throw new Error(
      `--path=${path} has been rewritten by the shell before this process started. ` +
        'Pass paths with NO leading slash (--path=events/browse/melbourne).',
    )
  }
  if (path.startsWith('/')) {
    throw new Error(`--path=${path} must not start with a slash. Pass --path=${path.slice(1)}.`)
  }
  return path
}

/** One request. Returns the disposition, the status and the seconds to first byte. */
async function sample(url) {
  const started = process.hrtime.bigint()
  const response = await fetch(url, {
    redirect: 'manual',
    headers: { 'user-agent': 'eventlinqs-edge-cache-saving' },
  })
  // Reading the body to completion would fold transfer time into the reading.
  // The first byte is what LCP's TTFB phase is made of, so the clock stops when
  // the headers are in and the body is discarded.
  const ttfb = Number(process.hrtime.bigint() - started) / 1e9
  response.body?.cancel().catch(() => {})
  return {
    ttfb,
    status: response.status,
    cache: response.headers.get('x-vercel-cache') ?? 'none',
    cdnCacheControl: response.headers.get('cdn-cache-control') ?? null,
    age: response.headers.get('age') ?? null,
  }
}

export function summarise(samples) {
  const dispositions = {}
  for (const s of samples) dispositions[s.cache] = (dispositions[s.cache] ?? 0) + 1
  const times = samples.map((s) => s.ttfb)
  return {
    n: samples.length,
    medianTtfbMs: Math.round(median(times) * 1000),
    minTtfbMs: Math.round(Math.min(...times) * 1000),
    maxTtfbMs: Math.round(Math.max(...times) * 1000),
    dispositions,
    statuses: [...new Set(samples.map((s) => s.status))],
    cdnCacheControl: samples[0]?.cdnCacheControl ?? null,
  }
}

export async function measure(base, paths, samples) {
  const rows = []
  for (const path of paths) {
    const url = `${base.replace(/\/$/, '')}/${path}`
    const warm = []
    const cold = []
    // One unrecorded request first, so the first sample is not paying for a TLS
    // handshake the other seven do not pay for.
    await sample(url).catch(() => {})
    for (let i = 0; i < samples; i += 1) {
      warm.push(await sample(url))
      const bust = `c8b3=${Date.now()}${Math.floor(Math.random() * 1e6)}`
      cold.push(await sample(url.includes('?') ? `${url}&${bust}` : `${url}?${bust}`))
    }
    const warmSummary = summarise(warm)
    const coldSummary = summarise(cold)
    rows.push({
      path,
      url,
      warm: warmSummary,
      originRender: coldSummary,
      savingMs: coldSummary.medianTtfbMs - warmSummary.medianTtfbMs,
      // The finding, in one field: a route that never once answered HIT is not
      // cached, whatever anybody believes about its header.
      everHit: (warmSummary.dispositions.HIT ?? 0) > 0,
    })
  }
  return rows
}

export function render(rows) {
  const lines = []
  lines.push('route                                     warm(ms)  origin(ms)  saving  warm dispositions')
  lines.push('-'.repeat(96))
  for (const r of rows) {
    const disp = Object.entries(r.warm.dispositions).map(([k, v]) => `${k}x${v}`).join(' ')
    lines.push(
      `/${r.path}`.padEnd(42) +
        String(r.warm.medianTtfbMs).padStart(8) +
        String(r.originRender.medianTtfbMs).padStart(12) +
        String(r.savingMs).padStart(8) +
        '  ' + disp,
    )
    lines.push(
      ''.padEnd(42) +
        `spread ${r.warm.minTtfbMs}-${r.warm.maxTtfbMs}`.padStart(8) +
        `  ${r.originRender.minTtfbMs}-${r.originRender.maxTtfbMs}`.padStart(12) +
        `          CDN-Cache-Control: ${r.warm.cdnCacheControl ?? '(none)'}`,
    )
  }
  return lines.join('\n')
}

async function main() {
  const args = process.argv.slice(2)
  const base = args.find((a) => a.startsWith('http'))
  if (!base) {
    console.error('usage: node scripts/perf/edge-cache-saving.mjs <base-url> --path=events [--samples=8] [--out=file.json]')
    process.exit(2)
  }
  const paths = args
    .filter((a) => a.startsWith('--path='))
    .map((a) => assertUnmangled(a.slice('--path='.length)))
  if (paths.length === 0) {
    console.error('no --path= given, and this harness will not invent one.')
    process.exit(2)
  }
  const samples = Number(args.find((a) => a.startsWith('--samples='))?.slice('--samples='.length) ?? 8)
  const out = args.find((a) => a.startsWith('--out='))?.slice('--out='.length)

  console.log(`[edge-cache-saving] ${base}, ${samples} warm + ${samples} origin-render samples per route`)
  const rows = await measure(base, paths, samples)
  console.log(render(rows))
  for (const r of rows) {
    if (!r.everHit) {
      console.log(
        `\n[edge-cache-saving] /${r.path} answered ${Object.keys(r.warm.dispositions).join('/')} on all ${r.warm.n} ` +
          'warm samples: it is not shared at the edge.',
      )
    }
  }
  if (out) {
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, JSON.stringify({ base, samples, measuredAt: new Date().toISOString(), rows }, null, 2))
    console.log(`\n[edge-cache-saving] wrote ${out}`)
  }
}

if (process.argv[1]?.endsWith('edge-cache-saving.mjs')) {
  main().catch((error) => {
    console.error(`[edge-cache-saving] ${error.message}`)
    process.exit(1)
  })
}
