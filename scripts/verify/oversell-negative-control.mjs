/**
 * THE NEGATIVE CONTROL: prove the oversell drill can actually SEE an oversell.
 *
 * WHY THIS EXISTS. oversell-concurrency-drill.mjs reports "1 of 50 buyers won" and
 * concludes there is no oversell. That conclusion is worthless on its own, because
 * a drill that CANNOT produce an oversell reports exactly the same thing as a
 * platform that prevents one. The measurement has to be shown to be capable of
 * failing before a pass from it means anything. This project has already been
 * burnt by a vacuous measurement once.
 *
 * SO THIS REMOVES THE PROTECTION AND SHOWS THE OVERSELL APPEAR. It takes the live
 * `create_reservation` body, strips the single `FOR UPDATE` that serialises
 * concurrent buyers, installs it under a DIFFERENT NAME, and fires the same
 * concurrency at it.
 *
 * THE REAL FUNCTION IS NEVER MODIFIED. Earlier drafts of this idea would have
 * altered `create_reservation` in place and restored it afterwards, which puts a
 * window on TEST where the platform genuinely oversells, and leaves the function
 * broken if the script dies midway. Installing a differently named copy has the
 * same evidential value with none of that risk, and the copy is dropped at the end.
 *
 * BOTH ARMS USE THE SAME TRANSPORT, which is what makes the comparison mean
 * something. Both the real function and the stripped copy are fired through the
 * same pg Pool with N connections, so the ONLY difference between the two runs is
 * the presence of `FOR UPDATE`. Comparing a PostgREST run against a Postgres run
 * would have left the transport as an alternative explanation.
 *
 * TEST ONLY. It creates and drops a function, so it is genuinely write-capable and
 * preflights before opening a socket.
 *
 * USAGE: node --env-file=.env.test scripts/verify/oversell-negative-control.mjs
 */
import pg from 'pg'
import { randomUUID } from 'node:crypto'
import { assertNotProductionDatabase } from '../lib/production-write-preflight.mjs'

const target = assertNotProductionDatabase()

const N = 50
const COPY = 'create_reservation_nolock_drill'
const fails = []
const scanned = []
const hr = t => console.log(`\n${'='.repeat(76)}\n${t}\n${'='.repeat(76)}`)
function assert(cond, msg, detail) {
  if (cond) console.log(`  PASS: ${msg}`)
  else { console.log(`  FAIL: ${msg}${detail !== undefined ? ` (${detail})` : ''}`); fails.push(msg) }
}

const admin = await target.connect()

const stamp = Date.now().toString(36)
const orgId = randomUUID(), eventId = randomUUID(), tierId = randomUUID()
let ownerId = null
let installed = false

try {
  // ---- fixture, written directly so no auth user is needed -----------------
  hr(`NEGATIVE CONTROL  |  target ${target.ref} (TEST)  |  N = ${N}`)
  const cat = (await admin.query(`select id from public.event_categories limit 1`)).rows[0]
  /*
   * The owner is an EXISTING profile, not a fresh uuid. organisations.owner_id has
   * a foreign key to public.profiles (not to auth.users), so a synthetic id fails
   * with 23503 "Key (owner_id)=... is not present in table profiles". Creating a
   * real one from here would mean writing the auth schema over direct Postgres,
   * which is a bigger power than this drill needs: it never authenticates as
   * anybody, so any existing profile serves as the owning row.
   */
  const existingOwner = (await admin.query(`select id from public.profiles limit 1`)).rows[0]
  if (!existingOwner) throw new Error('no profile row on TEST to own the fixture organisation')
  ownerId = existingOwner.id
  await admin.query(
    `insert into public.organisations (id, name, slug, owner_id, email, status, payout_status)
     values ($1,$2,$3,$4,$5,'active','active')`,
    [orgId, `Negctl ${stamp}`, `negctl-${stamp}`, ownerId, `negctl-${stamp}@eventlinqs.test`],
  )
  await admin.query(
    `insert into public.events (id, title, slug, description, summary, organisation_id, created_by,
       category_id, start_date, end_date, timezone, event_type, venue_name, venue_address, venue_city,
       venue_state, venue_country, status, visibility, published_at, is_age_restricted, max_capacity,
       is_free, fee_pass_type, cover_image_url)
     values ($1,$2,$3,'negative control','negctl',$4,$5,$6, now() + interval '21 days',
       now() + interval '21 days 3 hours','Australia/Sydney','in_person','Hall','1 St','Geelong','VIC',
       'Australia','draft','public', now(), false, 100, false, 'pass_to_buyer', null)`,
    [eventId, `Negctl ${stamp}`, `negctl-${stamp}`, orgId, ownerId, cat?.id ?? null],
  )
  await admin.query(
    `insert into public.ticket_tiers (id, event_id, name, tier_type, price, currency, total_capacity,
       sold_count, reserved_count, min_per_order, max_per_order, sort_order, is_visible, is_active,
       dynamic_pricing_enabled, requires_access_code)
     values ($1,$2,'General Admission','general_admission',2500,'AUD',1,0,0,1,10,0,true,true,false,false)`,
    [tierId, eventId],
  )
  scanned.push('a fixture event and a one-seat tier, created directly in Postgres')

  // ---- build the stripped copy from the LIVE body --------------------------
  const live = (await admin.query(
    `select pg_get_functiondef(p.oid) as def from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname='public' and p.proname='create_reservation'`,
  )).rows[0]?.def
  if (!live) throw new Error('create_reservation not found on this database')

  const forUpdateCount = (live.match(/FOR UPDATE/gi) ?? []).length
  console.log(`  live create_reservation contains ${forUpdateCount} FOR UPDATE clause(s)`)
  assert(forUpdateCount >= 1, 'the live function takes a row lock (this is the protection under test)', forUpdateCount)

  // Rename and strip. Nothing else about the body changes, which is the point:
  // any behavioural difference below is attributable to the lock alone.
  const stripped = live
    .replace(/FUNCTION public\.create_reservation\(/, `FUNCTION public.${COPY}(`)
    .replace(/FOR UPDATE/gi, '')
  await admin.query(stripped)
  installed = true
  scanned.push(`a copy of the live body with FOR UPDATE removed, installed as public.${COPY}`)
  console.log(`  installed public.${COPY} (identical body, ${forUpdateCount} FOR UPDATE removed)`)

  /*
   * ---- the runner: N concurrent calls on N SEPARATE connections ------------
   *
   * THE CONNECTION CEILING IS REAL AND IS NOT IGNORED. `.env.test` points at the
   * Supabase pooler on 5432, which is SESSION mode and refuses past 15 clients:
   *
   *   XX000  (EMAXCONNSESSION) max clients reached in session mode
   *          - max clients are limited to pool_size: 15
   *
   * So the first attempt is the TRANSACTION pooler on 6543, which multiplexes and
   * allows the full N. Each call here is a single `select fn(...)`, therefore one
   * implicit transaction, which is exactly what transaction mode supports; a
   * multi-statement transaction would not be safe there and none is used.
   *
   * If 6543 is unreachable it falls back to session mode with a reduced N and
   * REPORTS THE N IT ACTUALLY ACHIEVED, because silently racing 14 callers while
   * the header says 50 would be a measurement that lies about its own strength.
   */
  async function openPool() {
    const tx = new pg.Pool({ ...target.clientConfig, port: 6543, max: N, connectionTimeoutMillis: 15000 })
    try {
      const probe = await tx.connect()
      probe.release()
      return { pool: tx, n: N, mode: 'transaction pooler :6543' }
    } catch (err) {
      await tx.end().catch(() => {})
      const sessionMax = 14   // 15 minus this script's own admin connection
      console.log(`  transaction pooler unavailable (${err.message.split('\n')[0]}), falling back to session mode`)
      return {
        pool: new pg.Pool({ ...target.clientConfig, max: sessionMax, connectionTimeoutMillis: 15000 }),
        n: sessionMax,
        mode: 'session pooler :5432 (capped)',
      }
    }
  }
  const opened = await openPool()
  const pool = opened.pool
  const CONC = opened.n
  console.log(`  concurrency: ${CONC} simultaneous callers via the ${opened.mode}`)
  scanned.push(`${CONC} genuinely simultaneous connections via the ${opened.mode}`)

  async function reset() {
    await admin.query(`delete from public.reservations where event_id = $1`, [eventId])
    await admin.query(
      `update public.ticket_tiers set total_capacity = 1, sold_count = 0, reserved_count = 0 where id = $1`,
      [tierId],
    )
  }
  const tierState = async () =>
    (await admin.query(
      `select total_capacity, sold_count, reserved_count from public.ticket_tiers where id = $1`, [tierId],
    )).rows[0]

  /**
   * Fire N calls that all start together. Each grabs its own pooled connection
   * FIRST, then waits on a shared barrier, so the calls are not staggered by
   * connection setup. Without the barrier the first caller can finish before the
   * last one has connected, and the race never actually happens.
   */
  async function fire(fnName) {
    const clients = await Promise.all(Array.from({ length: CONC }, () => pool.connect()))
    let release
    const barrier = new Promise(r => { release = r })
    const runs = clients.map((c, i) =>
      barrier.then(() =>
        c.query(
          `select public.${fnName}($1::uuid, null, $2::text, $3::jsonb, 10) as result`,
          [eventId, `negctl-${stamp}-${i}`, JSON.stringify([{ ticket_tier_id: tierId, quantity: 1 }])],
        ).then(r => ({ ok: r.rows[0].result?.success === true, body: r.rows[0].result }))
         .catch(e => ({ ok: false, error: e.message.split('\n')[0] })),
      ),
    )
    release()
    const out = await Promise.all(runs)
    for (const c of clients) c.release()
    return out
  }

  // ---- ARM 1: the real function -------------------------------------------
  hr(`ARM 1  the LIVE create_reservation, ${CONC} simultaneous buyers, 1 seat`)
  await reset()
  const armReal = await fire('create_reservation')
  const realOk = armReal.filter(r => r.ok).length
  const realTier = await tierState()
  console.log(`  succeeded ${realOk} of ${CONC}`)
  console.log(`  tier: sold=${realTier.sold_count} reserved=${realTier.reserved_count} capacity=${realTier.total_capacity}`)
  scanned.push(`${CONC} concurrent calls to the live create_reservation on ${CONC} separate connections`)
  assert(realOk === 1, `WITH the lock: exactly 1 of ${CONC} won`, `${realOk} succeeded`)
  assert(realTier.sold_count + realTier.reserved_count <= realTier.total_capacity,
    'WITH the lock: capacity respected', `${realTier.sold_count + realTier.reserved_count}/${realTier.total_capacity}`)

  // ---- ARM 2: the stripped copy -------------------------------------------
  hr(`ARM 2  the SAME body with FOR UPDATE removed, ${CONC} simultaneous buyers, 1 seat`)
  await reset()
  const armNoLock = await fire(COPY)
  const noLockOk = armNoLock.filter(r => r.ok).length
  const noLockTier = await tierState()
  const overclaimed = noLockTier.sold_count + noLockTier.reserved_count
  console.log(`  succeeded ${noLockOk} of ${CONC}`)
  console.log(`  tier: sold=${noLockTier.sold_count} reserved=${noLockTier.reserved_count} capacity=${noLockTier.total_capacity}`)
  scanned.push(`${CONC} concurrent calls to the lock-free copy, same transport, same concurrency`)

  if (noLockOk > 1) {
    console.log(`\n  >>> OVERSELL REPRODUCED. ${noLockOk} buyers were sold ${noLockTier.total_capacity} seat(s).`)
    console.log(`  >>> ${overclaimed} claimed against a capacity of ${noLockTier.total_capacity}: ${overclaimed - noLockTier.total_capacity} people would be turned away at the door.`)
  }
  assert(noLockOk > 1,
    'WITHOUT the lock the oversell REAPPEARS, so the drill can detect one and ARM 1 is not a vacuous pass',
    `${noLockOk} succeeded, expected more than 1`)

  hr('THE COMPARISON')
  console.log(`  ${'arm'.padEnd(46)} ${'won'.padStart(4)}  ${'claimed/cap'.padStart(12)}`)
  console.log(`  ${'-'.repeat(46)} ${'-'.repeat(4)}  ${'-'.repeat(12)}`)
  console.log(`  ${'live create_reservation (FOR UPDATE present)'.padEnd(46)} ${String(realOk).padStart(4)}  ${`${realTier.sold_count + realTier.reserved_count}/${realTier.total_capacity}`.padStart(12)}`)
  console.log(`  ${'same body, FOR UPDATE removed'.padEnd(46)} ${String(noLockOk).padStart(4)}  ${`${overclaimed}/${noLockTier.total_capacity}`.padStart(12)}`)
  console.log(`\n  The only difference between those two rows is the row lock.`)

  await pool.end()
} finally {
  // Always remove the unsafe copy, even on failure. A lock-free reservation
  // function left installed on TEST is a trap for the next person.
  if (installed) {
    await admin.query(`DROP FUNCTION IF EXISTS public.${COPY}(uuid, uuid, text, jsonb, int)`).catch(() => {})
    console.log(`\n  dropped public.${COPY}`)
  }
  await admin.query(`delete from public.reservations where event_id = $1`, [eventId]).catch(() => {})
  await admin.query(`delete from public.share_links where event_id = $1`, [eventId]).catch(() => {})
  await admin.query(`delete from public.ticket_tiers where event_id = $1`, [eventId]).catch(() => {})
  await admin.query(`delete from public.events where id = $1`, [eventId]).catch(() => {})
  await admin.query(`delete from public.organisations where id = $1`, [orgId]).catch(() => {})
  console.log('  fixture removed')
  await admin.end()
}

hr('WHAT THIS CONTROL SCANNED')
scanned.forEach((s, i) => console.log(`  ${i + 1}. ${s}`))
console.log(`\n  ${fails.length === 0
  ? 'CONTROL VALID: the lock prevents the oversell, and removing it reproduces the oversell.'
  : `${fails.length} FAILED ASSERTION(S):`}`)
for (const f of fails) console.log(`    - ${f}`)
process.exitCode = fails.length === 0 ? 0 : 2
