import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  AUDIENCE_PRICE_BANDS,
  AUDIENCE_RECENCY_BANDS,
  priceBandOf,
  priceBandLabel,
  recencyBandOf,
  recencyBandLabel,
} from '@/lib/audience/segments'
import { recordPlatformDigestDecline } from '@/lib/consent/record'
import { DIGEST_CONSENT_WORDING, DIGEST_CONSENT_WORDING_VERSION } from '@/lib/consent/wording'
import { COMMUNITY_TO_TAGS } from '@/lib/communities/tag-bridge'
import { BROADCAST_FLAGS, BROADCAST_FLAG_DEFAULTS, BROADCAST_FLAG_DECISIONS } from '@/lib/flags/broadcast'
import { fakeConsentAdmin, PLATFORM_TENANT_ROW } from '../../helpers/consent-ledger-fake'

/**
 * GA1. CONSENT CAPTURE AND THE AUDIENCE ASSET.
 *
 * What is tested HERE is what a pure test can actually decide: the derived
 * segmentation, the shape of the writes, and the structural claims that a later
 * edit could quietly break. What a pure test CANNOT decide is whether the
 * database refuses an unconsented row and whether a confirmed order composes
 * one, because both of those are the database's behaviour rather than this
 * code's. Those are proven against the real TEST database by
 * scripts/verify/ga1v3-audience-asset-proof.sql, and driven in a browser by
 * scripts/verify/ga1v3-consent-ledger-drive.mjs.
 */

const ROOT = join(__dirname, '..', '..', '..')
const MIGRATION = join(ROOT, 'supabase', 'migrations', '20260913000030_audience_asset.sql')
const LEDGER_MIGRATION = join(ROOT, 'supabase', 'migrations', '20260913000040_consent_ledger.sql')

/**
 * The definition the DATABASE is running, which is the last one written.
 *
 * GA1 v3 replaced refresh_audience_member so it reads consent from the ledger.
 * A test that went on slicing the first migration would keep passing about a
 * function nothing runs any more, which is the quietest way for a test to stop
 * being evidence.
 */
function latestRefreshAudienceMember(): string {
  const sources = [MIGRATION, LEDGER_MIGRATION].map(p => readFileSync(p, 'utf8'))
  const withFn = sources.filter(s => s.includes('function public.refresh_audience_member'))
  const newest = withFn[withFn.length - 1]!
  const start = newest.lastIndexOf('function public.refresh_audience_member')
  return newest.slice(start)
}

// ─────────────────────────────────────────────────────────────────────────────
describe('GA1: the price band is derived, and it is derived the same way twice', () => {
  it('bands every boundary, on both sides, including the ends', () => {
    expect(priceBandOf(0)).toBe('free')
    expect(priceBandOf(1)).toBe('under-30')
    expect(priceBandOf(2999)).toBe('under-30')
    expect(priceBandOf(3000)).toBe('30-to-59')
    expect(priceBandOf(5999)).toBe('30-to-59')
    expect(priceBandOf(6000)).toBe('60-to-99')
    expect(priceBandOf(9999)).toBe('60-to-99')
    expect(priceBandOf(10000)).toBe('100-to-199')
    expect(priceBandOf(19999)).toBe('100-to-199')
    expect(priceBandOf(20000)).toBe('200-plus')
    expect(priceBandOf(34900)).toBe('200-plus')
  })

  it('answers unknown rather than free when there is no amount to band', () => {
    // 'free' would be a claim about what they paid. 'unknown' is the truth.
    expect(priceBandOf(null)).toBe('unknown')
    expect(priceBandOf(undefined)).toBe('unknown')
    expect(priceBandOf(Number.NaN)).toBe('unknown')
  })

  it('treats a negative amount as free rather than banding it below free', () => {
    expect(priceBandOf(-1)).toBe('free')
  })

  it('the SQL the trigger runs bands identically to the TypeScript', () => {
    const sql = readFileSync(MIGRATION, 'utf8')
    // Each boundary written in TypeScript must be written in the SQL CASE too.
    for (const b of AUDIENCE_PRICE_BANDS) {
      if (b.fromCents <= 1) continue
      expect(sql).toMatch(new RegExp(`when p_unit_cents < ${b.fromCents}\\s+then\\s+'`))
    }
    expect(sql).toContain("when p_unit_cents <= 0     then 'free'")
    expect(sql).toContain("else '200-plus'")
  })

  it('labels every band it defines, and refuses to invent one it does not', () => {
    for (const b of AUDIENCE_PRICE_BANDS) expect(priceBandLabel(b.band)).toBe(b.label)
    expect(priceBandLabel('made-up')).toBe('Not recorded')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('GA1: recency is derived at read time, never stored', () => {
  const now = new Date('2026-09-13T00:00:00.000Z')
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString()

  it('bands at each boundary', () => {
    expect(recencyBandOf(daysAgo(0), now)).toBe('last-30-days')
    expect(recencyBandOf(daysAgo(30), now)).toBe('last-30-days')
    expect(recencyBandOf(daysAgo(31), now)).toBe('last-90-days')
    expect(recencyBandOf(daysAgo(90), now)).toBe('last-90-days')
    expect(recencyBandOf(daysAgo(91), now)).toBe('last-year')
    expect(recencyBandOf(daysAgo(365), now)).toBe('last-year')
    expect(recencyBandOf(daysAgo(366), now)).toBe('over-a-year')
  })

  it('a clock skew is not a reason to call a buyer stale', () => {
    expect(recencyBandOf(new Date(now.getTime() + 86_400_000), now)).toBe('last-30-days')
  })

  it('labels every band it defines', () => {
    for (const b of AUDIENCE_RECENCY_BANDS) expect(recencyBandLabel(b.band)).toBe(b.label)
    expect(recencyBandLabel('made-up')).toBe('Not recorded')
  })

  it('a recency band is never a column on the audience table', () => {
    // Storing it would make it wrong the morning after it was written.
    const sql = readFileSync(MIGRATION, 'utf8')
    const table = sql.slice(sql.indexOf('create table if not exists public.audience_members'))
    expect(table.slice(0, table.indexOf(');'))).not.toContain('recency_band')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('GA1 acceptance 3: the community value is read from the taxonomy, never a literal', () => {
  const audienceSources = [
    'src/lib/audience/segments.ts',
    'src/lib/audience/read.ts',
    'src/app/admin/(authed)/audience/page.tsx',
  ].map(rel => ({ rel, source: readFileSync(join(ROOT, rel), 'utf8') }))

  it('no file that composes or reads the audience names a single community', () => {
    const offenders: string[] = []
    for (const slug of Object.keys(COMMUNITY_TO_TAGS)) {
      for (const { rel, source } of audienceSources) {
        if (source.includes(`'${slug}'`) || source.includes(`"${slug}"`)) {
          offenders.push(`${rel} names the community ${slug}`)
        }
      }
    }
    expect(offenders, offenders.join('; ')).toEqual([])
  })

  it('no audience source carries an array of community-shaped strings at all', () => {
    // The negative control for the assertion above: a pasted list would be
    // caught even if every slug in it were renamed tomorrow.
    for (const { rel, source } of audienceSources) {
      expect(
        /\[\s*'[a-z][a-z-]{4,}'\s*,\s*'[a-z][a-z-]{4,}'\s*,\s*'[a-z][a-z-]{4,}'/.test(source),
        `${rel} carries a pasted list of slug-shaped strings`,
      ).toBe(false)
    }
  })

  it('the trigger resolves community from the database, through community_tag_map', () => {
    /*
     * Read from the NEWEST definition, not the first one. GA1 v3 replaced
     * refresh_audience_member to read consent from the ledger, and a test that
     * kept reading the superseded file would have gone on passing about a
     * function the database no longer runs.
     */
    const fn = latestRefreshAudienceMember()
    expect(fn).toContain('from public.community_tag_map m')
    expect(fn).toContain('jsonb_array_elements_text(ev.tags)')
    // The organiser's own answer wins where they gave one.
    expect(fn).toContain('ev.community_primary')
    // And the function itself names no community.
    for (const slug of Object.keys(COMMUNITY_TO_TAGS)) {
      expect(fn, `refresh_audience_member names ${slug}`).not.toContain(`'${slug}'`)
    }
  })

  it('every community the platform renders is in the map the database resolves through', () => {
    const sql = readFileSync(MIGRATION, 'utf8')
    const seed = sql.slice(sql.indexOf('insert into public.community_tag_map'))
    for (const [slug, tokens] of Object.entries(COMMUNITY_TO_TAGS)) {
      expect(seed, `community_tag_map is missing ${slug}`).toContain(`('${slug}', array[`)
      for (const token of tokens) {
        expect(seed, `community_tag_map is missing the token ${token} for ${slug}`).toContain(`'${token}'`)
      }
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('GA1: the decline is a fact, and it can never revoke a consent', () => {
  /*
   * GA1 v3 MOVED THE WRITE AND KEPT THE RULE. The decline used to be an RPC
   * that inserted into public.marketing_consents only when the address was
   * unknown. It is now an append-only consent event, and the protection cannot
   * live in an "on conflict do nothing" any more, because the ledger's rule is
   * that the LATEST event wins: writing a decline after a grant would silently
   * revoke a consent the person never touched. So the rule is now behaviour,
   * asked of the resolver before anything is written, and it is tested as
   * behaviour rather than as a clause in a statement.
   */
  const ledgerBase = () => ({
    marketing_tenants: [PLATFORM_TENANT_ROW],
    consent_policy: [{ id: true, max_age_months: 24 }],
    consent_events: [] as Record<string, unknown>[],
    suppression_events: [] as Record<string, unknown>[],
  })

  it('records a declined event for an address with no live consent', async () => {
    const admin = fakeConsentAdmin(ledgerBase())
    const ok = await recordPlatformDigestDecline(admin.client, {
      email: '  Buyer@Example.COM ',
      source: 'checkout',
      at: '2026-09-13T00:00:00.000Z',
    })
    expect(ok).toBe(true)
    const written = admin.inserts.filter(i => i.table === 'consent_events')
    expect(written).toHaveLength(1)
    const row = written[0]!.rows[0]!
    expect(row.decision).toBe('declined')
    // Normalised, so a decline and a grant are matched as one person.
    expect(row.subject_email).toBe('buyer@example.com')
    expect(row.capture_surface).toBe('checkout')
  })

  it('stores the wording that was on screen, verbatim, and its version', async () => {
    const admin = fakeConsentAdmin(ledgerBase())
    await recordPlatformDigestDecline(admin.client, { email: 'a@b.com', at: '2026-09-13T00:00:00.000Z' })
    const row = admin.inserts[0]!.rows[0]!
    expect(row.wording).toBe(DIGEST_CONSENT_WORDING)
    expect(row.wording_version).toBe(DIGEST_CONSENT_WORDING_VERSION)
  })

  it('writes NOTHING where a live consent already exists, because a box left alone is not a withdrawal', async () => {
    const tables = ledgerBase()
    tables.consent_events = [
      {
        id: 'granted-earlier',
        tenant_id: PLATFORM_TENANT_ROW.id,
        subject_email: 'returning@example.com',
        purpose: 'platform_local_digest',
        channel_scope: 'email',
        decision: 'granted',
        occurred_at: '2026-09-01T00:00:00.000Z',
        wording_version: 'v1',
      },
    ]
    const admin = fakeConsentAdmin(tables)
    const ok = await recordPlatformDigestDecline(admin.client, {
      email: 'returning@example.com',
      at: '2026-09-13T00:00:00.000Z',
    })
    expect(ok).toBe(false)
    expect(admin.inserts).toHaveLength(0)
  })

  it('records the decline again once that consent has been withdrawn', async () => {
    const tables = ledgerBase()
    tables.consent_events = [
      {
        id: 'withdrawn-already',
        tenant_id: PLATFORM_TENANT_ROW.id,
        subject_email: 'gone@example.com',
        purpose: 'platform_local_digest',
        channel_scope: 'email',
        decision: 'withdrawn',
        occurred_at: '2026-09-02T00:00:00.000Z',
        wording_version: 'v1',
      },
    ]
    const admin = fakeConsentAdmin(tables)
    expect(
      await recordPlatformDigestDecline(admin.client, {
        email: 'gone@example.com',
        at: '2026-09-13T00:00:00.000Z',
      }),
    ).toBe(true)
  })

  it('an unusable address writes nothing at all', async () => {
    const admin = fakeConsentAdmin(ledgerBase())
    expect(await recordPlatformDigestDecline(admin.client, { email: '   ', at: 'x' })).toBe(false)
    expect(admin.inserts).toHaveLength(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('GA1: the checkout records the answer either way, behind one switch', () => {
  const checkout = readFileSync(join(ROOT, 'src', 'app', 'actions', 'checkout.ts'), 'utf8')
  const squad = readFileSync(join(ROOT, 'src', 'app', 'actions', 'squad-checkout.ts'), 'utf8')

  it('a tick grants and an untouched box declines, on the main checkout', () => {
    /*
     * WIDENED BY AQ1, 19 September 2026, and the intent is unchanged.
     *
     * This used to assert the literal `ticked: params.platformConsent`. AQ1's
     * reversal condition moves the question to the ticket page, where the buyer
     * has no address yet, so the answer can arrive from the carrier instead:
     *
     *     ticked: carried ? carried.ticked : params.platformConsent
     *
     * The GA1 rule this test exists for is that the form's answer is what gets
     * recorded WHEN THE FORM IS WHAT ASKED, and that is still asserted, on the
     * same expression. The new branch is asserted beside it rather than in
     * place of it, so neither half can be dropped quietly.
     */
    expect(checkout).toContain('recordCheckoutMarketingAnswer')
    expect(checkout).toContain('params.platformConsent')
    expect(checkout).toMatch(/ticked: carried \? carried\.ticked : params\.platformConsent/)
    expect(checkout).toMatch(/captureSurface: carried \? 'ticket-page' : 'checkout'/)
  })

  it('the squad checkout answers the question through the same one rule', () => {
    // It used to write email_subscribers while showing the digest wording, so a
    // squad buyer was promised a weekly email that could never reach them. Then
    // it was pointed at the right table with its own copy of the rule, and
    // promptly wrote a consent with no city. Both paths call one function now.
    expect(squad).toContain('recordCheckoutMarketingAnswer')
    expect(squad).not.toContain('recordPlatformUpdateConsent')
  })

  it('the squad form calls the recorder even when both boxes are left alone', () => {
    const form = readFileSync(
      join(ROOT, 'src', 'app', 'squad', '[token]', 'pay', '[member_id]', 'squad-pay-form.tsx'),
      'utf8',
    )
    expect(form).not.toMatch(/if \(organiserConsent \|\| platformConsent\) \{/)
    expect(form).toContain('recordSquadMemberMarketingConsent(memberId, organiserConsent, platformConsent')
  })

  it('both checkouts scope the consent to a city, through one shared rule', () => {
    /*
     * The digest selects recipients with .eq('city_slug', citySlug), so a
     * consent row with a null city is in NO send list: the person said yes to
     * "a weekly local digest" and would never hear anything, and would never
     * find out. The rule used to be private to the main checkout, so pointing
     * the squad checkout at the same table reintroduced that defect until both
     * were made to share src/lib/consent/digest-city.ts.
     */
    const shared = readFileSync(join(ROOT, 'src', 'lib', 'consent', 'checkout-answer.ts'), 'utf8')
    expect(shared).toContain("from './digest-city'")
    expect(shared).toContain('resolveDigestCity(admin, params.eventId)')
    /*
     * And the city rides on BOTH writes, the grant and the decline, or a
     * declined address would be unfindable in the city it was asked in.
     *
     * THE SPELLING CHANGED ON 21 SEPTEMBER 2026 AND THE RULE DID NOT. This read
     * `citySlug,`, the shorthand property, until `resolveDigestCity` began
     * returning a resolution rather than a bare slug, so that a city which could
     * not be READ stopped being indistinguishable from a person who named none.
     * Both writes still carry the resolved city and this still counts them.
     */
    expect([...shared.matchAll(/citySlug: city\.city,/g)].length).toBeGreaterThanOrEqual(2)
    for (const [name, source] of [['checkout', checkout], ['squad', squad]] as const) {
      expect(source, `${name} does not pass the event the city is resolved from`).toContain('eventId')
    }
  })

  it('the one shared rule gates the platform question on the one flag', () => {
    const shared = readFileSync(join(ROOT, 'src', 'lib', 'consent', 'checkout-answer.ts'), 'utf8')
    expect(shared).toContain("isFeatureEnabled('audience_capture')")
    // Enforcement is in the shared rule, so neither checkout can forget it and
    // a third purchase path inherits it by calling the same function.
    expect(checkout).not.toContain("isFeatureEnabled('audience_capture')")
    expect(squad).not.toContain("isFeatureEnabled('audience_capture')")
  })

  it('the switch is on the governed flag system, with a dated decision', () => {
    expect(BROADCAST_FLAGS).toContain('audience_capture')
    expect(BROADCAST_FLAG_DEFAULTS.audience_capture).toBe(true)
    expect(BROADCAST_FLAG_DECISIONS.audience_capture).toMatch(/\d{4}-\d{2}-\d{2}/)
    expect(BROADCAST_FLAG_DECISIONS.audience_capture.toLowerCase()).toContain('lawal')
  })

  it('the checkout page and the squad page both resolve the switch on the server', () => {
    for (const rel of [
      'src/app/checkout/[reservation_id]/page.tsx',
      'src/app/squad/[token]/pay/[member_id]/page.tsx',
    ]) {
      const source = readFileSync(join(ROOT, rel), 'utf8')
      expect(source, `${rel} does not resolve the switch`).toContain("isFeatureEnabled('audience_capture')")
      // One prop carries both decisions: the switch and the stored wording.
      // Null means the question is not asked, whichever of the two is missing.
      expect(source, `${rel} does not hand the wording to the form`).toContain('platformWording')
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('GA1 point 7: nothing sends, and nothing can be exported', () => {
  const adminPage = readFileSync(join(ROOT, 'src', 'app', 'admin', '(authed)', 'audience', 'page.tsx'), 'utf8')
  const read = readFileSync(join(ROOT, 'src', 'lib', 'audience', 'read.ts'), 'utf8')

  it('the audience read selects no address, so no surface can list one', () => {
    const selects = [...read.matchAll(/\.select\('([^']*)'\)/g)].map(m => m[1]!)
    expect(selects.length).toBeGreaterThan(0)
    for (const s of selects) {
      expect(s.split(',').map(c => c.trim()), `a select reads an address: ${s}`).not.toContain('email')
    }
  })

  it('the admin surface lists no address and offers no way to take the list away', () => {
    /*
     * GA1 v3 ADDED ONE ADDRESS TO THIS SCREEN, DELIBERATELY, and it is worth
     * saying why the assertion changed rather than quietly loosening it. Point
     * 10 asks for a single subject lookup, because that is the screen a
     * complaint is answered from, and answering one takes the person's own
     * address. What stays banned is the thing that makes a screen a sender: a
     * LIST of addresses, and any way to carry them out of the building. So the
     * lookup is one address, typed by the operator, and it is written to the
     * audit log every time.
     */
    expect(adminPage).toContain('readSubjectHistory')
    expect(adminPage).toContain("action: 'admin.audience.subject_lookup'")
    expect(adminPage).not.toMatch(/\.select\([^)]*email/)
    for (const tell of ['download', 'text/csv', '.csv', 'xlsx', 'data:text', 'Export']) {
      expect(adminPage, `the audience surface offers ${tell}`).not.toContain(tell)
    }
  })

  it('no sender, queue or schedule is created by this item', () => {
    // Both migrations, because GA1 v3 added a second one and a claim that
    // covers only the first would be a claim about half the item.
    for (const path of [MIGRATION, LEDGER_MIGRATION]) {
      const migration = readFileSync(path, 'utf8')
      for (const word of ['pg_cron', 'net.http_post', 'send_', 'pgmq']) {
        expect(migration, `${path} reaches for ${word}`).not.toContain(word)
      }
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('GA1: the withdrawal is recorded with its source, on every path', () => {
  const record = readFileSync(join(ROOT, 'src', 'lib', 'consent', 'record.ts'), 'utf8')

  it('a withdrawal is TWO facts, and one function writes both', () => {
    /*
     * GA1 v3. A withdrawal used to be an UPDATE on the current-state row. It is
     * now a withdrawn consent event (what an auditor reads) plus a suppression
     * event (what the resolver reads), written by one helper, because a
     * withdrawal recorded one way in one place and another way in another is
     * exactly how a suppression goes missing on the path nobody tested.
     */
    const helper = record.slice(record.indexOf('async function writeWithdrawalToLedger'))
    expect(helper).toContain("decision: 'withdrawn'")
    expect(helper).toContain("channel: 'both'")
    expect(helper).toContain("scope: 'all_marketing'")
    // Both, or the pair is not a pair.
    expect(helper).toContain('recordConsentEvent(')
    expect(helper).toContain('recordSuppressionEvent(')
  })

  it('the four sources are distinguishable afterwards', () => {
    /*
     * WAS THREE, IS FOUR, 19 September 2026 (close-out LB-ONECLICK). The RFC
     * 8058 one-click endpoint is a fourth way a withdrawal can arrive, and it
     * is the one a MAILBOX PROVIDER posts on somebody's behalf rather than one
     * the person pressed themselves. A ledger that cannot tell those apart
     * cannot answer which facility people actually use, so it records its own
     * surface.
     *
     * The two token defaults are now written as `captureSurface ?? '...'`,
     * because withdrawDigestByAnyToken takes an optional override. The default
     * is asserted in that exact form deliberately: `toContain("'waitlist-token'")`
     * alone would also pass if the override silently replaced the default for
     * every caller, which is the regression this pins.
     */
    expect(record).toContain("captureSurface: captureSurface ?? 'unsubscribe-token'")
    expect(record).toContain("captureSurface: captureSurface ?? 'waitlist-token'")
    expect(record).toContain("captureSurface: 'preference-centre'")

    const oneClickRoute = readFileSync(
      join(ROOT, 'src', 'app', 'api', 'marketing', 'one-click-unsubscribe', '[token]', 'route.ts'),
      'utf8',
    )
    expect(oneClickRoute).toContain("const CAPTURE_SURFACE = 'one-click-unsubscribe'")
    // And it is actually passed, rather than declared and forgotten.
    expect(oneClickRoute).toContain('CAPTURE_SURFACE)')
  })

  it('one click stops every channel, which is what the wording promises', () => {
    const helper = record.slice(record.indexOf('async function writeWithdrawalToLedger'))
    // 'both' rather than 'email': there is no state in which somebody who
    // stopped email still receives SMS.
    expect(helper).not.toContain("channel: 'email'")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('GA1: the reversal condition is operable, and it is bounded', () => {

  it('the switch is consulted only after a withdrawal has been honoured', () => {
    const fn = latestRefreshAudienceMember()
    const deleteOnNoConsent = fn.indexOf('delete from public.audience_members where email = v_email;')
    const readsTheFlag = fn.indexOf("where ff.flag = 'audience_capture'")
    expect(deleteOnNoConsent).toBeGreaterThan(-1)
    expect(readsTheFlag).toBeGreaterThan(-1)
    // A flag may not keep somebody in a marketing audience they asked to leave.
    expect(deleteOnNoConsent).toBeLessThan(readsTheFlag)
  })

  it('the refresh can never fail the purchase that triggered it', () => {
    const fn = latestRefreshAudienceMember()
    expect(fn).toContain('exception when others then')
    expect(fn).toContain('raise warning')
  })
})
