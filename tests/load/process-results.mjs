#!/usr/bin/env node
// Post-process k6 JSON-stream output into a compact summary table that
// docs/hardening/phase2/load-test-results.md consumes. k6 writes one
// JSON object per line via --out json=<file>; we stream it (the raw
// browse run is hundreds of MB at 10K VUs so loading it into memory
// is not viable).
//
// Usage:
//   node tests/load/process-results.mjs <path-to-raw.json> [--label browse]
//
// Output: writes a JSON file alongside the raw input named
// <basename>.summary.json with shape:
//   {
//     label, startedAt, endedAt, durationSec,
//     trends: { <metric>: { count, min, p50, p90, p95, p99, max, avg } },
//     rates:  { <metric>: { passed, failed, rate } },
//     counters: { <metric>: total },
//     httpStatus: { '2xx': n, '3xx': n, '4xx': n, '5xx': n, '429': n },
//     thresholds: { <name>: { ok, value } }
//   }

import fs from 'node:fs'
import readline from 'node:readline'
import path from 'node:path'

const args = process.argv.slice(2)
const rawPath = args[0]
if (!rawPath) {
  console.error('usage: node tests/load/process-results.mjs <raw.json> [--label name]')
  process.exit(2)
}
const labelIdx = args.indexOf('--label')
const label = labelIdx >= 0 ? args[labelIdx + 1] : path.basename(rawPath, path.extname(rawPath))

if (!fs.existsSync(rawPath)) {
  console.error(`raw file not found: ${rawPath}`)
  process.exit(2)
}

// Trend bucket - online quantiles via reservoir is overkill for this
// scale; accumulate raw values and percentile at the end. Memory
// budget: 10K VUs * 600s / (avg 5s sleep) ~= 1.2M samples per route.
// Each sample is an 8-byte float so ~9.6 MB per metric, fine.
const trendValues = new Map() // metric -> number[]
const rateBuckets = new Map() // metric -> { passed, failed }
const counterBuckets = new Map() // metric -> number
const httpStatusBuckets = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0, '429': 0, other: 0 }
const thresholdResults = {}
let startedAt = null
let endedAt = null

const stream = fs.createReadStream(rawPath, { encoding: 'utf8' })
const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })

let lineCount = 0
for await (const line of rl) {
  lineCount++
  if (!line) continue
  let obj
  try {
    obj = JSON.parse(line)
  } catch {
    continue
  }
  if (obj.type === 'Point') {
    const ts = obj.data && obj.data.time ? new Date(obj.data.time).getTime() : null
    if (ts) {
      if (startedAt === null || ts < startedAt) startedAt = ts
      if (endedAt === null || ts > endedAt) endedAt = ts
    }
    const metric = obj.metric
    const value = obj.data && typeof obj.data.value === 'number' ? obj.data.value : null
    if (value === null) continue

    if (metric === 'http_req_duration') {
      const tags = obj.data.tags || {}
      const route = tags.route || tags.stage || 'unknown'
      const key = `http_req_duration:${route}`
      if (!trendValues.has(key)) trendValues.set(key, [])
      trendValues.get(key).push(value)
    } else if (metric === 'http_reqs') {
      const tags = obj.data.tags || {}
      const status = tags.status || ''
      if (status.startsWith('2')) httpStatusBuckets['2xx']++
      else if (status.startsWith('3')) httpStatusBuckets['3xx']++
      else if (status === '429') httpStatusBuckets['429']++
      else if (status.startsWith('4')) httpStatusBuckets['4xx']++
      else if (status.startsWith('5')) httpStatusBuckets['5xx']++
      else httpStatusBuckets.other++
    } else if (metric === 'http_req_failed') {
      // Rate metric; accumulate
      if (!rateBuckets.has('http_req_failed')) rateBuckets.set('http_req_failed', { passed: 0, failed: 0 })
      const b = rateBuckets.get('http_req_failed')
      if (value === 0) b.passed++
      else b.failed++
    } else if (metric.startsWith('ok_')) {
      if (!rateBuckets.has(metric)) rateBuckets.set(metric, { passed: 0, failed: 0 })
      const b = rateBuckets.get(metric)
      if (value === 1) b.passed++
      else b.failed++
    } else if (metric.endsWith('_total')) {
      counterBuckets.set(metric, (counterBuckets.get(metric) || 0) + value)
    } else if (
      metric.startsWith('browse_') ||
      metric.startsWith('checkout_') ||
      metric.startsWith('org_')
    ) {
      if (!trendValues.has(metric)) trendValues.set(metric, [])
      trendValues.get(metric).push(value)
    }
  } else if (obj.type === 'Metric' && obj.data && obj.data.thresholds) {
    // k6 emits a Metric record for thresholds at the end of the run.
    for (const [name, result] of Object.entries(obj.data.thresholds)) {
      thresholdResults[`${obj.metric}:${name}`] = {
        ok: result && result.ok === true,
        value: result && result.lastFailed ? 'failed' : 'passed',
      }
    }
  }
}

function pct(arr, p) {
  if (arr.length === 0) return null
  const sorted = [...arr].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return Math.round(sorted[idx] * 100) / 100
}

const trends = {}
for (const [key, values] of trendValues.entries()) {
  if (values.length === 0) continue
  const sum = values.reduce((a, b) => a + b, 0)
  trends[key] = {
    count: values.length,
    min: Math.round(Math.min(...values) * 100) / 100,
    p50: pct(values, 50),
    p90: pct(values, 90),
    p95: pct(values, 95),
    p99: pct(values, 99),
    max: Math.round(Math.max(...values) * 100) / 100,
    avg: Math.round((sum / values.length) * 100) / 100,
  }
}

const rates = {}
for (const [name, b] of rateBuckets.entries()) {
  const total = b.passed + b.failed
  rates[name] = {
    passed: b.passed,
    failed: b.failed,
    rate: total === 0 ? null : Math.round((b.passed / total) * 10000) / 10000,
  }
}

const counters = {}
for (const [name, total] of counterBuckets.entries()) {
  counters[name] = total
}

const summary = {
  label,
  rawFile: path.basename(rawPath),
  linesProcessed: lineCount,
  startedAt: startedAt ? new Date(startedAt).toISOString() : null,
  endedAt: endedAt ? new Date(endedAt).toISOString() : null,
  durationSec: startedAt && endedAt ? Math.round((endedAt - startedAt) / 1000) : null,
  trends,
  rates,
  counters,
  httpStatus: httpStatusBuckets,
  thresholds: thresholdResults,
}

const outPath = path.join(
  path.dirname(rawPath),
  `${path.basename(rawPath, path.extname(rawPath))}.summary.json`
)
fs.writeFileSync(outPath, JSON.stringify(summary, null, 2))
console.log(`wrote summary to ${outPath}`)
console.log(`  lines: ${lineCount}, duration: ${summary.durationSec}s`)
console.log(`  trends: ${Object.keys(trends).length}, rates: ${Object.keys(rates).length}`)
