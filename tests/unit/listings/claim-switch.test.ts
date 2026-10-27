// The claim switch (the project manager's 21:33 of 27 October 2026: "the claim switch stays OFF until the project
// manager writes Lawal's YES here"). Pinned: listing_claims is a governed flag, OFF by default and when the flags table
// cannot be read, with its decision recorded; both claim pages answer not found while it is off, before reading
// anything; both presses refuse while it is off, before anything else.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { BROADCAST_FLAG_DECISIONS, BROADCAST_FLAG_DEFAULTS, isBroadcastFlag } from '@/lib/flags/broadcast'

const ROOT = join(__dirname, '../../..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

describe('the claim switch', () => {
  test('is a governed flag, OFF by default, its decision recorded', () => {
    expect(isBroadcastFlag('listing_claims')).toBe(true)
    expect(BROADCAST_FLAG_DEFAULTS.listing_claims).toBe(false)
    expect(BROADCAST_FLAG_DECISIONS.listing_claims).toMatch(/OFF in production until Lawal approves/)
  })

  test('gates both claim pages first thing, and both presses', () => {
    for (const page of ['src/app/venues/[handle]/claim/page.tsx', 'src/app/events/[slug]/claim/page.tsx']) {
      const body = read(page).split(/export default async function \w+\([^)]*\) \{/)[1] ?? ''
      expect(body.trimStart().startsWith("if (!(await isFeatureEnabled('listing_claims'))) notFound()"), page).toBe(true)
    }
    const actions = read('src/app/actions/listing-claim.ts')
    for (const name of ['startListingClaim', 'checkListingClaim']) {
      const body = actions.split(new RegExp(`export async function ${name}\\([^)]*\\)[^{]*\\{`))[1] ?? ''
      expect(body.trimStart().startsWith("if (!(await isFeatureEnabled('listing_claims'))) return { state: 'refused', reason: CLOSED }"), name).toBe(true)
    }
  })

  test('is written into the database OFF by the claim migration', () => {
    const sql = read('supabase/migrations/20261027150001_listing_claims.sql')
    expect(sql).toMatch(/insert into public\.feature_flags \(flag, enabled, description\)\s+values \(\s+'listing_claims',\s+false,/)
  })
})
