/**
 * tests/fixtures/auth.ts
 *
 * Playwright auth fixture for the M6 Phase 2 authed dashboard audit.
 * Logs in once as a seeded test organiser via the live login form, saves
 * `storageState` to `.auth/organiser.json`, and exposes helpers that
 * mutate the seeded organisation row through the Supabase service role
 * key so the same browser session can audit /dashboard/payouts in three
 * Stripe Connect states.
 *
 * Test org credentials are deterministic and isolated to a fake email
 * domain (`@phase2.test`). The user is upserted via `auth.admin` so the
 * fixture is idempotent. The org row is matched on `slug =
 * 'phase2-test-org'` so re-runs do not duplicate.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { chromium, type BrowserContext } from 'playwright'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const TEST_ORGANISER_EMAIL = 'phase2-organiser@phase2.test'
export const TEST_ORGANISER_PASSWORD = 'Phase2!Phase2!Phase2!'
export const TEST_ORG_SLUG = 'phase2-test-org'
export const TEST_ORG_NAME = 'Phase 2 Test Org'

export type ConnectStatePreset = 'not_started' | 'in_progress' | 'complete'

export const STORAGE_STATE_PATH = resolve(
  process.cwd(),
  '.auth',
  'organiser.json'
)

function loadEnvLocal() {
  const file = resolve(process.cwd(), '.env.local')
  if (!existsSync(file)) return
  const text = readFileSync(file, 'utf8')
  for (const rawLine of text.split(/\r?\n/)) {
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

export function adminClient(): SupabaseClient {
  loadEnvLocal()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local'
    )
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function ensureTestOrganiser(): Promise<{
  userId: string
  organisationId: string
}> {
  const admin = adminClient()

  // Find or create the auth user. listUsers paginates; query the first
  // page and look for the deterministic email.
  let userId: string | null = null
  const { data: existing, error: listErr } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  })
  if (listErr) throw listErr
  const found = existing.users.find((u) => u.email === TEST_ORGANISER_EMAIL)
  if (found) {
    userId = found.id
    // Reset password each run so credentials are stable.
    await admin.auth.admin.updateUserById(found.id, {
      password: TEST_ORGANISER_PASSWORD,
      email_confirm: true,
    })
  } else {
    const { data: created, error } = await admin.auth.admin.createUser({
      email: TEST_ORGANISER_EMAIL,
      password: TEST_ORGANISER_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: 'Phase 2 Test Organiser' },
    })
    if (error) throw error
    userId = created.user!.id
  }

  // Ensure profile row exists with role=organiser. We rely on the
  // handle_new_user() trigger having seeded a profile row when
  // createUser fired; if not, upsert manually.
  await admin
    .from('profiles')
    .upsert(
      {
        id: userId,
        email: TEST_ORGANISER_EMAIL,
        full_name: 'Phase 2 Test Organiser',
        role: 'organiser',
        is_verified: true,
        onboarding_completed: true,
      },
      { onConflict: 'id' }
    )

  // Find or create the organisation. Match on slug to keep idempotent.
  const { data: orgRow } = await admin
    .from('organisations')
    .select('id')
    .eq('slug', TEST_ORG_SLUG)
    .maybeSingle()

  let organisationId: string
  if (orgRow) {
    organisationId = orgRow.id as string
    await admin
      .from('organisations')
      .update({ owner_id: userId })
      .eq('id', organisationId)
  } else {
    const { data: inserted, error } = await admin
      .from('organisations')
      .insert({
        name: TEST_ORG_NAME,
        slug: TEST_ORG_SLUG,
        owner_id: userId,
        status: 'active',
      })
      .select('id')
      .single()
    if (error) throw error
    organisationId = inserted!.id as string
  }

  return { userId: userId!, organisationId }
}

export async function setConnectState(
  organisationId: string,
  preset: ConnectStatePreset
): Promise<void> {
  const admin = adminClient()
  const updates: Record<string, unknown> = {}
  if (preset === 'not_started') {
    updates.stripe_account_id = null
    updates.stripe_account_country = null
    updates.stripe_onboarding_complete = false
    updates.stripe_charges_enabled = false
    updates.stripe_payouts_enabled = false
    updates.stripe_requirements = {}
  } else if (preset === 'in_progress') {
    updates.stripe_account_id = 'acct_phase2_in_progress'
    updates.stripe_account_country = 'AU'
    updates.stripe_onboarding_complete = false
    updates.stripe_charges_enabled = false
    updates.stripe_payouts_enabled = false
    updates.stripe_requirements = {
      currently_due: [
        'individual.dob.day',
        'individual.dob.month',
        'individual.dob.year',
        'external_account',
        'tos_acceptance.date',
      ],
    }
  } else {
    updates.stripe_account_id = 'acct_phase2_complete'
    updates.stripe_account_country = 'AU'
    updates.stripe_onboarding_complete = true
    updates.stripe_charges_enabled = true
    updates.stripe_payouts_enabled = true
    updates.stripe_requirements = { currently_due: [] }
  }
  const { error } = await admin
    .from('organisations')
    .update(updates)
    .eq('id', organisationId)
  if (error) throw error
}

export async function loginAndSaveStorageState(
  baseUrl = process.env.E2E_BASE_URL || 'http://localhost:3000'
): Promise<string> {
  await ensureTestOrganiser()

  const browser = await chromium.launch()
  let context: BrowserContext | null = null
  try {
    context = await browser.newContext()
    const page = await context.newPage()
    await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[type=email]', TEST_ORGANISER_EMAIL)
    await page.fill('input[type=password]', TEST_ORGANISER_PASSWORD)
    await Promise.all([
      page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 }),
      page.click('button[type=submit]'),
    ])

    await mkdir(dirname(STORAGE_STATE_PATH), { recursive: true })
    const state = await context.storageState()
    await writeFile(STORAGE_STATE_PATH, JSON.stringify(state, null, 2))
    return STORAGE_STATE_PATH
  } finally {
    await context?.close()
    await browser.close()
  }
}
