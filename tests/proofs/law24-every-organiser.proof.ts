/**
 * LAW 24 ON TEST: a brand-new organisation holds six months from its own
 * registration, past any cap, and the platform's own fee functions charge it
 * nothing inside the window and the standard fee after it.
 *
 * PLATFORM-FIX-1 Task 3, 26 September 2026. TEST ONLY (constant ref). It
 * inserts two throwaway organisations, reads what the DATABASE stamped, feeds
 * that stored value to applyFoundingWaiver / isWaiverActive / computeFeeLineCents,
 * then deletes both and observes that they are gone.
 *
 *   powershell -File scripts/ops/with-supabase-token.ps1 npx vitest run --config vitest.proof.config.ts tests/proofs/law24-every-organiser.proof.ts
 */
import { describe, expect, it } from 'vitest'
import { applyFoundingWaiver, isWaiverActive, registrationWaiverUntil } from '@/lib/payments/founding-waiver'
import { computeFeeLineCents } from '@/lib/payments/fee-math'
import { parseLockedValues } from '@/lib/health/pricing-lock.mjs'

const REF = 'vkapkibzokmfaxqogypq'
const token = process.env.SUPABASE_ACCESS_TOKEN

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- rows from the Management API are untyped JSON
async function query(sql: string, readOnly: boolean): Promise<any[]> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql, read_only: readOnly }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 800)}`)
  return JSON.parse(text)
}

async function main() {

  const [{ holders }] = await query(`select count(*)::int as holders from public.organisations where founding_fee_free_until is not null`, true)
  const [{ cap_trigger, stamp_trigger }] = await query(
    `select exists(select 1 from pg_trigger where tgname='trg_founding_waiver_cap' and not tgisinternal) as cap_trigger,
            exists(select 1 from pg_trigger where tgname='trg_registration_fee_free_window' and not tgisinternal) as stamp_trigger`,
    true,
  )
  console.log(`before: ${holders} organisations already hold a window (the old cap refused the 51st); cap trigger installed ${cap_trigger}; registration trigger installed ${stamp_trigger}`)

  const stamp = Date.now()
  const rows = await query(
    `with owner as (select owner_id from public.organisations order by created_at limit 1)
     insert into public.organisations (name, slug, owner_id, founding_fee_free_until)
     select v.name, v.slug, owner.owner_id, null from owner,
       (values ('LAW 24 proof A ${stamp}', 'law24-proof-a-${stamp}'), ('LAW 24 proof B ${stamp}', 'law24-proof-b-${stamp}')) as v(name, slug)
     returning id, created_at, founding_fee_free_until, public.founding_add_months(created_at, 6) as expected`,
    false,
  )
  let ok = rows.length === 2 && !cap_trigger && stamp_trigger
  // The locked fee, read from the PRICING-LOCK block, never typed here.
  const locked = parseLockedValues(process.cwd()) as Record<string, number | string>
  const rates = { platformFeePercent: Number(locked.platform_fee_percentage), platformFeeFixedCents: Number(locked.platform_fee_fixed) }
  for (const r of rows) {
    const stored = new Date(r.founding_fee_free_until).toISOString()
    const sameAsSql = stored === new Date(r.expected).toISOString()
    const sameAsTs = stored === registrationWaiverUntil(new Date(r.created_at).toISOString())
    const inside = new Date(new Date(r.created_at).getTime() + 1000)
    const after = new Date(new Date(stored).getTime() + 1000)
    const feeInside = computeFeeLineCents(2000, 1, applyFoundingWaiver(rates, isWaiverActive(stored, inside))).platform_fee_cents
    const feeAfter = computeFeeLineCents(2000, 1, applyFoundingWaiver(rates, isWaiverActive(stored, after))).platform_fee_cents
    console.log(
      `organisation ${r.id}: registered ${new Date(r.created_at).toISOString()}, window stamped by the database ${stored} ` +
        `(= founding_add_months ${sameAsSql}, = registrationWaiverUntil ${sameAsTs}); fee on a 20.00 ticket inside ${feeInside} cents, after ${feeAfter} cents`,
    )
    ok = ok && sameAsSql && sameAsTs && feeInside === 0 && feeAfter > 0
  }

  const ids = rows.map((r: { id: string }) => `'${r.id}'`).join(',')
  await query(`delete from public.organisations where id in (${ids})`, false)
  const [{ left }] = await query(`select count(*)::int as left from public.organisations where id in (${ids})`, true)
  console.log(`cleanup: ${left} proof organisation(s) remain`)
  console.log(ok && left === 0 ? 'PROVEN: LAW 24 holds on TEST' : 'NOT PROVEN')
  return ok && left === 0 ? 0 : 1
}


describe('LAW 24 on TEST', () => {
  it.skipIf(!process.env.SUPABASE_ACCESS_TOKEN)('a new organisation holds six months from registration and pays no fee inside it', async () => {
    expect(await main()).toBe(0)
  })
})
