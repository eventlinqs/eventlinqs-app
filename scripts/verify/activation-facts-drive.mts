/**
 * THE WAY TO A FIRST SALE, READ FROM REAL ROWS ON TEST (V3 item 6, the CONTROLLER's 05:45 of 1 November 2026). It runs
 * the real readActivationFacts (src/lib/growth/activation-read.ts) and activationOf (src/lib/growth/activation.ts)
 * against every TEST organisation, up to 200, and writes what each one's checklist would say. Read only: it writes no
 * row anywhere. It also checks the answer is consistent: a step is only done when every step before it is, and a
 * first sale is only ever counted beside a paid order.
 *
 * Run (TEST only; it refuses anything else):
 *   node --conditions=react-server --env-file=<a TEST .env.local> --import tsx scripts/verify/activation-facts-drive.mts
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import type * as ReadModule from '@/lib/growth/activation-read'
import type * as ActivationModule from '@/lib/growth/activation'

const TEST_REF = 'vkapkibzokmfaxqogypq'
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!url.includes(TEST_REF) || process.env.VERCEL_ENV === 'production') {
  console.error('activation-facts-drive runs on TEST only')
  process.exit(2)
}
/* src is CommonJS to tsx; read each module's exports whichever way the loader hands them over. */
const readMod = (await import('@/lib/growth/activation-read')) as typeof ReadModule & { default?: typeof ReadModule }
const actMod = (await import('@/lib/growth/activation')) as typeof ActivationModule & { default?: typeof ActivationModule }
const { readActivationFacts } = readMod.readActivationFacts ? readMod : readMod.default!
const { activationOf, ACTIVATION_STEPS } = actMod.activationOf ? actMod : actMod.default!

const db = createClient(url, key, { auth: { persistSession: false } })
const OUT = 'C:\\dev\\EVIDENCE\\ACTIVATION-1NOV'
mkdirSync(OUT, { recursive: true })

const { data: orgs, error } = await db.from('organisations').select('id, name').order('created_at', { ascending: true }).limit(200)
if (error || !orgs) {
  console.error(`organisations could not be read: ${error?.message}`)
  process.exit(1)
}

const lines: string[] = []
const tally = new Map<string, number>()
let failed = 0
for (const org of orgs) {
  try {
    const facts = await readActivationFacts(db, org.id)
    const answer = activationOf(facts)
    const done = answer.steps.filter((s) => s.done).map((s) => s.step)
    // Ordered: no step done after one that is not.
    const firstOpen = answer.steps.findIndex((s) => !s.done)
    const ordered = firstOpen === -1 || answer.steps.slice(firstOpen).every((s) => !s.done)
    let saleBacked = true
    if (facts.firstSaleAt) {
      const { data: paid } = await db
        .from('orders')
        .select('id, events!inner(organisation_id)')
        .eq('events.organisation_id', org.id)
        .gt('total_cents', 0)
        .not('confirmed_at', 'is', null)
        .limit(1)
      saleBacked = (paid ?? []).length === 1
    }
    if (!ordered || !saleBacked) failed += 1
    const next = answer.next ?? 'activated'
    tally.set(next, (tally.get(next) ?? 0) + 1)
    lines.push(`${ordered && saleBacked ? 'PASS' : 'FAIL'} ${org.id} ${String(org.name).slice(0, 40)} | done ${done.join(',') || 'none'} | next ${next}`)
  } catch (e) {
    failed += 1
    lines.push(`FAIL ${org.id} read refused: ${(e as Error).message}`)
  }
}

const summary = [
  `activation-facts-drive on TEST, ${new Date().toISOString()}, ${orgs.length} organisations, ${failed} failed`,
  `steps: ${ACTIVATION_STEPS.join(' > ')}`,
  `next step counts: ${[...tally].map(([k, v]) => `${k} ${v}`).join(', ')}`,
  '',
  ...lines,
]
writeFileSync(`${OUT}\\facts-drive.txt`, summary.join('\n') + '\n')
console.log(summary.slice(0, 3).join('\n'))
process.exit(failed === 0 ? 0 : 1)
