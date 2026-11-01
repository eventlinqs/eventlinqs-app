/**
 * THE DAILY TWENTY, READ FROM TEST'S OWN ROWS (V3 item 5), through the reader the screen will use (readDailyTwenty).
 * Read only; drafts and sends nothing. Checks what the day must hold whatever the rows are, and writes the day to
 * <out file> as JSON:
 *   D1 at most five actions in each of the four groups, and each group says how many it is short;
 *   D2 no organiser twice in the day (actions, social first touches and research together);
 *   D3 every action names lawal@eventlinqs.com as its sender;
 *   D4 every action's contact is one the database lets be written to NOW (outreach_contact_refusal is null, asked again);
 *   D5 no action, social touch or research line for an organiser whose stored state is suppressed, rejected,
 *      disputed, withdrawn or discovered.
 *
 *   node --env-file=<a TEST env file> node_modules/tsx/dist/cli.mjs scripts/verify/daily-twenty-drive.mts <out file>
 */
import { writeFileSync } from 'node:fs'
import Module from 'node:module'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import type * as ReadModule from '@/lib/outreach/daily-twenty-read'

const EMPTY = fileURLToPath(new URL('../../tests/stubs/empty.ts', import.meta.url))
const cjs = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string }
const resolveFilename = cjs._resolveFilename
cjs._resolveFilename = (request: string, ...rest: unknown[]) => (request === 'server-only' || request === 'client-only' ? EMPTY : resolveFilename(request, ...rest))
const pick = <T,>(mod: T & { default?: T }) => (mod.default ?? mod) as T
const reader = pick((await import('@/lib/outreach/daily-twenty-read')) as typeof ReadModule & { default?: typeof ReadModule })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
if (!url.includes('vkapkibzokmfaxqogypq')) throw new Error(`TEST only, refused: ${url}`)
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', { auth: { persistSession: false } })
const out = process.argv[2] ?? 'daily-twenty.json'

const day = await reader.readDailyTwenty(db as never, new Date())
const fails: string[] = []

for (const g of day.groups) {
  if (g.actions.length > 5) fails.push(`D1 ${g.key} holds ${g.actions.length}`)
  if (g.short !== g.size - g.actions.length) fails.push(`D1 ${g.key} short ${g.short} is not ${g.size - g.actions.length}`)
}
const ids = [...day.groups.flatMap((g) => g.actions.map((a) => a.organiserId)), ...day.socialFirstTouches.map((s) => s.organiserId), ...day.research.map((r) => r.organiserId)]
if (new Set(ids).size !== ids.length) fails.push(`D2 ${ids.length - new Set(ids).size} organisers twice`)
for (const a of day.groups.flatMap((g) => g.actions)) {
  if (a.sender !== 'lawal@eventlinqs.com') fails.push(`D3 ${a.organiserName} sender ${a.sender}`)
  const { data: contact } = await db.from('organiser_contacts').select('id').eq('organiser_id', a.organiserId).eq('channel', a.channel).eq('address', a.address).single()
  const refusal = contact ? await db.rpc('outreach_contact_refusal', { p_contact: contact.id }) : { data: 'contact not found', error: null }
  if (refusal.error || refusal.data !== null) fails.push(`D4 ${a.organiserName}: ${refusal.error?.message ?? refusal.data}`)
}
if (ids.length) {
  const { data: states, error } = await db.from('organisers').select('id, name, acquisition_state').in('id', ids)
  if (error) throw error
  for (const s of states ?? []) {
    if (['suppressed', 'rejected', 'disputed', 'withdrawn', 'discovered'].includes(s.acquisition_state)) fails.push(`D5 ${s.name} is ${s.acquisition_state}`)
  }
}

const summary = {
  read_at: new Date().toISOString(),
  groups: day.groups.map((g) => ({ key: g.key, actions: g.actions.length, short: g.short })),
  social_first_touches: day.socialFirstTouches.length,
  research: day.research.length,
  duplicates_dropped: day.duplicatesDropped,
  fails,
  verdict: fails.length === 0 ? 'D1 TO D5 HOLD' : 'FAILED',
}
writeFileSync(out, JSON.stringify({ summary, day }, null, 2))
console.log(JSON.stringify(summary))
process.exit(fails.length ? 1 : 0)
