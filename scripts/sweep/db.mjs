#!/usr/bin/env node
/**
 * Read-only ground-truth reader for the production sweep.
 *
 * Refuses to run against the production project. The sweep is TEST-only by
 * construction: the URL is asserted before a client is ever created, so a
 * mis-set env cannot quietly point this at live data.
 *
 * Usage:
 *   node scripts/sweep/db.mjs <name>            run a named query
 *   node scripts/sweep/db.mjs --list            list query names
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const PRODUCTION_REF = 'gndnldyfudbytbboxesk'
const TEST_REF = 'vkapkibzokmfaxqogypq'

function loadEnv(file) {
  try {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_0-9]+)=(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
    }
  } catch {
    /* file absent is fine when the env is already exported */
  }
}
loadEnv('.env.test')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (url.includes(PRODUCTION_REF)) {
  console.error('REFUSED: this reader is pointed at the production project.')
  process.exit(2)
}
if (!url.includes(TEST_REF)) {
  console.error(`REFUSED: expected the TEST project (${TEST_REF}), got ${url}`)
  process.exit(2)
}
if (!key) {
  console.error('REFUSED: SUPABASE_SERVICE_ROLE_KEY is not set')
  process.exit(2)
}

const db = createClient(url, key, { auth: { persistSession: false } })

const queries = {
  async events() {
    const { data, error } = await db
      .from('events')
      .select(
        'id,slug,title,status,visibility,start_date,city_primary,suburb_primary,venue_city,tags,category_id,is_featured,scheduled_publish_at,organisation_id,is_seed_data',
      )
      .eq('status', 'published')
      .order('start_date', { ascending: true })
    if (error) throw error
    return data
  },
  async statuses() {
    const { data, error } = await db.from('events').select('status')
    if (error) throw error
    const counts = {}
    for (const r of data) counts[r.status] = (counts[r.status] || 0) + 1
    return counts
  },
  async categories() {
    const { data, error } = await db.from('event_categories').select('id,slug,name')
    if (error) throw error
    return data
  },
  async flags() {
    const { data, error } = await db.from('feature_flags').select('*')
    if (error) throw error
    return data
  },
  async shareEvents() {
    const { data, error } = await db.from('share_link_events').select('kind')
    if (error) throw error
    const counts = {}
    for (const r of data) counts[r.kind] = (counts[r.kind] || 0) + 1
    return counts
  },
  async orgs() {
    const { data, error } = await db
      .from('organisations')
      .select('id,name,slug,handle,stripe_charges_enabled')
      .limit(50)
    if (error) throw error
    return data
  },
}

const name = process.argv[2]
if (!name || name === '--list') {
  console.log(Object.keys(queries).join('\n'))
  process.exit(0)
}
if (!queries[name]) {
  console.error(`unknown query: ${name}`)
  process.exit(1)
}
const out = await queries[name]()
console.log(JSON.stringify(out, null, 1))
