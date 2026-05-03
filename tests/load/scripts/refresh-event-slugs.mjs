#!/usr/bin/env node
// Pulls a list of public event slugs from a preview deployment and
// writes them to tests/load/fixtures/event-slugs.json. The browse and
// checkout profiles consume this file via SharedArray.
//
// Why a runtime fetch and not a Supabase query: this script must be
// runnable by anyone with access to the preview URL, no service-role
// key required. The /api/events/public endpoint already returns
// listed events with the same RLS rules anonymous users see, so the
// fixture matches what real traffic would hit.
//
// Usage:
//   node tests/load/scripts/refresh-event-slugs.mjs --base https://<preview>.vercel.app [--limit 200]

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES_DIR = path.resolve(__dirname, '..', 'fixtures')
const OUT = path.join(FIXTURES_DIR, 'event-slugs.json')

function arg(name, fallback) {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : fallback
}

const base = (arg('--base') || '').replace(/\/$/, '')
if (!base) {
  console.error('--base <preview-url> is required')
  process.exit(2)
}
const limit = parseInt(arg('--limit', '200'), 10)

async function main() {
  // The public events list is paginated. Pull pages until we hit the
  // limit or run out. Tolerate either /api/events or /api/events/list
  // shape; whichever the preview exposes is fine.
  const candidates = [
    `${base}/api/events?limit=${limit}`,
    `${base}/api/events/list?limit=${limit}`,
    `${base}/api/events/public?limit=${limit}`,
  ]

  let slugs = []
  for (const url of candidates) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } })
      if (!res.ok) continue
      const body = await res.json()
      const list = Array.isArray(body) ? body : body.events || body.data || []
      slugs = list.map((e) => e.slug).filter(Boolean)
      if (slugs.length > 0) {
        console.log(`fetched ${slugs.length} slugs from ${url}`)
        break
      }
    } catch (err) {
      console.warn(`fetch failed ${url}: ${err.message}`)
    }
  }

  if (slugs.length === 0) {
    console.error('no slugs found via any candidate endpoint; falling back to scraping /events')
    try {
      const res = await fetch(`${base}/events`, { headers: { Accept: 'text/html' } })
      const html = await res.text()
      const matches = [...html.matchAll(/\/events\/([a-z0-9-]+)/g)].map((m) => m[1])
      slugs = [...new Set(matches)].filter(
        (s) => s && !['create', 'edit', 'list', 'manage', 'new'].includes(s)
      )
      console.log(`scraped ${slugs.length} slugs from /events HTML`)
    } catch (err) {
      console.error(`HTML fallback failed: ${err.message}`)
    }
  }

  if (slugs.length === 0) {
    console.error('refresh failed: 0 slugs. Profiles will use the hand-curated fallback in lib/fixtures.js')
    process.exit(1)
  }

  fs.mkdirSync(FIXTURES_DIR, { recursive: true })
  fs.writeFileSync(OUT, JSON.stringify(slugs.slice(0, limit), null, 2))
  console.log(`wrote ${OUT} with ${Math.min(slugs.length, limit)} slugs`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
