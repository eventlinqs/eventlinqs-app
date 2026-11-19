/**
 * A WINDOW RECORDS THE FAULT IT FOUND, THE SAME HOUR (Lawal, 20 November 2026, 06:07, through the PM's 06:10, item 1; law
 * 33 (e)): one row of ops_lessons on production (migration 20261120070001), written through the Supabase Management API a
 * window already holds under scripts/ops/with-supabase-token.ps1, the same row src/lib/ops/lessons.ts writes from the
 * engine. Append only: a lesson already kept under its key is said as known, never written twice.
 *
 * Env: SUPABASE_ACCESS_TOKEN; LESSON_WENT_WRONG, LESSON_CAUSE, LESSON_NOW_DOES, LESSON_HELD_BY, LESSON_EVIDENCE,
 * LESSON_PHASE (optional, a timetable phase), LESSON_KEY (unique, e.g. 'window:5A:2026-11-20T06:30').
 *
 * Run: node scripts/ops/record-lesson-api.mjs
 */
const PRODUCTION_REF = 'gndnldyfudbytbboxesk'
const PHASES = ['prepare', 'collect', 'verify', 'freeze', 'schedule', 'live', 'queue', 'report', 'send', 'inbox', 'midday', 'tonight', 'evening']
const env = process.env
const literal = (text) => (text === null ? 'null' : `'${String(text).replace(/'/g, "''")}'`)
const words = (name, max) => {
  const t = (env[name] ?? '').replace(/\s+/g, ' ').trim()
  return t.length >= 3 ? t.slice(0, max) : null
}

const wentWrong = words('LESSON_WENT_WRONG', 2000)
const nowDoes = words('LESSON_NOW_DOES', 2000)
const key = words('LESSON_KEY', 200)
const phase = env.LESSON_PHASE && PHASES.includes(env.LESSON_PHASE) ? env.LESSON_PHASE : null
if (!env.SUPABASE_ACCESS_TOKEN) {
  console.log('[record-lesson] REFUSED: run under scripts/ops/with-supabase-token.ps1')
  process.exit(2)
}
if (!wentWrong || !nowDoes || !key) {
  console.log('[record-lesson] REFUSED: a lesson needs LESSON_WENT_WRONG, LESSON_NOW_DOES and LESSON_KEY')
  process.exit(2)
}
const query =
  'insert into public.ops_lessons (learned_at, phase, went_wrong, cause, now_does, held_by, evidence, source, source_key) values (now(), ' +
  [literal(phase), literal(wentWrong), literal(words('LESSON_CAUSE', 2000)), literal(nowDoes), literal(words('LESSON_HELD_BY', 1000)), literal(words('LESSON_EVIDENCE', 1000)), "'window'", literal(key)].join(', ') +
  ') on conflict (source_key) do nothing returning id'
const res = await fetch(`https://api.supabase.com/v1/projects/${PRODUCTION_REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query, read_only: false }),
})
const body = await res.json().catch(() => null)
if (!res.ok) {
  console.log(`[record-lesson] not recorded (HTTP ${res.status}): ${JSON.stringify(body).slice(0, 300)}`)
  process.exit(1)
}
console.log(`[record-lesson] ${Array.isArray(body) && body.length > 0 ? 'recorded' : 'known already'}: ${key}`)
