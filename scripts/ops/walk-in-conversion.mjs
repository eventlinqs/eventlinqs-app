// WALK-IN CONVERSION (WI1): HOW MANY PAGE VIEWS LEAD TO AN ACTION, PER EVENT.
//
// WI1-ITEM.md, the reversal condition: "if 30 days after launch fewer than 1 in
// 50 walk-in page views leads to a Remind me, calendar add, share or follow,
// the panel's order is redrawn three ways". This prints that figure so nobody
// counts it by hand on day 30 (Law 10). It READS ONLY: every query goes to the
// Management API with read_only true, and it writes nothing anywhere.
//
// The figure is the one the organiser dashboard shows (src/lib/walk-in/
// organiser-numbers.ts): views, calendar adds, shares and follows are demand
// rows on the event's slot in the slot ledger, and Remind me is the event's
// rows in event_reminders.
//
// Usage (the token comes from the environment and is never printed):
//   scripts\ops\with-supabase-token.ps1 node scripts\ops\walk-in-conversion.mjs
//   ... --target test          TEST (vkapkibzokmfaxqogypq) instead of production

const TARGETS = { production: 'gndnldyfudbytbboxesk', test: 'vkapkibzokmfaxqogypq' }
// The reversal condition's own number, from WI1-ITEM.md.
const REVERSAL_ONE_IN = 50

const args = process.argv.slice(2)
let target = 'production'
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--target' && args[i + 1] === 'test') {
    target = 'test'
    i += 1
  } else {
    console.error(`REFUSED: unknown argument ${JSON.stringify(args[i])} (only --target test)`)
    process.exit(2)
  }
}

const ref = TARGETS[target]
const token = process.env.SUPABASE_ACCESS_TOKEN
if (!token) {
  console.error('REFUSED: SUPABASE_ACCESS_TOKEN is not in the environment; run through scripts\\ops\\with-supabase-token.ps1')
  process.exit(2)
}

async function read(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql, read_only: true }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`query failed on ${target} (HTTP ${res.status}): ${text.slice(0, 500)}`)
  return JSON.parse(text)
}

const SQL = `
with w as (
  select e.id, e.slug, e.title, e.status, e.published_at
    from public.events e
   where e.entry_mode = 'walk_in'
     and e.status in ('published', 'completed', 'postponed', 'cancelled')
),
d as (
  select ls.source_ref as event_id, le.demand_action, count(*)::int as n
    from public.ledger_slots ls
    join public.ledger_entries le on le.slot_id = ls.id and le.kind = 'demand'
   where ls.source_system = 'eventlinqs'
     and ls.source_ref in (select id from w)
   group by ls.source_ref, le.demand_action
),
r as (
  select er.event_id, count(*)::int as n
    from public.event_reminders er
   where er.event_id in (select id from w)
   group by er.event_id
)
select w.slug, w.title, w.status, w.published_at,
       coalesce(sum(d.n) filter (where d.demand_action = 'page_view'), 0)::int as views,
       coalesce(max(r.n), 0)::int as reminders,
       coalesce(sum(d.n) filter (where d.demand_action = 'calendar_add'), 0)::int as calendar_adds,
       coalesce(sum(d.n) filter (where d.demand_action = 'share'), 0)::int as shares,
       coalesce(sum(d.n) filter (where d.demand_action = 'follow'), 0)::int as follows
  from w
  left join d on d.event_id = w.id
  left join r on r.event_id = w.id
 group by w.id, w.slug, w.title, w.status, w.published_at
 order by w.published_at nulls last
`

const oneIn = (actions, views) => (actions > 0 && views > 0 ? Math.max(1, Math.round(views / actions)) : null)

async function main() {
  console.log(`target ${target} (${ref}), read only`)
  const rows = await read(SQL)
  if (rows.length === 0) {
    console.log('NO WALK-IN EVENTS: nothing has been published as free entry on this database yet')
    return 0
  }
  let views = 0
  let actions = 0
  for (const row of rows) {
    const a = row.reminders + row.calendar_adds + row.shares + row.follows
    views += row.views
    actions += a
    const ratio = oneIn(a, row.views)
    console.log(
      `${row.slug}  ${row.status}  views ${row.views}  remind ${row.reminders}  calendar ${row.calendar_adds}  share ${row.shares}  follow ${row.follows}  ` +
        (ratio ? `1 in ${ratio}` : row.views > 0 ? 'no action yet' : 'no views yet'),
    )
  }
  const first = rows.map((r) => r.published_at).filter(Boolean).sort()[0] ?? null
  const days = first ? Math.floor((Date.now() - new Date(first).getTime()) / 864e5) : null
  const total = oneIn(actions, views)
  console.log('')
  console.log(`ALL WALK-IN EVENTS: ${views} views, ${actions} actions, ${total ? `1 in ${total}` : 'no action yet'}`)
  console.log(`First walk-in event published ${first ?? '(none)'}${days !== null ? `, ${days} days ago` : ''}`)
  if (views === 0) {
    console.log('VERDICT: NOT JUDGED, there are no walk-in page views to judge')
  } else {
    const holds = actions * REVERSAL_ONE_IN >= views
    console.log(
      holds
        ? `VERDICT: at least 1 in ${REVERSAL_ONE_IN} views leads to an action; the panel order stands`
        : `VERDICT: fewer than 1 in ${REVERSAL_ONE_IN} views leads to an action${days !== null && days >= 30 ? '; the reversal condition is met, redraw the panel three ways' : `; judged at day 30, today is day ${days}`}`,
    )
  }
  return 0
}

// process.exitCode rather than process.exit after network work: exiting while a
// fetch socket is still closing aborts Node on Windows (nodejs/node#56645).
main().then(
  (code) => {
    process.exitCode = code
  },
  (error) => {
    console.error(`FAILED: ${error.message}`)
    process.exitCode = 1
  },
)
