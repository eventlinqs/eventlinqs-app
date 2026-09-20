/**
 * LB-ARTISTWHOLE, DRIVEN: MORE THAN A THOUSAND TRACKED ROWS BEHIND ONE REAL
 * ARTIST, AND THE TWO PANELS THAT COUNT THEM.
 *
 * ---------------------------------------------------------------------------
 * THE SAME METHOD AS `lb-reachwhole-drive.mjs`, AND FOR THE SAME REASON. The
 * unit tests stub the client, so they prove the module pages. They cannot prove
 * the thing being paged past is real, because the 1,000-row ceiling belongs to
 * the Supabase project and not to the code. So this puts 1,150 rows behind one
 * artist on the real TEST project and reads what their own dashboard says.
 *
 * TWO SURFACES, because `artists.ts` feeds two and they fail differently:
 *
 *   /artist/dashboard                     the artist's own proof of draw, the
 *                                         number they show the next promoter.
 *   /dashboard/events/[id]/lineup         the organiser's per-artist split.
 *                                         Its name lookup falls back to the
 *                                         words "Unknown artist", so a short
 *                                         read there does not hide a row, it
 *                                         mislabels a real performer.
 *
 * WHAT IT LEAVES ON TEST: nothing. The organisation hangs off
 * `lane-b-artistwhole-presents-` and purgeFixtures removes it and everything
 * under it; the artist row, its lineup tag and its share links are deleted by
 * name and then RE-READ to prove the delete worked.
 *
 * Run (dev server on 3100 against TEST):
 *   node --env-file=.env.local scripts/verify/lb-artistwhole-drive.mjs \
 *        --out C:/dev/EVIDENCE/LB-ARTISTWHOLE
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { answerTheCookieBanner } from './lib/cookie-banner.mjs'
import { buildFixture, purgeFixtures } from './lib/refund-proof-fixture.mjs'

const BASE = process.env.LB_BASE_URL ?? 'http://localhost:3100'
const OUT = (() => {
  const i = process.argv.indexOf('--out')
  return i > -1 ? process.argv[i + 1] : 'C:/dev/EVIDENCE/LB-ARTISTWHOLE'
})()
mkdirSync(OUT, { recursive: true })
mkdirSync(join(OUT, 'drive'), { recursive: true })

const SLUG_PREFIX = 'lane-b-artistwhole-presents'
const VIEWPORTS = [
  { label: 'desktop-1440', width: 1440, height: 900 },
  { label: 'tablet-768', width: 768, height: 1024 },
  { label: 'mobile-390', width: 390, height: 844 },
]

const CLICKS = 800
const CONVERSIONS = 350

const lines = []
const results = []
function log(m) {
  const s = `${new Date().toISOString()} ${m}`
  console.log(s)
  lines.push(s)
}
function check(name, ok, detail) {
  results.push({ name, ok, detail })
  log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`)
}

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
)

async function serverCount(table, build) {
  const { count, error } = await build(db.from(table).select('id', { count: 'exact', head: true }))
  if (error) throw new Error(`counting ${table}: ${error.message}`)
  if (count === null) throw new Error(`counting ${table}: no count came back`)
  return count
}

/** Deletes this drive's own rows by name and proves the delete, not the call. */
async function purgeArtistRows(artistSlug, linkIds) {
  if (linkIds.length > 0) {
    await db.from('share_link_events').delete().in('link_id', linkIds)
    await db.from('share_links').delete().in('id', linkIds)
  }
  const { data: mine } = await db.from('artists').select('id').eq('slug', artistSlug)
  for (const a of mine ?? []) {
    await db.from('event_artists').delete().eq('artist_id', a.id)
    await db.from('artists').delete().eq('id', a.id)
  }
}

async function main() {
  log(`base ${BASE}`)
  log(`supabase ${process.env.NEXT_PUBLIC_SUPABASE_URL}`)
  if (!/vkapkibzokmfaxqogypq/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')) {
    throw new Error('refusing to run: this drive writes rows and the target is not TEST')
  }

  const stamp = Date.now().toString(36)
  const artistSlug = `lane-b-artistwhole-${stamp}`
  let linkIds = []

  log('purging any prior lane-b-artistwhole fixture before building')
  await purgeFixtures(db, log, SLUG_PREFIX)

  const ownerEmail = `lane-b-artistwhole+${stamp}@eventlinqs.test`
  const ownerPassword = `${randomUUID()}Aa1`
  const artistEmail = `lane-b-artistwhole-act+${stamp}@eventlinqs.test`
  const artistPassword = `${randomUUID()}Aa1`

  const { ownerId, event } = await buildFixture(db, {
    stamp,
    ownerEmail,
    password: ownerPassword,
    capacity: 20,
    priceCents: 3500,
    log,
    brand: {
      org: 'Lane B Artistwhole Presents',
      orgSlug: SLUG_PREFIX,
      event: 'Lane B Artistwhole Night',
      eventSlug: 'lane-b-artistwhole-night',
      owner: 'Lane B Artistwhole Owner',
    },
  })
  log(`event ${event.id} (${event.slug}), organiser ${ownerId}`)

  try {
    // ------------------------------------------------- the artist and the tag
    const { data: artistUser, error: artistUserError } = await db.auth.admin.createUser({
      email: artistEmail,
      password: artistPassword,
      email_confirm: true,
    })
    if (artistUserError) throw new Error(`making the artist user: ${artistUserError.message}`)

    const artistId = randomUUID()
    const { error: artistError } = await db.from('artists').insert({
      id: artistId,
      slug: artistSlug,
      name: 'Lane B Artistwhole Act',
      owner_user_id: artistUser.user.id,
    })
    if (artistError) throw new Error(`making the artist: ${artistError.message}`)

    const { error: tagError } = await db.from('event_artists').insert({
      event_id: event.id,
      artist_id: artistId,
      status: 'confirmed',
      billing_order: 1,
    })
    if (tagError) throw new Error(`tagging the artist on the event: ${tagError.message}`)
    log(`artist ${artistId} (${artistSlug}) confirmed on the event`)

    // --------------------------------------------- the links and the 1,150 rows
    const links = [
      { id: randomUUID(), code: `lbaw${stamp}a` },
      { id: randomUUID(), code: `lbaw${stamp}b` },
    ]
    linkIds = links.map(l => l.id)
    for (const l of links) {
      const { error } = await db.from('share_links').insert({
        id: l.id,
        event_id: event.id,
        artist_id: artistId,
        channel: 'copy',
        code: l.code,
        created_by: ownerId,
      })
      if (error) throw new Error(`minting an artist link: ${error.message}`)
    }

    const rows = []
    for (let i = 0; i < CLICKS; i += 1) {
      rows.push({
        link_id: links[i % 2].id,
        kind: 'click',
        visitor_hash: `lane-b-artistwhole-${stamp}-c${i}`,
      })
    }
    for (let i = 0; i < CONVERSIONS; i += 1) {
      rows.push({
        link_id: links[i % 2].id,
        kind: 'conversion',
        visitor_hash: `lane-b-artistwhole-${stamp}-v${i}`,
      })
    }
    for (let i = 0; i < rows.length; i += 250) {
      const { error } = await db.from('share_link_events').insert(rows.slice(i, i + 250))
      if (error) throw new Error(`writing tracked events at offset ${i}: ${error.message}`)
    }
    log(`wrote ${rows.length} share_link_events rows on the artist's links`)

    const trueClicks = await serverCount('share_link_events', q =>
      q.in('link_id', linkIds).eq('kind', 'click'),
    )
    const trueConversions = await serverCount('share_link_events', q =>
      q.in('link_id', linkIds).eq('kind', 'conversion'),
    )
    const trueTotal = trueClicks + trueConversions
    log(`database says: ${trueClicks} clicks, ${trueConversions} conversions, ${trueTotal} rows`)

    check(
      'lb-artistwhole.fixture.is-past-the-ceiling',
      trueTotal > 1000,
      `${trueTotal} tracked rows on one artist, ${trueTotal - 1000} past the documented 1,000-row ceiling`,
    )

    // ------------------------------------------------------------- the driving
    const browser = await chromium.launch()
    try {
      const signInAs = async (email, password) => {
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
        const p = await ctx.newPage()
        await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 120000 })
        await answerTheCookieBanner(p)
        await p.getByLabel(/email/i).first().fill(email)
        await p.getByLabel(/password/i).first().fill(password)
        await Promise.all([
          p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 60000 }).catch(() => {}),
          p.getByRole('button', { name: /sign in|log in/i }).first().click(),
        ])
        await p.waitForTimeout(2000)
        const state = await ctx.storageState()
        await ctx.close()
        return state
      }

      const artistState = await signInAs(artistEmail, artistPassword)
      const organiserState = await signInAs(ownerEmail, ownerPassword)
      check(
        'lb-artistwhole.both-accounts-signed-in',
        Boolean(artistState?.cookies?.length) && Boolean(organiserState?.cookies?.length),
        `artist ${artistState?.cookies?.length ?? 0} cookies, organiser ${organiserState?.cookies?.length ?? 0} cookies`,
      )

      for (const vp of VIEWPORTS) {
        // ------------------------------------------- the artist's own dashboard
        const artistCtx = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          storageState: artistState,
        })
        const artistPage = await artistCtx.newPage()
        const artistFailures = []
        artistPage.on('pageerror', e => artistFailures.push(String(e)))

        const dash = await artistPage.goto(`${BASE}/artist/dashboard`, {
          waitUntil: 'domcontentloaded',
          timeout: 180000,
        })
        await artistPage.waitForTimeout(3000)
        await answerTheCookieBanner(artistPage)

        check(
          `lb-artistwhole.${vp.label}.artist-dashboard-answers-200`,
          dash?.status() === 200,
          `HTTP ${dash?.status()} at ${vp.width}x${vp.height}`,
        )

        const readStat = async key => {
          const v = await artistPage
            .locator(`[data-artist-stat="${key}"]`)
            .first()
            .getAttribute('data-artist-value')
            .catch(() => null)
          return v === null ? null : Number(v)
        }
        const shown = { clicks: await readStat('clicks'), conversions: await readStat('conversions') }
        log(`${vp.label} artist dashboard shows ${JSON.stringify(shown)}`)

        check(
          `lb-artistwhole.${vp.label}.clicks-are-every-click`,
          shown.clicks === trueClicks,
          `the artist's own proof of draw says ${shown.clicks}, the database counts ${trueClicks}`,
        )
        check(
          `lb-artistwhole.${vp.label}.conversions-are-every-conversion`,
          shown.conversions === trueConversions,
          `the panel says ${shown.conversions}, the database counts ${trueConversions}`,
        )
        check(
          `lb-artistwhole.${vp.label}.counts-more-than-the-ceiling`,
          (shown.clicks ?? 0) + (shown.conversions ?? 0) === trueTotal,
          `${(shown.clicks ?? 0) + (shown.conversions ?? 0)} of ${trueTotal} rows reached the panel. The old code could not exceed 1,000.`,
        )
        check(
          `lb-artistwhole.${vp.label}.artist-dashboard-no-client-exception`,
          artistFailures.length === 0,
          artistFailures.length === 0 ? 'clean' : artistFailures.join(' | '),
        )
        await artistPage.screenshot({
          path: join(OUT, 'drive', `artist-dashboard-${vp.label}.png`),
          fullPage: true,
        })
        await artistCtx.close()

        // ------------------------------------ the organiser's lineup attribution
        const orgCtx = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          storageState: organiserState,
        })
        const orgPage = await orgCtx.newPage()
        const orgFailures = []
        orgPage.on('pageerror', e => orgFailures.push(String(e)))

        const lineup = await orgPage.goto(`${BASE}/dashboard/events/${event.id}/lineup`, {
          waitUntil: 'domcontentloaded',
          timeout: 180000,
        })
        await orgPage.waitForTimeout(3000)
        await answerTheCookieBanner(orgPage)
        const lineupBody = await orgPage.locator('body').innerText()

        check(
          `lb-artistwhole.${vp.label}.lineup-answers-200`,
          lineup?.status() === 200 && orgFailures.length === 0,
          `HTTP ${lineup?.status()}, ${orgFailures.length} client error(s)`,
        )
        check(
          `lb-artistwhole.${vp.label}.names-the-real-artist`,
          lineupBody.includes('Lane B Artistwhole Act'),
          'the organiser lineup panel names the performer',
        )
        check(
          `lb-artistwhole.${vp.label}.never-says-unknown-artist`,
          !lineupBody.includes('Unknown artist'),
          'a short read of the names would render the words "Unknown artist" beside a real click count',
        )
        await orgPage.screenshot({
          path: join(OUT, 'drive', `lineup-${vp.label}.png`),
          fullPage: true,
        })
        await orgCtx.close()
      }
    } finally {
      await browser.close()
    }
  } finally {
    log('purging')
    await purgeArtistRows(artistSlug, linkIds)
    await purgeFixtures(db, log, SLUG_PREFIX)
  }

  const leftoverArtists = await serverCount('artists', q => q.eq('slug', artistSlug))
  const leftoverOrgs = await serverCount('organisations', q => q.like('slug', `${SLUG_PREFIX}-%`))
  const leftoverRows =
    linkIds.length > 0 ? await serverCount('share_link_events', q => q.in('link_id', linkIds)) : 0
  check(
    'lb-artistwhole.teardown.nothing-is-left-on-test',
    leftoverArtists === 0 && leftoverOrgs === 0 && leftoverRows === 0,
    `${leftoverArtists} artist(s), ${leftoverOrgs} organisation(s), ${leftoverRows} tracked row(s) remain, re-read after the purge`,
  )

  const failed = results.filter(r => !r.ok)
  lines.push('')
  lines.push(`=== ${results.length - failed.length}/${results.length} checks passed ===`)
  writeFileSync(join(OUT, 'lb-artistwhole-drive.txt'), lines.join('\n'), 'utf8')
  console.log(`\n=== ${results.length - failed.length}/${results.length} checks passed ===`)
  if (failed.length > 0) {
    for (const f of failed) console.error(`  FAILED: ${f.name} :: ${f.detail}`)
    process.exit(1)
  }
}

main().catch(async err => {
  log(`FATAL ${err.stack ?? err}`)
  try {
    await purgeFixtures(db, log, SLUG_PREFIX)
  } catch (e) {
    log(`teardown after failure also failed: ${e.message}`)
  }
  writeFileSync(join(OUT, 'lb-artistwhole-drive.txt'), lines.join('\n'), 'utf8')
  process.exit(1)
})
