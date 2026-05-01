import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Stripe from 'stripe'

function loadEnvLocal() {
  const file = resolve(process.cwd(), '.env.local')
  if (!existsSync(file)) return
  for (const rawLine of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}
loadEnvLocal()

const ACCOUNT_ID = process.argv[2] ?? 'acct_1TRuXeGbG5Esz13V'
const ORG_ID = process.argv[3] ?? 'cc0e7ba2-f173-41c9-8f15-57bcf0a19ab0'
const APP = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-03-25.dahlia',
})
const link = await stripe.accountLinks.create({
  account: ACCOUNT_ID,
  refresh_url: `${APP}/api/stripe/connect/refresh?org=${ORG_ID}`,
  return_url: `${APP}/api/stripe/connect/return?org=${ORG_ID}`,
  type: 'account_onboarding',
  collection_options: { fields: 'currently_due' },
})
console.log(link.url)
