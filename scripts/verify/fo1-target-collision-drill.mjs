/**
 * THE DRILL FOR THE COLLISION BETWEEN THE TWO FO1 DRIVES.
 *
 * It reproduces, against the real TEST database, the state that broke
 * `fo1-founding-offer-drive` on 14 September 2026: the organisation that drive
 * would otherwise pick ALREADY holds a founding window, because
 * `fo1-founding-purchase-drive` ran first and KEPT its fixture.
 *
 * Before the fix the offer drive picked that organisation, failed
 * `fo1.setup.target-starts-standard`, and then its teardown REVOKED the window
 * and reported "left as found". After the fix it must skip that organisation
 * and leave its window exactly where it was.
 *
 * WHAT IT DOES, and it is reversible by construction.
 *
 *   --arm     grants a founding window to the organisation the offer drive
 *             would pick first, and writes down what that organisation held
 *             beforehand so it can be put back.
 *   --check   reads that organisation back and says whether the window
 *             survived, which is the assertion the drill exists to make.
 *   --disarm  restores whatever --arm wrote down. Always run it.
 *
 * It writes ONE column on ONE organisation and it is always a lane-B row: it
 * refuses to arm an organisation whose name or slug is not tagged lane-b.
 *
 * Usage (the shell must not carry the production Supabase URL):
 *   node --env-file=.env.local scripts/verify/fo1-target-collision-drill.mjs --arm
 *   BASE=http://localhost:3100 node --env-file=.env.local \
 *     scripts/verify/fo1-founding-offer-drive.mjs --out C:/dev/EVIDENCE/FO1-DRILL
 *   node --env-file=.env.local scripts/verify/fo1-target-collision-drill.mjs --check
 *   node --env-file=.env.local scripts/verify/fo1-target-collision-drill.mjs --disarm
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const HERE = dirname(fileURLToPath(import.meta.url))
const STATE = join(HERE, '..', '..', '.tmp-fo1-collision-drill.json')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
if (!/vkapkibzokmfaxqogypq/.test(url)) {
  console.error(`FAIL: this drill only runs against TEST vkapkibzokmfaxqogypq, not ${url}`)
  process.exit(1)
}
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', { auth: { persistSession: false } })

const mode = process.argv.slice(2).find(a => a.startsWith('--'))
if (!['--arm', '--check', '--disarm'].includes(mode ?? '')) {
  console.error('FAIL: one of --arm, --check or --disarm is required')
  process.exit(1)
}

/** The candidate list, read exactly the way the offer drive reads it. */
async function firstCandidate() {
  const { data: events, error } = await db
    .from('events')
    .select(
      'id, slug, organisation_id, ' +
        'organisation:organisations!inner(id, slug, name, status, stripe_charges_enabled, is_founding, founding_fee_free_until), ' +
        'ticket_tiers(id, price, total_capacity, sold_count, reserved_count)',
    )
    .eq('status', 'published')
    .eq('visibility', 'public')
    .gt('start_date', new Date().toISOString())
    .limit(200)
  if (error) throw new Error(`could not enumerate events: ${error.message}`)
  const sellable = (events ?? []).filter(e => {
    const org = e.organisation
    if (!org || org.status !== 'active' || org.stripe_charges_enabled !== true) return false
    const paid = (e.ticket_tiers ?? []).filter(t => Number(t.price) > 0)
    if (paid.length === 0) return false
    const free = paid.reduce(
      (n, t) => n + (Number(t.total_capacity) - Number(t.sold_count) - Number(t.reserved_count)), 0)
    return free > 1
  })
  /*
   * THE FIRST LANE-B CANDIDATE, because that is the set the offer drive now
   * chooses from. Arming lane A's or lane C's row would be the very thing the
   * drive was fixed to stop doing, and this drill refuses to do it either: the
   * check below is a second lock on the same rule.
   */
  return sellable.find(e => /lane-b/i.test(`${e.organisation?.name ?? ''} ${e.organisation?.slug ?? ''}`)) ?? null
}

async function read(orgId) {
  const { data } = await db.from('organisations')
    .select('id, name, slug, is_founding, founding_fee_free_until').eq('id', orgId).maybeSingle()
  return data
}

if (mode === '--arm') {
  const candidate = await firstCandidate()
  if (!candidate) { console.error('FAIL: no sellable paid event on TEST to arm against'); process.exit(1) }
  const org = candidate.organisation
  /*
   * LANE B ONLY. The drill writes to a shared TEST database that three lanes
   * use, so it refuses any row that is not tagged for this lane rather than
   * trusting that the first candidate happens to be one.
   */
  const tagged = /lane-b/i.test(`${org.name ?? ''} ${org.slug ?? ''}`)
  if (!tagged) {
    console.error(`FAIL: the first candidate is ${org.name} (${org.slug}), which is not tagged lane-b. Refusing to write to it.`)
    process.exit(1)
  }
  const before = await read(org.id)
  const until = new Date(Date.now() + 180 * 24 * 3600 * 1000).toISOString()
  const { error } = await db.rpc('admin_set_founding_waiver',
    { p_org_id: org.id, p_until: until, p_override: true, p_membership: 'grant' })
  if (error) { console.error(`FAIL: could not grant: ${error.message}`); process.exit(1) }
  const after = await read(org.id)
  writeFileSync(STATE, JSON.stringify({ orgId: org.id, name: org.name, before, armed: after }, null, 2))
  console.log(`ARMED: ${org.name} (${org.slug}) now holds a founding window until ${after.founding_fee_free_until}`)
  console.log(`       it held is_founding=${before.is_founding} window=${String(before.founding_fee_free_until)} before`)
  console.log(`       state written to ${STATE}`)
}

if (mode === '--check') {
  if (!existsSync(STATE)) { console.error('FAIL: nothing is armed; run --arm first'); process.exit(1) }
  const state = JSON.parse(readFileSync(STATE, 'utf8'))
  const now = await read(state.orgId)
  const survived =
    now?.is_founding === true &&
    String(now?.founding_fee_free_until) === String(state.armed.founding_fee_free_until)
  console.log(`armed  : ${state.name} is_founding=true window=${state.armed.founding_fee_free_until}`)
  console.log(`now    : ${state.name} is_founding=${now?.is_founding} window=${String(now?.founding_fee_free_until)}`)
  if (!survived) {
    console.error('FAIL: the offer drive did NOT leave the armed founding window alone. This is the defect.')
    process.exit(1)
  }
  console.log('PASS: the armed founding window survived the offer drive untouched.')
}

if (mode === '--disarm') {
  if (!existsSync(STATE)) { console.log('nothing armed; nothing to disarm'); process.exit(0) }
  const state = JSON.parse(readFileSync(STATE, 'utf8'))
  const b = state.before
  const restore = b.founding_fee_free_until === null
    ? { p_org_id: state.orgId, p_until: null, p_override: false, p_membership: 'revoke' }
    : { p_org_id: state.orgId, p_until: b.founding_fee_free_until, p_override: true, p_membership: 'grant' }
  const { error } = await db.rpc('admin_set_founding_waiver', restore)
  if (error) { console.error(`FAIL: could not restore: ${error.message}`); process.exit(1) }
  const now = await read(state.orgId)
  const same =
    Boolean(now?.is_founding) === Boolean(b.is_founding) &&
    String(now?.founding_fee_free_until ?? null) === String(b.founding_fee_free_until ?? null)
  console.log(`DISARMED: ${state.name} is_founding=${now?.is_founding} window=${String(now?.founding_fee_free_until)}`)
  if (!same) { console.error('FAIL: the row was not restored to what --arm found'); process.exit(1) }
  console.log('restored to exactly what --arm found')
}
