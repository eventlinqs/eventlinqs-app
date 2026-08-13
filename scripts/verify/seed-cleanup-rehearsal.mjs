/**
 * REHEARSE runbook section 6 against TEST, with the statements run verbatim.
 *
 * WHY A REHEARSAL AND NOT A SCRIPT. The founder ruled against a bespoke cleanup
 * script, correctly: `events.is_seed_data` is a fixture marker the application
 * never writes, and `orders.event_id` is ON DELETE RESTRICT, so the worst case
 * of the runbook SQL is a refusal rather than a loss. A never-run delete script
 * pointed at live data would add risk rather than remove it. What was missing was
 * evidence that the four statements behave as written, including the refusal.
 *
 * WHAT IS ADDED TO THE RUNBOOK STATEMENTS, and it is only this: the whole
 * rehearsal runs inside one transaction that is ROLLED BACK at the end. The
 * statements themselves are byte-identical to the runbook. The transaction exists
 * because TEST is what the preview deployment reads, and the runbook's step 4
 * deletes EVERY seeded row, which on TEST is the entire demo catalogue. Rolling
 * back leaves TEST exactly as found while still executing every statement for
 * real against real rows.
 *
 * Usage: node --env-file=.env.test scripts/verify/seed-cleanup-rehearsal.mjs
 */
import pg from 'pg'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'

assertNotProduction()

const conn = process.env.SUPABASE_DB_URL
if (!conn) {
  console.error('SUPABASE_DB_URL is required.')
  process.exit(1)
}
if (/gndnldyfudbytbboxesk/.test(conn)) {
  console.error('REFUSING: that connection string points at PRODUCTION.')
  process.exit(1)
}

/*
 * PARSED BY HAND, NOT HANDED TO pg AS A connectionString.
 *
 * The TEST password contains characters that are reserved in a URL and are not
 * percent-encoded, so `new URL(...)` throws `ERR_INVALID_URL` and pg reports the
 * input as *****REDACTED*****, which reads like a placeholder rather than a
 * parse failure. Splitting on the LAST '@' and the FIRST ':' after the scheme
 * avoids the URL parser entirely and leaves the password untouched.
 */
function parseConn(raw) {
  const [scheme, rest] = raw.trim().replace(/^"|"$/g, '').split('://')
  if (!rest) throw new Error('connection string has no scheme')
  const at = rest.lastIndexOf('@')
  const creds = rest.slice(0, at)
  const hostPart = rest.slice(at + 1)
  const sep = creds.indexOf(':')
  const [hostPort, database] = hostPart.split('/')
  const [host, port] = hostPort.split(':')
  return {
    scheme,
    user: creds.slice(0, sep),
    password: creds.slice(sep + 1),
    host,
    port: Number(port ?? 5432),
    database: (database ?? 'postgres').split('?')[0],
  }
}

const cfg = parseConn(conn)
console.log(`connecting to ${cfg.host}:${cfg.port}/${cfg.database} as ${cfg.user}`)
const client = new pg.Client({
  user: cfg.user,
  password: cfg.password,
  host: cfg.host,
  port: cfg.port,
  database: cfg.database,
  ssl: { rejectUnauthorized: false },
})
await client.connect()

const show = (label, rows) => {
  console.log(`\n--- ${label} ---`)
  for (const r of rows) console.log('   ' + JSON.stringify(r))
}

/** Counts for every table the delete can touch, so nothing moves unnoticed. */
async function census(tag) {
  const tables = ['events', 'orders', 'ticket_tiers', 'tickets', 'event_categories']
  const out = {}
  for (const t of tables) {
    const { rows } = await client.query(`select count(*)::int as n from public.${t}`)
    out[t] = rows[0].n
  }
  console.log(`\n===== CENSUS ${tag} =====`)
  for (const [t, n] of Object.entries(out)) console.log(`   ${t.padEnd(18)} ${n}`)
  return out
}

const before = await census('BEFORE (outside the transaction)')

await client.query('begin')
try {
  // ---- 1a. Representative seeded rows, one of them with an order attached ----
  // Borrowed from a real row so every NOT NULL column is satisfied with a value
  // the schema already accepts, rather than inventing one and discovering the
  // constraints one error at a time.
  const model = (
    await client.query(
      `select organisation_id, category_id, created_by, cover_image_url
         from public.events
        where created_by is not null and cover_image_url is not null and status = 'published'
        limit 1`,
    )
  ).rows[0]

  const made = []
  for (let i = 1; i <= 3; i += 1) {
    const { rows } = await client.query(
      `insert into public.events
         (organisation_id, category_id, created_by, cover_image_url, title, slug, description,
          start_date, end_date, status, visibility, timezone, is_seed_data)
       values ($1,$2,$3,$4,$5,$6,$7, now() + interval '30 days', now() + interval '30 days 3 hours',
               'published','public','Australia/Melbourne', true)
       returning id, slug, title`,
      [model.organisation_id, model.category_id, model.created_by, model.cover_image_url,
       `REHEARSAL Seeded Event ${i}`, `rehearsal-seeded-${i}-${Date.now()}`,
       'A rehearsal row. Rolled back.'],
    )
    made.push(rows[0])
  }
  console.log(`\ninserted ${made.length} seeded rows for the rehearsal`)

  // An order against the FIRST one, so ON DELETE RESTRICT is exercised.
  const REHEARSAL_ORDER = `EL-REH${Date.now().toString().slice(-6)}`
  await client.query(
    `insert into public.orders
       (order_number, event_id, organisation_id, guest_email,
        subtotal_cents, total_cents, currency)
     values ($1,$2,$3,'rehearsal@example.invalid',2500,2500,'AUD')`,
    [REHEARSAL_ORDER, made[0].id, model.organisation_id],
  )
  console.log(`attached one order to ${made[0].slug}, so the refusal path is real`)

  // ================= RUNBOOK SECTION 6, VERBATIM =================

  // Step 1
  const step1 = await client.query('select count(*) from public.events where is_seed_data = true;')
  console.log(`\nSTEP 1 count: ${step1.rows[0].count}`)

  // Step 2
  const step2 = await client.query(
    `select id, slug, title, status, venue_city
    from public.events where is_seed_data = true order by title;`,
  )
  console.log(`STEP 2 returned ${step2.rowCount} rows; the three rehearsal rows are:`)
  show('rehearsal rows in the step 2 list', step2.rows.filter((r) => r.title.startsWith('REHEARSAL')))

  // Step 3
  const step3 = await client.query(
    `select count(*) from public.orders o
    join public.events e on e.id = o.event_id
   where e.is_seed_data = true;`,
  )
  console.log(`\nSTEP 3 orders against seeded events: ${step3.rows[0].count}`)

  // Step 3, the list of which will be KEPT
  const keeping = await client.query(
    `select e.id, e.slug, e.title, count(o.id) as orders
     from public.events e
     join public.orders o on o.event_id = e.id
    where e.is_seed_data = true
    group by e.id, e.slug, e.title
    order by orders desc;`,
  )
  console.log(`STEP 3 list: ${keeping.rowCount} distinct seeded events carry orders and will be KEPT`)

  // THE OLD STEP 4, kept as evidence of WHY the runbook now uses the guarded
  // form. This is the statement that is refused outright.
  console.log('\nThe UNGUARDED delete, which the runbook no longer tells you to run:')
  await client.query('savepoint before_delete')
  try {
    await client.query('delete from public.events where is_seed_data = true;')
    console.log('   it succeeded (only possible when no seeded event has an order)')
  } catch (err) {
    console.log('   RAW POSTGRES ERROR:')
    console.log(`   code   : ${err.code}`)
    console.log(`   message: ${err.message}`)
    if (err.detail) console.log(`   detail : ${err.detail}`)
    if (err.constraint) console.log(`   constraint: ${err.constraint}`)
  }
  await client.query('rollback to savepoint before_delete')

  // Step 4 as the runbook now writes it: guarded, cannot be refused.
  console.log('\nSTEP 4 (guarded delete, the runbook version):')
  const del = await client.query(
    `delete from public.events e
    where e.is_seed_data = true
      and not exists (select 1 from public.orders o where o.event_id = e.id);`,
  )
  console.log(`   RAW RESULT: ${del.command} ${del.rowCount}`)

  // Step 6
  const v1 = await client.query('select count(*) from public.events where is_seed_data = true;')
  const v2 = await client.query('select count(*) from public.events;')
  console.log(`\nSTEP 6 seeded remaining: ${v1.rows[0].count}   (expect ${keeping.rowCount}, the order-bearing ones)`)
  console.log(`STEP 6 events total   : ${v2.rows[0].count}`)
  console.log(`   arithmetic: ${step1.rows[0].count} seeded - ${del.rowCount} deleted = ${v1.rows[0].count} remaining`)

  await census('INSIDE the transaction, after the delete')
} finally {
  await client.query('rollback')
  console.log('\n=== transaction ROLLED BACK: TEST is unchanged ===')
}

const after = await census('AFTER (outside the transaction)')

const drift = Object.keys(before).filter((t) => before[t] !== after[t])
console.log(`\ntables whose count changed: ${drift.length === 0 ? 'none' : drift.join(', ')}`)
await client.end()
