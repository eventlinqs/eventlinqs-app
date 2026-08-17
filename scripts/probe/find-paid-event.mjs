/**
 * READ-ONLY: name a published PAID event on the target environment, so the sale
 * gate can be probed against a real row rather than a guessed slug.
 *
 * Select verbs only. It exists because "find me an event to test with" was
 * otherwise a hand-written query retyped every session.
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const argv = process.argv.slice(2)
const envFile = argv[argv.indexOf('--env') + 1]
const env = {}
for (const raw of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  const line = raw.trim()
  if (!line || line.startsWith('#')) continue
  const eq = line.indexOf('=')
  if (eq === -1) continue
  let v = line.slice(eq + 1).trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  env[line.slice(0, eq).trim()] = v
}

const ref = (env.NEXT_PUBLIC_SUPABASE_URL?.match(/https:\/\/([a-z0-9]+)\./) || [])[1]
console.log(`[find] project ref: ${ref}`)

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// Does the column the outage turned on exist here?
const { error: colErr } = await db.from('events').select('external_ticket_url').limit(1)
console.log(`[find] events.external_ticket_url: ${colErr ? `MISSING (${colErr.message})` : 'EXISTS'}`)

const { data: tiers, error } = await db
  .from('ticket_tiers')
  .select('id, name, price, event_id, events!inner(slug, title, status, organisation_id)')
  .gt('price', 0)
  .eq('events.status', 'published')
  .limit(5)

if (error) {
  console.error('[find] failed:', error.message)
  process.exit(1)
}

console.log(`[find] ${tiers?.length ?? 0} published PAID event(s):`)
for (const t of tiers ?? []) {
  const e = t.events
  console.log(`  ${e.slug}  |  ${e.title}  |  ${t.name} ${t.price}c  |  org ${e.organisation_id}`)
}
