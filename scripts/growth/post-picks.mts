/**
 * THE POST PICKS, PER CITY PER DAY (Lawal, 07:55 on 7 November 2026; the CONTROLLER's 07:58: 'Output: a ranked post picks
 * list per city per day, with each pick's reasons, for the CONTROLLER to fill the Canva templates'). READ ONLY on production.
 * The ranking is src/lib/growth/post-picks.ts; this reads its signals from what the engine stores and writes the lists to
 * C:\dev\GROWTH\post-picks\picks-<date>.md.
 *   TONIGHT   tonight's nights, from 5 pm, Melbourne time
 *   WEEKEND   this Saturday and Sunday (or the coming ones)
 *   FREE      the free nights of the next seven days
 * Signals: ticketed (a paid booking link or a paid ticket tier), free (neither), sold out (any booking link says so), the
 * nights its listing runs (its series' upcoming count). Only published, public nights are read: nothing held is picked.
 *   scripts\ops\with-supabase-token.ps1 node node_modules/tsx/dist/cli.mjs scripts/growth/post-picks.mts
 */
import { mkdirSync, writeFileSync } from 'node:fs'
const pick = <T,>(m: T & { default?: T }) => (m.default ?? m) as T
const { rankPicks } = pick((await import('@/lib/growth/post-picks')) as typeof import('@/lib/growth/post-picks'))
type PickInput = import('@/lib/growth/post-picks').PickInput
type PostKind = import('@/lib/growth/post-picks').PostKind

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN
if (!TOKEN) throw new Error('REFUSED: run under scripts\\ops\\with-supabase-token.ps1 (production is read, never written)')
const OUT = 'C:/dev/GROWTH/post-picks'
const CITIES = ['geelong', 'melbourne', 'ballarat', 'bendigo']

type Row = { id: string; title: string; venue_name: string | null; city: string; category: string | null; start_date: string; timezone: string | null; paid: boolean; sold_out: boolean; nights: number }
const res = await fetch('https://api.supabase.com/v1/projects/gndnldyfudbytbboxesk/database/query', {
  method: 'POST',
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    read_only: true,
    query: `
      select e.id, e.title, e.venue_name, lower(coalesce(e.city_primary, '')) as city, c.slug as category, e.start_date, e.timezone,
             (exists (select 1 from public.event_booking_links l where l.event_id = e.id and l.kind <> 'free_register' and coalesce(l.price_from_cents, 1) > 0)
              or exists (select 1 from public.ticket_tiers t where t.event_id = e.id and t.price > 0)) as paid,
             exists (select 1 from public.event_booking_links l where l.event_id = e.id and (l.availability = 'sold_out' or l.kind = 'sold_out')) as sold_out,
             /* A run is the same title at the same venue, as a reader sees it: two series of one festival on two days are
                one run of two, never two 'one night only' picks (Colours of Asia, the first output, 7 November). */
             greatest(1, (select count(*) from public.events s where lower(s.title) = lower(e.title) and coalesce(s.venue_name, '') = coalesce(e.venue_name, '')
                                and s.status = 'published' and s.visibility = 'public' and s.start_date > now()))::int as nights
        from public.events e left join public.event_categories c on c.id = e.category_id
       where e.status = 'published' and e.visibility = 'public' and e.start_date > now() and e.start_date < now() + interval '8 days'`,
  }),
})
if (!res.ok) throw new Error(`production read refused (${res.status})`)
const rows = (await res.json()) as Row[]

const zone = 'Australia/Melbourne'
const dayOf = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
const weekdayOf = (iso: string) => new Intl.DateTimeFormat('en-AU', { timeZone: zone, weekday: 'short' }).format(new Date(iso))
const when = (iso: string) => new Intl.DateTimeFormat('en-AU', { timeZone: zone, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso)).replace(/\u202f/g, ' ')
const today = dayOf(new Date().toISOString())
const weekendDays = new Set<string>()
for (let i = 0; i < 7; i++) {
  const d = new Date(Date.now() + i * 86400000).toISOString()
  if (/Sat|Sun/.test(weekdayOf(d)) && (weekendDays.size < 2)) weekendDays.add(dayOf(d))
}
const input = (r: Row): PickInput => ({
  id: r.id, title: r.title, venue: r.venue_name, categorySlug: r.category, ticketed: r.paid, free: !r.paid,
  startsAt: r.start_date, zone: r.timezone ?? zone, soldOut: r.sold_out, nightsInListing: r.nights,
})
const POSTS: [PostKind, string, (r: Row) => boolean][] = [
  ['tonight', `Tonight (${today})`, (r) => dayOf(r.start_date) === today],
  ['weekend', `This weekend (${[...weekendDays].join(', ')})`, (r) => weekendDays.has(dayOf(r.start_date))],
  ['free', 'Free, the next seven days', () => true],
]
const lines: string[] = [`# Post picks for ${today}`, '', 'Ranked by crowd first, then demand (sold out), pull, and one night only; nothing under the floor; read only from production at ' + new Date().toISOString() + '.', '']
for (const city of CITIES) {
  lines.push(`## ${city[0].toUpperCase()}${city.slice(1)}`, '')
  for (const [kind, label, inWindow] of POSTS) {
    const mine = rows.filter((r) => r.city === city && inWindow(r))
    const picks = rankPicks(mine.map(input), kind)
    lines.push(`### ${label}: ${picks.length} pick(s) clear the floor of ${mine.length} night(s)`)
    const byId = new Map(mine.map((r) => [r.id, r]))
    picks.slice(0, 10).forEach((p, i) => lines.push(`${i + 1}. ${p.title}, ${when(byId.get(p.id)!.start_date)}, ${byId.get(p.id)!.venue_name} (score ${p.score}: ${p.reasons.join('; ')})`))
    lines.push('')
  }
}
mkdirSync(OUT, { recursive: true })
const file = `${OUT}/picks-${today}.md`
writeFileSync(file, lines.join('\n') + '\n')
console.log(lines.join('\n'))
console.log(`[post-picks] written to ${file}`)
