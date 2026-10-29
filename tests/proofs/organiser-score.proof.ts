/**
 * THE ORGANISER SCORE ON TEST, READ ONLY (window 6, 30 October 2026). Runs readOrganiserScores against TEST's real rows
 * with the service role, then checks it from outside: every score is its parts added, no part passes its weight, a
 * stopped organiser is never ranked, and the top organiser's nights ahead equal an independent SQL count. Nothing is
 * written. TEST only (constant ref).
 *
 *   powershell -File scripts/ops/with-supabase-token.ps1 npx vitest run --config vitest.proof.config.ts tests/proofs/organiser-score.proof.ts
 */
import { expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { readOrganiserScores } from '@/lib/outreach/organiser-score-read'
import { HORIZON_DAYS, PARTS, WEIGHTS } from '@/lib/outreach/organiser-score'
import { COHORT_SIZE, pickCohort } from '@/lib/outreach/cohort-pick'

const REF = 'vkapkibzokmfaxqogypq'
const token = process.env.SUPABASE_ACCESS_TOKEN

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- rows from the Management API are untyped JSON
async function query(sql: string): Promise<any[]> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql, read_only: true }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 800)}`)
  return JSON.parse(text)
}

async function serviceKey(): Promise<string> {
  // GET /v1/projects/{ref}/api-keys (https://supabase.com/docs/reference/api/v1-get-project-api-keys), as
  // scripts/ops/list-walk-in-draft.mjs reads it.
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys`, { headers: { authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`the Management API refused the key read (HTTP ${res.status})`)
  const keys = (await res.json()) as { name: string; type: string; api_key: string }[]
  const key = keys.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key
  if (typeof key !== 'string') throw new Error('no service_role key came back')
  return key
}

it('scores every organiser on TEST from its real rows, and the numbers hold from outside', async () => {
  if (!token) throw new Error('run through scripts/ops/with-supabase-token.ps1')
  const db = createClient<Database>(`https://${REF}.supabase.co`, await serviceKey(), { auth: { persistSession: false } })
  const now = new Date()
  const rows = await readOrganiserScores(db, now)

  const [{ organisers }] = await query('select count(*)::int as organisers from public.organisers')
  expect(rows.length).toBe(organisers)

  const scored = rows.filter((r) => r.state === 'scored')
  const stopped = rows.filter((r) => r.state === 'stopped')
  for (const r of scored) {
    if (r.state !== 'scored') continue
    expect(r.score).toBe(PARTS.reduce((n, p) => n + r.parts[p], 0))
    for (const p of PARTS) expect(r.parts[p]).toBeLessThanOrEqual(WEIGHTS[p])
  }
  // Ranked first, highest first; the stopped come after every scored line.
  expect(rows.slice(0, scored.length).every((r) => r.state === 'scored')).toBe(true)
  for (let i = 1; i < scored.length; i++) {
    const a = scored[i - 1]
    const b = scored[i]
    if (a.state === 'scored' && b.state === 'scored') expect(a.score).toBeGreaterThanOrEqual(b.score)
  }

  // Every organiser's nights ahead, counted independently in SQL (outside-ticket nights included, as a listing shows
  // them), against what the reader said. The listing window and the 21-day freshness are applied as the app applies
  // them, so the two must agree exactly, not merely bound each other.
  const fromIso = now.toISOString()
  const untilIso = new Date(now.getTime() + HORIZON_DAYS * 86_400_000).toISOString()
  const counted = await query(`
    select o.id, count(distinct e.id)::int as nights,
           count(distinct e.id) filter (where coalesce(btrim(e.external_ticket_url), '') <> '')::int as outside
      from public.organisers o
      left join public.organiser_venues ov on ov.organiser_id = o.id
      left join public.venues v on v.id = ov.venue_id and v.removed_at is null
      left join public.events e on (e.venue_id = v.id or (o.organisation_id is not null and e.organisation_id = o.organisation_id))
           and e.status = 'published' and e.visibility = 'public'
           and e.start_date >= '${fromIso}' and e.start_date <= '${untilIso}'
           and (e.listing_fresh_until is null or e.listing_fresh_until >= '${fromIso}')
     group by o.id`)
  const sqlNights = new Map(counted.map((r: { id: string; nights: number }) => [r.id, r.nights]))
  const outside = counted.reduce((n: number, r: { outside: number }) => n + r.outside, 0)
  let agree = 0
  const differ: string[] = []
  for (const r of scored) {
    if (r.state !== 'scored') continue
    const said = Number(/^(\d+) night/.exec(r.why.frequency)?.[1])
    if (said === sqlNights.get(r.id)) agree++
    else differ.push(`${r.name}: reader ${said}, SQL ${sqlNights.get(r.id)}`)
  }
  console.log(`independent SQL count: ${agree} of ${scored.length} organisers agree on nights ahead; ${outside} outside-ticket night(s) among them`)
  for (const d of differ.slice(0, 10)) console.log(`  DIFFERS ${d}`)
  expect(differ).toEqual([])

  // The first cohort (ruling 5) from the same rows: the quotas add to 100, no city takes more than its quota, each pick's
  // city is where most of its venues stand (read again in SQL), and email holds only organisers we may write to.
  const cohort = pickCohort(
    scored.flatMap((r) => (r.state === 'scored' ? [{ id: r.id, name: r.name, city: r.city, score: r.score, writableEmail: r.writableEmail }] : [])),
  )
  expect(Object.values(cohort.quota).reduce((a, b) => a + b, 0)).toBe(COHORT_SIZE)
  for (const [city, list] of Object.entries(cohort.byCity)) expect(list.length).toBeLessThanOrEqual(cohort.quota[city as keyof typeof cohort.quota])
  const venueCities = await query(`
    select ov.organiser_id as id, v.city_slug as city, count(*)::int as n
      from public.organiser_venues ov join public.venues v on v.id = ov.venue_id and v.removed_at is null
     where v.city_slug is not null group by 1, 2`)
  const topCity = new Map<string, { city: string; n: number }>()
  for (const r of venueCities as { id: string; city: string; n: number }[]) {
    const best = topCity.get(r.id)
    if (!best || r.n > best.n || (r.n === best.n && r.city < best.city)) topCity.set(r.id, { city: r.city, n: r.n })
  }
  const notes = new Map((await query('select id, notes from public.organisers')).map((r: { id: string; notes: string | null }) => [r.id, r.notes]))
  const sourceOf = new Map(rows.map((r) => [r.id, r.citySource]))
  for (const list of Object.values(cohort.byCity))
    for (const p of list) {
      if (sourceOf.get(p.id) === 'venue') expect(p.city).toBe(topCity.get(p.id)?.city)
      else {
        // No venue linked: the city is the one the import stated, read again from the raw notes.
        expect(topCity.has(p.id)).toBe(false)
        expect(p.city).toBe(/City: ([^.]+)\./.exec(notes.get(p.id) ?? '')?.[1]?.trim().toLowerCase().replace(/\s+/g, '-'))
      }
    }
  const bySource = (s: string | null) => scored.filter((r) => sourceOf.get(r.id) === s).length
  console.log(`CITY SOURCE: ${bySource('venue')} from a linked venue, ${bySource('source_file')} from the source file the import read, ${bySource(null)} none`)
  expect(cohort.email.every((p) => p.writableEmail)).toBe(true)
  console.log(
    `COHORT on TEST: ${cohort.total} of ${COHORT_SIZE} picked (${cohort.email.length} by email, ${cohort.otherRoutes.length} by other routes); ` +
      Object.entries(cohort.quota).map(([city, q]) => `${city} ${cohort.byCity[city as keyof typeof cohort.byCity].length} of ${q}`).join(', ') +
      `; ${cohort.outside} outside the four cities or with no city`,
  )

  console.log(`TEST: ${rows.length} organisers read, ${scored.length} scored, ${stopped.length} stopped (never ranked)`)
  for (const r of scored.slice(0, 5)) {
    if (r.state !== 'scored') continue
    console.log(`  ${r.score}  ${r.name}  ${PARTS.map((p) => `${p} ${r.parts[p]}/${WEIGHTS[p]}`).join(', ')}`)
    for (const p of PARTS) console.log(`        ${p}: ${r.why[p]}`)
  }
})
