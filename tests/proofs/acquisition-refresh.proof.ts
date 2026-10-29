/**
 * THE OUTREACH RUN's ACQUISITION REFRESH ON TEST, AS THE SERVICE ROLE (window 6, 30 October 2026). The cron calls
 * organiser_acquisition_refresh_all through the service role; this calls it the same way on TEST and proves the grant
 * holds, that a second call changes nothing (the states are already what their proof says), that anon cannot call it,
 * and that the service role may read the log but not write to it. TEST only (constant ref). It may write transitions
 * on TEST, as the run itself would.
 *
 *   powershell -File scripts/ops/with-supabase-token.ps1 npx vitest run --config vitest.proof.config.ts tests/proofs/acquisition-refresh.proof.ts
 */
import { expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const REF = 'vkapkibzokmfaxqogypq'
const token = process.env.SUPABASE_ACCESS_TOKEN

async function keys(): Promise<{ service: string; anon: string }> {
  // GET /v1/projects/{ref}/api-keys (https://supabase.com/docs/reference/api/v1-get-project-api-keys).
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys`, { headers: { authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`the Management API refused the key read (HTTP ${res.status})`)
  const list = (await res.json()) as { name: string; type: string; api_key: string }[]
  const pick = (name: string) => list.find((k) => k.name === name && k.type === 'legacy')?.api_key ?? ''
  return { service: pick('service_role'), anon: pick('anon') }
}

it('the service role refreshes every organiser; a second run changes nothing; anon is refused; the log is read only', async () => {
  if (!token) throw new Error('run through scripts/ops/with-supabase-token.ps1')
  const k = await keys()
  const url = `https://${REF}.supabase.co`
  const service = createClient<Database>(url, k.service, { auth: { persistSession: false } })
  const anon = createClient<Database>(url, k.anon, { auth: { persistSession: false } })

  const first = await service.rpc('organiser_acquisition_refresh_all', { p_proved_by: 'outreach-run proof' })
  expect(first.error).toBeNull()
  const second = await service.rpc('organiser_acquisition_refresh_all', { p_proved_by: 'outreach-run proof' })
  expect(second.error).toBeNull()
  expect(second.data).toBe(0)

  const refused = await anon.rpc('organiser_acquisition_refresh_all', { p_proved_by: 'anon' })
  expect(refused.error).not.toBeNull()

  const log = await service.from('organiser_acquisition_transitions').select('id', { count: 'exact', head: true })
  expect(log.error).toBeNull()
  const write = await service.from('organiser_acquisition_transitions').insert({ organiser_id: '00000000-0000-0000-0000-000000000000', to_state: 'active', proved_by: 'typed by hand' })
  expect(write.error).not.toBeNull()

  console.log(`first run changed ${first.data}, second ${second.data}; anon refused: '${refused.error?.message}'; the log holds ${log.count} rows; a direct write refused: '${write.error?.message}'`)
})
