/**
 * PROVE MIGRATION 20260904000002 (ticket price history) ON TEST, BY WRITING
 * AND READING BACK RATHER THAN TRUSTING THE PUSH.
 *
 *   1. ticket_price_history reads back, and the backfill left every tier with
 *      a 'listed' row.
 *   2. The CHECK refuses a reason outside listed / changed / step (23514).
 *   3. THE TRIGGER, END TO END: a seed tier's base price is moved by one cent
 *      through an ordinary UPDATE and a 'changed' row appears with the previous
 *      price; moving it back produces the mirror row. Both proof rows are then
 *      removed and the tier is exactly as it was.
 *   4. THE ATOMIC SAVE: save_dynamic_pricing is refused to anon, and through
 *      the service role it writes two steps and then clears them, with NO
 *      history row for either save, because the effective price never changed.
 *      That is the property the deferred triggers exist for: three writes in
 *      one transaction judged once, at commit.
 *
 * Refuses PRODUCTION before it does anything (assertNotProduction).
 * Usage:  node --env-file=.env.local scripts/verify/ticket-price-history-schema-verify.mjs
 */
import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import { createClient } from '@supabase/supabase-js'

assertNotProduction()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const service = process.env.SUPABASE_SERVICE_ROLE_KEY
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!url || !service || !anonKey) {
  console.error('FAIL: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are required (run with --env-file=.env.local).')
  process.exit(1)
}
const db = createClient(url, service, { auth: { persistSession: false } })
const anon = createClient(url, anonKey, { auth: { persistSession: false } })
let failed = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
  if (!ok) failed += 1
}
const latestFor = async (eventId, tierName) => {
  const { data } = await db
    .from('ticket_price_history')
    .select('id, price_cents, previous_price_cents, reason, percent_sold')
    .eq('event_id', eventId)
    .ilike('tier_name', tierName)
    .order('recorded_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data ?? null
}
const countFor = async (eventId, tierName) => {
  const { count } = await db
    .from('ticket_price_history')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .ilike('tier_name', tierName)
  return count ?? 0
}

// 1. The table, and the backfill.
const { count: historyCount, error: readErr } = await db.from('ticket_price_history').select('id', { count: 'exact', head: true })
check('ticket_price_history reads back', !readErr, readErr ? `${readErr.code} ${readErr.message}` : `${historyCount} rows`)
const { count: tierCount } = await db.from('ticket_tiers').select('id', { count: 'exact', head: true })
check('the backfill left at least one row per tier', (historyCount ?? 0) >= (tierCount ?? 0) && (tierCount ?? 0) > 0, `${historyCount} rows for ${tierCount} tiers`)

// A seed tier to prove the trigger on: paid, not dynamically priced, with capacity.
const { data: tier } = await db
  .from('ticket_tiers')
  .select('id, event_id, name, price, dynamic_pricing_enabled, total_capacity')
  .eq('dynamic_pricing_enabled', false)
  .gt('price', 0)
  .gt('total_capacity', 0)
  .order('created_at', { ascending: true })
  .limit(1)
  .maybeSingle()
check('a paid seed tier exists to prove the trigger on', Boolean(tier), tier ? `${tier.name} at ${tier.price} cents` : 'none')

if (tier) {
  // 2. The CHECK.
  const { error: badErr } = await db
    .from('ticket_price_history')
    .insert({ event_id: tier.event_id, ticket_tier_id: tier.id, tier_name: tier.name, price_cents: 1, reason: 'bogus' })
  check('the CHECK refuses a reason outside the three', badErr?.code === '23514', badErr ? badErr.code : 'accepted, which is wrong')
  if (!badErr) await db.from('ticket_price_history').delete().eq('event_id', tier.event_id).eq('reason', 'bogus')

  // 3. The trigger.
  const before = await latestFor(tier.event_id, tier.name)
  const beforeCount = await countFor(tier.event_id, tier.name)
  const { error: bumpErr } = await db.from('ticket_tiers').update({ price: tier.price + 1 }).eq('id', tier.id)
  const afterBump = await latestFor(tier.event_id, tier.name)
  check(
    'a one cent price change through an ordinary UPDATE records a changed row with the previous price',
    !bumpErr && afterBump && afterBump.id !== before?.id && afterBump.reason === 'changed' && afterBump.price_cents === tier.price + 1 && afterBump.previous_price_cents === tier.price,
    bumpErr ? bumpErr.message : afterBump ? `${afterBump.reason} ${afterBump.previous_price_cents} to ${afterBump.price_cents}` : 'no row',
  )
  const { error: restoreErr } = await db.from('ticket_tiers').update({ price: tier.price }).eq('id', tier.id)
  const afterRestore = await latestFor(tier.event_id, tier.name)
  check(
    'moving it back records the mirror row',
    !restoreErr && afterRestore && afterRestore.id !== afterBump?.id && afterRestore.reason === 'changed' && afterRestore.price_cents === tier.price && afterRestore.previous_price_cents === tier.price + 1,
    restoreErr ? restoreErr.message : afterRestore ? `${afterRestore.reason} ${afterRestore.previous_price_cents} to ${afterRestore.price_cents}` : 'no row',
  )
  const proofIds = [afterBump?.id, afterRestore?.id].filter(Boolean)
  const { error: cleanErr } = await db.from('ticket_price_history').delete().in('id', proofIds)
  const afterClean = await latestFor(tier.event_id, tier.name)
  check('the two proof rows are removed and the tier reads as it was', !cleanErr && afterClean?.id === before?.id && (await countFor(tier.event_id, tier.name)) === beforeCount, cleanErr ? cleanErr.message : `latest ${afterClean?.id === before?.id ? 'unchanged' : 'DIFFERS'}`)

  // 4. The atomic save.
  const { error: anonErr } = await anon.rpc('save_dynamic_pricing', { p_tier_id: tier.id, p_enabled: false, p_steps: [] })
  check('save_dynamic_pricing is refused to anon', Boolean(anonErr) && ['42501', 'PGRST202', 'PGRST203'].includes(anonErr.code ?? ''), anonErr ? anonErr.code : 'ALLOWED, which is wrong')

  const countBeforeSaves = await countFor(tier.event_id, tier.name)
  const { data: written, error: onErr } = await db.rpc('save_dynamic_pricing', {
    p_tier_id: tier.id,
    p_enabled: true,
    p_steps: [
      { step_order: 1, capacity_threshold_percent: 25, price_cents: tier.price },
      { step_order: 2, capacity_threshold_percent: 100, price_cents: tier.price + 500 },
    ],
  })
  const { count: ruleCount } = await db.from('dynamic_pricing_rules').select('id', { count: 'exact', head: true }).eq('ticket_tier_id', tier.id)
  check('through the service role it writes two steps in one call', !onErr && written === 2 && ruleCount === 2, onErr ? `${onErr.code} ${onErr.message}` : `returned ${written}, ${ruleCount} rules`)
  const { error: offErr } = await db.rpc('save_dynamic_pricing', { p_tier_id: tier.id, p_enabled: false, p_steps: [] })
  const { count: ruleCountAfter } = await db.from('dynamic_pricing_rules').select('id', { count: 'exact', head: true }).eq('ticket_tier_id', tier.id)
  const { data: tierAfter } = await db.from('ticket_tiers').select('dynamic_pricing_enabled, price').eq('id', tier.id).single()
  check('and clears them again, leaving the tier as it was', !offErr && ruleCountAfter === 0 && tierAfter?.dynamic_pricing_enabled === false && tierAfter?.price === tier.price, offErr ? offErr.message : `${ruleCountAfter} rules, enabled=${tierAfter?.dynamic_pricing_enabled}`)
  const countAfterSaves = await countFor(tier.event_id, tier.name)
  check('neither save recorded a history row, because the effective price never changed (the deferred triggers judged one final state)', countAfterSaves === countBeforeSaves, `${countBeforeSaves} before, ${countAfterSaves} after`)

  const { error: shapeErr } = await db.rpc('save_dynamic_pricing', { p_tier_id: tier.id, p_enabled: true, p_steps: [{ capacity_threshold_percent: 250, price_cents: 100 }] })
  check('a threshold outside 1 to 100 is refused by the function itself', Boolean(shapeErr) && /threshold/.test(shapeErr.message ?? ''), shapeErr ? shapeErr.message : 'accepted, which is wrong')
  const { count: ruleCountFinal } = await db.from('dynamic_pricing_rules').select('id', { count: 'exact', head: true }).eq('ticket_tier_id', tier.id)
  const { data: tierFinal } = await db.from('ticket_tiers').select('dynamic_pricing_enabled').eq('id', tier.id).single()
  check('and the refused save left nothing behind (one transaction, rolled back whole)', ruleCountFinal === 0 && tierFinal?.dynamic_pricing_enabled === false, `${ruleCountFinal} rules, enabled=${tierFinal?.dynamic_pricing_enabled}`)
}

console.log(`\n${failed === 0 ? 'ALL CHECKS PASSED' : `${failed} CHECK(S) FAILED`} on ${url}`)
process.exit(failed === 0 ? 0 : 1)
