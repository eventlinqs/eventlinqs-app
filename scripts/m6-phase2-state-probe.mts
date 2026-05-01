import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

function loadEnvLocal() {
  const file = resolve(process.cwd(), '.env.local')
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq <= 0) continue
    const k = t.slice(0, eq).trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) continue
    let v = t.slice(eq + 1).trim()
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1)
    }
    process.env[k] = v
  }
}
loadEnvLocal()

const ACCOUNT_ID = process.argv[2] ?? 'acct_1TRuXeGbG5Esz13V'
const ORG_ID = process.argv[3] ?? 'cc0e7ba2-f173-41c9-8f15-57bcf0a19ab0'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-03-25.dahlia',
})
try {
  const acct = await stripe.accounts.retrieve(ACCOUNT_ID)
  console.log(
    `STRIPE  ok acct=${acct.id} charges=${acct.charges_enabled} payouts=${acct.payouts_enabled} details=${acct.details_submitted}`
  )
} catch (err) {
  console.log(`STRIPE  FAIL ${(err as Error).message}`)
  process.exit(1)
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)
const { data, error } = await sb
  .from('organisations')
  .select(
    'id, stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled, stripe_onboarding_complete, payout_tier, payout_status'
  )
  .eq('id', ORG_ID)
  .maybeSingle()
if (error || !data) {
  console.log(`SUPABASE FAIL ${error?.message ?? 'org not found'}`)
  process.exit(1)
}
console.log(`SUPABASE ok ${JSON.stringify(data)}`)

const stateFile = resolve('.tmp/m6-e2e-state.json')
if (existsSync(stateFile)) {
  console.log(`STATE   ok ${stateFile}`)
} else {
  console.log(`STATE   MISSING ${stateFile}`)
  process.exit(1)
}
