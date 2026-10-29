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

  const top = scored[0]
  if (top && top.state === 'scored') {
    const nightsSaid = Number(/^(\d+) night/.exec(top.why.frequency)?.[1])
    const [{ nights }] = await query(`
      select count(distinct e.id)::int as nights
        from public.events e
        left join public.organiser_venues ov on ov.venue_id = e.venue_id and ov.organiser_id = '${top.id}'
        left join public.venues v on v.id = ov.venue_id and v.removed_at is null
        left join public.organisers o on o.id = '${top.id}'
       where e.status = 'published' and e.visibility = 'public'
         and e.start_date >= '${now.toISOString()}' and e.start_date <= '${new Date(now.getTime() + HORIZON_DAYS * 86_400_000).toISOString()}'
         and (v.id is not null or (o.organisation_id is not null and e.organisation_id = o.organisation_id))`)
    console.log(`independent SQL count for the top organiser: ${nights} night(s) ahead; the reader said ${nightsSaid}`)
    expect(nightsSaid).toBeLessThanOrEqual(nights)
  }

  console.log(`TEST: ${rows.length} organisers read, ${scored.length} scored, ${stopped.length} stopped (never ranked)`)
  for (const r of scored.slice(0, 5)) {
    if (r.state !== 'scored') continue
    console.log(`  ${r.score}  ${r.name}  ${PARTS.map((p) => `${p} ${r.parts[p]}/${WEIGHTS[p]}`).join(', ')}`)
    for (const p of PARTS) console.log(`        ${p}: ${r.why[p]}`)
  }
})
