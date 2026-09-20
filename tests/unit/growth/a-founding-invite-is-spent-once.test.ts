import { describe, expect, test, vi, beforeEach } from 'vitest'
import { resolve } from 'node:path'
import { readRepoFile } from '../../helpers/read-repo-file'

/**
 * A FOUNDING INVITE IS SPENT ONCE, FOR EXACTLY ONE SPOT, AND NEVER ON NOTHING.
 *
 * ---------------------------------------------------------------------------
 * The growth plan names invite-an-organiser as acquisition lever two and calls
 * the acquisition loop the thing Eventbrite actually grew on. Until
 * 20 September 2026 every read in that loop answered a failure as an answer,
 * and two of them cost the invited organiser the thing they were invited to.
 *
 * THE INVITE SPENT ON NOTHING. acceptFoundingInvite marked the code accepted in
 * one round trip and claimed the founding spot in another, and discarded the
 * claim's error:
 *
 *     const { data: spot } = await admin.rpc('claim_founding_spot', { ... })
 *     const spotNumber = typeof spot === 'number' ? spot : null
 *
 * At that line a dropped socket is indistinguishable from the programme being
 * full. So an organiser whose claim blinked was told "All 50 founding spots are
 * taken right now" while their single-use code had been spent milliseconds
 * earlier: no spot, no six-month window, no way to try again, and nothing
 * anywhere recording it.
 *
 * THE ALLOWANCE THAT FAILED OPEN. Five invites per founding organiser, enforced
 * by `(count ?? 0) >= INVITES_PER_FOUNDING_ORGANISER` over a count whose error
 * was never bound. A failed count read as nought issued and minted a sixth.
 *
 * THE FRONT DOOR THAT TURNED PEOPLE AWAY. getInviteByCode discarded its error,
 * so /join/[code] told somebody holding a valid pending code that their
 * invitation "may have already been used, or it has been withdrawn", and told
 * them to go back to the person who invited them for a fresh link.
 *
 * THE COUNT THAT SAID NOBODY. getFoundingReferralSummary was `confirmed ?? 0`,
 * two paragraphs below getFoundingCounts, whose own header explains at length
 * why a failed count must not read as zero.
 *
 * EVERY READ HERE IS TESTED AGAINST A FAKE SERVER rather than a fake reader,
 * because the failures being prevented are properties of the server: it can
 * refuse, and it can answer 200 with a null count. A mock that returns what it
 * was asked for cannot reproduce either.
 *
 * THE DATABASE'S OWN HALF of this item, the transaction and the trigger, cannot
 * be proven here at all and is not claimed to be. It is proven against the live
 * TEST database by scripts/verify/lb-invitewhole-sql-proof.mjs, which injects a
 * fault into the claim and reads the invite back still pending.
 */

const from = vi.fn()
const rpc = vi.fn()
const audit = vi.fn()
const flag = vi.fn(async () => true)

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from, rpc }) }))
vi.mock('@/lib/admin/audit', () => ({ recordAnonAuditEvent: audit }))
vi.mock('@/lib/flags/broadcast', () => ({ isFeatureEnabled: (...a: unknown[]) => flag(...(a as [])) }))

const {
  acceptFoundingInvite,
  createFoundingInvite,
  getFoundingReferralSummary,
  getInviteByCode,
  INVITES_PER_FOUNDING_ORGANISER,
} = await import('@/lib/founding/invites')

type Answer = { data?: unknown; error?: unknown; count?: number | null }

/**
 * A PostgREST builder that answers whatever the test tells it to, at the end of
 * whatever chain the code happens to build. Every filter method returns the
 * builder and the builder itself is thenable, which is how supabase-js behaves
 * and why a read can be awaited at any point in the chain.
 */
function server(answers: Record<string, Answer | Answer[]>) {
  const seen: { table: string; chain: string[] }[] = []
  const pending: Record<string, Answer[]> = {}
  for (const [table, a] of Object.entries(answers)) pending[table] = Array.isArray(a) ? [...a] : [a]

  from.mockImplementation((table: string) => {
    const chain: string[] = []
    seen.push({ table, chain })
    const answer = () => {
      const queue = pending[table] ?? []
      const next = queue.length > 1 ? queue.shift() : queue[0]
      return { data: null, error: null, count: null, ...(next ?? {}) }
    }
    const builder: Record<string, unknown> = {
      then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) =>
        Promise.resolve(answer()).then(ok, bad),
    }
    for (const method of ['select', 'eq', 'in', 'is', 'not', 'order', 'range', 'insert', 'update', 'maybeSingle', 'single']) {
      builder[method] = (...args: unknown[]) => {
        chain.push(args.length ? `${method}(${args.map(a => JSON.stringify(a)).join(',')})` : method)
        return builder
      }
    }
    return builder
  })
  return seen
}

/** The shape accept_founding_invite returns, as PostgREST hands it back. */
const conversion = (row: Record<string, unknown>) => ({
  data: [
    {
      consumed: true,
      spot_number: null,
      referral_recorded: false,
      offer_closed: false,
      already_founding: false,
      ...row,
    },
  ],
  error: null,
})

beforeEach(() => {
  from.mockReset()
  rpc.mockReset()
  audit.mockReset()
  flag.mockReset()
  flag.mockResolvedValue(true)
})

describe('the count of organisers this one brought in', () => {
  test('a failed count raises rather than saying nobody was referred', async () => {
    server({ organisations: { count: null, error: { message: 'connection reset' } } })
    await expect(getFoundingReferralSummary('org-1')).rejects.toThrow(/could not be read/)
  })

  test('a null count with no error raises too, because it was never asked for', async () => {
    server({ organisations: { count: null, error: null } })
    await expect(getFoundingReferralSummary('org-1')).rejects.toThrow(/came back null/)
  })

  test('real counts come back as themselves', async () => {
    server({ organisations: [{ count: 3, error: null }, { count: 2, error: null }] })
    await expect(getFoundingReferralSummary('org-1')).resolves.toEqual({ confirmed: 3, pending: 2 })
  })
})

describe('the warm landing an invited organiser arrives on', () => {
  test('a failed read throws rather than rendering "this invitation is not available"', async () => {
    server({ founding_invites: { data: null, error: { message: 'statement timeout' } } })
    await expect(getInviteByCode('ABCDEF')).rejects.toThrow()
  })

  test('PGRST116 is the one error that means the code is genuinely not there', async () => {
    server({ founding_invites: { data: null, error: { code: 'PGRST116', message: 'no rows' } } })
    await expect(getInviteByCode('ABCDEF')).resolves.toBeNull()
  })

  test('a malformed code is refused without asking the database at all', async () => {
    const seen = server({})
    await expect(getInviteByCode('not a code')).resolves.toBeNull()
    expect(seen).toHaveLength(0)
  })

  test('a real invite comes back with the inviter and the city', async () => {
    server({
      founding_invites: {
        data: { code: 'ABCDEF', inviter_name: 'A promoter', city_slug: 'geelong', status: 'pending' },
        error: null,
      },
    })
    await expect(getInviteByCode('ABCDEF')).resolves.toEqual({
      code: 'ABCDEF',
      inviterName: 'A promoter',
      citySlug: 'geelong',
      status: 'pending',
    })
  })
})

describe('spending the code', () => {
  const input = { code: 'ABCDEF', userId: 'user-1', orgId: 'org-1', cityFromOrg: null }

  test('the consume and the claim are ONE call, and the flag is an input to it', async () => {
    rpc.mockResolvedValue(conversion({ spot_number: 7, referral_recorded: true }))
    server({ organisations: { count: 3, error: null } })

    await acceptFoundingInvite(input)

    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('accept_founding_invite', {
      p_code: 'ABCDEF',
      p_user_id: 'user-1',
      p_org_id: 'org-1',
      p_offer_open: true,
    })
    // The defect this replaced: a second round trip that could fail on its own.
    expect(rpc.mock.calls.map(c => c[0])).not.toContain('claim_founding_spot')
  })

  test('a failed conversion throws and is recorded, rather than reading as a full programme', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'connection reset by peer' } })

    await expect(acceptFoundingInvite(input)).rejects.toThrow(/conversion failed/)

    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'founding.invite.conversion_failed' }),
    )
    const recorded = audit.mock.calls[0][0] as { metadata: Record<string, unknown> }
    expect(recorded.metadata.invite_code).toBe('ABCDEF')
    expect(String(recorded.metadata.note)).toMatch(/still pending/)
  })

  test('an organisation that already held a spot is never told the programme is full', async () => {
    rpc.mockResolvedValue(conversion({ spot_number: null, already_founding: true }))

    const outcome = await acceptFoundingInvite(input)

    expect(outcome.granted).toBe(false)
    expect(outcome.alreadyFounding).toBe(true)
    expect(outcome.alreadyFull).toBe(false)
  })

  test('a closed offer says closed, consumes the code, and is audit-logged', async () => {
    flag.mockResolvedValue(false)
    rpc.mockResolvedValue(conversion({ offer_closed: true, spot_number: null }))

    const outcome = await acceptFoundingInvite(input)

    expect(rpc.mock.calls[0][1]).toMatchObject({ p_offer_open: false })
    expect(outcome).toMatchObject({ consumed: true, offerClosed: true, alreadyFull: false, granted: false })
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'founding.offer.closed_refusal' }),
    )
  })

  test('a code that was already spent reports nothing consumed and nothing refused', async () => {
    rpc.mockResolvedValue(conversion({ consumed: false }))

    const outcome = await acceptFoundingInvite(input)

    expect(outcome).toEqual({
      consumed: false,
      granted: false,
      spotNumber: null,
      referralRecorded: false,
      offerClosed: false,
      alreadyFounding: false,
      alreadyFull: false,
    })
  })

  test('a genuinely full programme is the only thing that reports alreadyFull', async () => {
    rpc.mockResolvedValue(conversion({ spot_number: null, already_founding: false }))

    const outcome = await acceptFoundingInvite(input)

    expect(outcome.alreadyFull).toBe(true)
  })

  test('a granted spot opens the six-month window', async () => {
    rpc.mockResolvedValue(conversion({ spot_number: 12, referral_recorded: true }))
    const seen = server({ organisations: [{ count: 3, error: null }, { data: null, error: null }] })

    const outcome = await acceptFoundingInvite(input)

    expect(outcome).toMatchObject({ consumed: true, granted: true, spotNumber: 12, referralRecorded: true })
    const writes = seen.filter(s => s.chain.some(c => c.startsWith('update')))
    expect(writes).toHaveLength(1)
    expect(writes[0].chain.join(' ')).toMatch(/founding_fee_free_until/)
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'founding.waiver.granted' }))
  })

  test('an unreadable cap is recorded and leaves the database to judge, not silently zero', async () => {
    rpc.mockResolvedValue(conversion({ spot_number: 12 }))
    const seen = server({
      organisations: [{ count: null, error: { message: 'pool exhausted' } }, { data: null, error: null }],
    })

    const outcome = await acceptFoundingInvite(input)

    expect(outcome.granted).toBe(true)
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'founding.waiver.cap_unreadable' }),
    )
    // The grant is still ATTEMPTED: enforce_founding_waiver_cap in the database
    // is the authority, and refusing here would cost an organiser the six
    // months they had just earned for a fault that lasted a second.
    expect(seen.filter(s => s.chain.some(c => c.startsWith('update')))).toHaveLength(1)
  })

  test('a cap that IS readable and IS reached withholds the window and keeps the spot', async () => {
    rpc.mockResolvedValue(conversion({ spot_number: 50 }))
    const seen = server({ organisations: { count: 50, error: null } })

    const outcome = await acceptFoundingInvite(input)

    expect(outcome).toMatchObject({ granted: true, spotNumber: 50 })
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'founding.waiver.cap_reached' }))
    expect(seen.filter(s => s.chain.some(c => c.startsWith('update')))).toHaveLength(0)
  })
})

describe('minting an invite', () => {
  test('the allowance refusal from the database becomes the sentence the screen would have shown', async () => {
    server({
      founding_invites: {
        error: {
          code: '23514',
          message: 'founding invite allowance reached: organisation x has already issued 5 of 5 invites',
        },
      },
    })

    const result = await createFoundingInvite({
      inviterKind: 'organiser',
      inviterOrgId: 'org-1',
      inviterName: 'A promoter',
      citySlug: 'geelong',
      inviteeEmail: null,
    })

    expect(result).toEqual({
      error: `You have used all ${INVITES_PER_FOUNDING_ORGANISER} of your founding invites.`,
    })
  })

  test('the city check violation still names the operator action, not the allowance', async () => {
    server({
      founding_invites: {
        error: { code: '23514', message: 'new row violates check constraint "founding_invites_city_slug_check"' },
      },
    })

    const result = await createFoundingInvite({
      inviterKind: 'organiser',
      inviterOrgId: 'org-1',
      inviterName: 'A promoter',
      citySlug: 'perth',
      inviteeEmail: null,
    })

    expect(String((result as { error: string }).error)).toMatch(/20260823000001/)
  })
})

describe('the rules, where they are written down', () => {
  const root = resolve(__dirname, '..', '..', '..')
  const migration = readRepoFile(
    resolve(root, 'supabase/migrations/20260920000050_a_founding_invite_is_spent_once.sql'),
  )

  test('the migration installs the transaction and the trigger', () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.accept_founding_invite/)
    expect(migration).toMatch(/CREATE TRIGGER trg_founding_invite_allowance/)
    // The fifty stays in one place: the new function calls the cap rather than
    // restating it, so the two cannot drift.
    expect(migration).toMatch(/public\.claim_founding_spot\(p_org_id, v_invite\.city_slug\)/)
  })

  test('the allowance is the same number in the TypeScript and in the database', () => {
    const sql = migration.match(/v_allowance\s+CONSTANT\s+INTEGER\s*:=\s*(\d+)/)
    expect(sql).not.toBeNull()
    expect(Number(sql![1])).toBe(INVITES_PER_FOUNDING_ORGANISER)
  })

  test('the invites screen pages its list on a total order', () => {
    const page = readRepoFile(resolve(root, 'src/app/(dashboard)/dashboard/invites/page.tsx'))
    expect(page).toMatch(/readEveryRow</)
    // created_at is not unique, so it cannot order the paging by itself.
    expect(page).toMatch(/\.order\('created_at'[\s\S]{0,120}\.order\('id'/)
  })

  test('the signup drops the invite cookie only when the code was consumed', () => {
    const actions = readRepoFile(resolve(root, 'src/app/(dashboard)/dashboard/organisation/actions.ts'))
    const guard = actions.indexOf('if (outcome.consumed) {')
    const drop = actions.indexOf('cookies()).delete(FOUNDING_INVITE_COOKIE)')
    expect(guard).toBeGreaterThan(-1)
    expect(drop).toBeGreaterThan(guard)
  })
})
