// Window 5, 30 October 2026: the four honest levels of production's night reports kept in the last 28 days, through
// the dashboard's own math (src/lib/growth/four-levels.ts), read only through the Management API (read_only true).
// Usage: scripts\ops\with-supabase-token.ps1 -Program node -Arguments @('node_modules/tsx/dist/cli.mjs', 'scripts/verify/four-levels-production-read.mts')
const REF = 'gndnldyfudbytbboxesk'
const token = process.env.SUPABASE_ACCESS_TOKEN
if (!token) { console.error('REFUSED: SUPABASE_ACCESS_TOKEN is not in the environment'); process.exit(2) }
const { fourLevels, levelFigures, nightFiguresFrom, venueLevels } = await import('../../src/lib/growth/four-levels')
const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: "select figures from public.organiser_night_reports where read_at >= now() - interval '28 days' order by id", read_only: true }),
})
if (!res.ok) { console.error(`FAILED (HTTP ${res.status}): ${(await res.text()).slice(0, 300)}`); process.exit(1) }
const rows = (await res.json()) as { figures: unknown }[]
const nights = rows.map((r) => nightFiguresFrom(r.figures))
console.log(`project ${REF}; ${rows.length} kept report(s) in the last 28 days; ${nights.filter((n) => n === null).length} in a shape not read`)
for (const f of levelFigures(venueLevels(nights.filter((n) => n !== null).map(fourLevels)))) {
  console.log(`  ${f.label}: ${f.display ?? (f.value === null ? 'NOT COUNTED' : f.value)}${f.note ? ` (${f.note})` : ''}`)
}
console.log('READ')
