/**
 * Performer marketplace evidence battery (TEST only, guarded). Runs against
 * staging with gig_board + artist_showcase temporarily ON, restores both to
 * OFF at the end (the launch state). Stages:
 *   setup    - flags ON, fixture event, performer showcase data, passwords
 *   showcase - performer edits their showcase through the REAL editor
 *              (embeds allowlist proof: a bad URL is rejected, good ones save)
 *   post     - organiser posts the gig through the REAL form (event linked)
 *   apply    - both performers apply through the REAL panel
 *   review   - organiser compares applicants side by side, shortlists, sends
 *              a structured booking request
 *   accept   - performer accepts; lands on the event lineup automatically
 *   sale     - a guest buys through the booked performer's tracked link;
 *              attribution shows in BOTH dashboards
 *   directory- city/type filters, availability toggle, consent toggle
 *   abuse    - application rate limit trips; a pair block refuses contact;
 *              a report lands in the moderation queue
 *   notify   - notification rows per type; opt-out provably excludes
 *   mobile   - 390x844 captures of the key surfaces
 *   restore  - flags OFF, prefs restored, block removed
 * Writes screenshots + gate.json to docs/marketplace/evidence/2026-07-11/.
 *
 * Usage: node scripts/verify/marketplace-gate.mjs <baseUrl>
 */
import fs from 'node:fs'
import { chromium, devices } from 'playwright'

const BASE = process.argv[2]
if (!BASE) throw new Error('usage: node scripts/verify/marketplace-gate.mjs <baseUrl>')
const OUT = 'docs/marketplace/evidence/2026-07-11'
fs.mkdirSync(OUT, { recursive: true })

const PROD_REF = 'gndnldyfudbytbboxesk'
const env = {}
for (const line of fs.readFileSync('.env.test', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
}
const URL_ = (env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '')
const SVC = env.SUPABASE_SERVICE_ROLE_KEY
if (URL_.includes(PROD_REF)) throw new Error('SAFETY STOP: prod')
if (!URL_.includes('vkapkibzokmfaxqogypq')) throw new Error('SAFETY STOP: not TEST')
const svcH = { apikey: SVC, authorization: `Bearer ${SVC}`, 'content-type': 'application/json' }

const ORGANISER = { id: 'd11f5c1d-d18f-429f-a58c-67caafc29d1b', email: 'broadcast.gate.organiser@eventlinqs.com' }
const PERF_ONE = { id: '0b3e58a0-46d8-42e8-8276-1dd8d6ab3849', email: 'broadcast.gate.buyer.one@eventlinqs.com' } // owns Sienna after setup
const PERF_TWO = { id: '2ba9c4de-be40-4e94-8efb-51033c83942f', email: 'broadcast.gate.buyer.two@eventlinqs.com' } // owns Marlo
const GATE_PASSWORD = 'ArtistGate2026!Drive'
const ORG_ID = 'e875fa77-1e8a-46fe-8f9d-e82e58b5864b'
const SIENNA = { id: 'af36e0f7-2b8f-4d49-a786-9da4ccd81b51', slug: 'sienna-vale-x8ge95', name: 'Sienna Vale' }
const MARLO = { id: '907bf08a-d3de-4255-b0b6-2596c360f6b6', slug: 'marlo-reyes-lojdor', name: 'Marlo Reyes' }
const MAILINATOR = 'mkt-performer-2607@mailinator.com'
const GATE_EVENT_ID = '7c2e5b1d-4f8a-4e6b-9d3c-8a1b2c3d4e5f'
const GATE_EVENT_SLUG = 'marketplace-gate-night-geelong'
const GATE_TIER_ID = '9e1f2a3b-4c5d-4e6f-8a9b-0c1d2e3f4a5b'

const STAGES = new Set(
  (process.env.STAGES ?? 'setup,showcase,post,apply,review,accept,sale,directory,abuse,notify,mobile,restore').split(','),
)
const proofs = { base: BASE, startedAt: new Date().toISOString(), stages: [...STAGES] }
try {
  Object.assign(proofs, JSON.parse(fs.readFileSync(`${OUT}/gate.json`, 'utf8')), { stages: [...STAGES] })
} catch {}

async function q(path) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, { headers: svcH })
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${await res.text()}`)
  return res.json()
}
async function patch(path, body) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: { ...svcH, prefer: 'return=representation' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`PATCH ${path} -> ${res.status}: ${await res.text()}`)
  return res.json()
}
async function insert(table, row, conflict) {
  const res = await fetch(`${URL_}/rest/v1/${table}${conflict ? `?on_conflict=${conflict}` : ''}`, {
    method: 'POST',
    headers: { ...svcH, prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(row),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(`${table} insert: ${JSON.stringify(body).slice(0, 300)}`)
  return Array.isArray(body) ? body[0] : body
}
async function del(path) {
  await fetch(`${URL_}/rest/v1/${path}`, { method: 'DELETE', headers: { ...svcH, prefer: 'return=minimal' } })
}
async function setFlag(flag, enabled) {
  await patch(`feature_flags?flag=eq.${flag}`, { enabled, updated_at: new Date().toISOString() })
  console.log(`[gate] flag ${flag} -> ${enabled}`)
}
async function shot(page, name) {
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })
  console.log(`[gate] shot ${name}`)
}
/** Persist after every stage so a mid-run fault never loses evidence. */
function save() {
  fs.writeFileSync(`${OUT}/gate.json`, JSON.stringify(proofs, null, 2))
}

const browser = await chromium.launch()
const DESKTOP = { viewport: { width: 1440, height: 900 } }
const MOBILE = { ...devices['iPhone 13'] }

async function login(email, opts = DESKTOP) {
  const ctx = await browser.newContext(opts)
  const page = await ctx.newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'load', timeout: 90000 })
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', GATE_PASSWORD)
  await Promise.all([
    page.waitForURL(u => !String(u).includes('/login'), { timeout: 60000 }),
    page.click('button[type="submit"]'),
  ])
  await page.close()
  console.log(`[gate] login ok ${email}`)
  return ctx
}

// ----”€----”€ setup ----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€
if (STAGES.has('setup')) {
  await setFlag('gig_board', true)
  await setFlag('artist_showcase', true)

  // Sienna needs an owner so performer one can apply as her.
  await patch(`artists?id=eq.${SIENNA.id}`, { owner_user_id: PERF_ONE.id })

  // Route performer two's notification email to a readable inbox; remember
  // the original for restore.
  const before = await q(`profiles?id=eq.${PERF_TWO.id}&select=email`)
  proofs.setupOriginalEmail = before[0]?.email ?? PERF_TWO.email
  await patch(`profiles?id=eq.${PERF_TWO.id}`, { email: MAILINATOR })

  // Sienna's showcase via service (performer two's goes through the REAL
  // editor in the showcase stage): comedian, Geelong, available, no consent.
  await patch(`artists?id=eq.${SIENNA.id}`, {
    performance_types: ['comedian', 'mc'],
    city_slug: 'geelong',
    available_for_booking: true,
    draw_consent: false,
    mentor_open: false,
  })

  // The gig's linked event: a fresh free published event owned by the org,
  // so the acceptance lineup-add and the sale attribution are clean rows.
  const cover = (await q(`events?id=eq.3f6a1c2e-9d4b-4b7a-8e5f-2c1d0a9b8e71&select=cover_image_url,category_id`))[0]
  await insert(
    'events',
    {
      id: GATE_EVENT_ID,
      title: 'Marketplace Gate Night, Geelong',
      slug: GATE_EVENT_SLUG,
      summary: 'The performer marketplace gate event: the gig this board fills.',
      description: 'Synthetic marketplace verification event. The booked performer lands on this lineup and sells through their tracked link.',
      organisation_id: ORG_ID,
      created_by: ORGANISER.id,
      category_id: cover?.category_id ?? null,
      start_date: '2026-08-21T09:30:00Z',
      end_date: '2026-08-21T12:00:00Z',
      timezone: 'Australia/Melbourne',
      event_type: 'in_person',
      venue_name: 'Waterfront Pavilion',
      venue_city: 'Geelong',
      venue_state: 'VIC',
      venue_country: 'Australia',
      city_primary: 'geelong',
      cover_image_url: cover?.cover_image_url ?? null,
      thumbnail_url: cover?.cover_image_url ?? null,
      status: 'published',
      visibility: 'public',
      published_at: '2026-07-11T00:00:00Z',
      is_age_restricted: false,
      max_capacity: 80,
      tags: ['marketplace-gate'],
      fee_pass_type: 'pass_to_buyer',
      is_free: true,
      is_seed_data: true,
    },
    'id',
  )
  await insert(
    'ticket_tiers',
    {
      id: GATE_TIER_ID,
      event_id: GATE_EVENT_ID,
      name: 'Gate Pass',
      description: 'Free entry',
      tier_type: 'general_admission',
      price: 0,
      currency: 'AUD',
      total_capacity: 80,
      sold_count: 0,
      reserved_count: 0,
      min_per_order: 1,
      max_per_order: 6,
      sort_order: 0,
      is_visible: true,
      is_active: true,
      dynamic_pricing_enabled: false,
      requires_access_code: false,
    },
    'id',
  )
  proofs.setup = { eventId: GATE_EVENT_ID, slug: GATE_EVENT_SLUG }
  console.log('[gate] setup done')
}

// ----”€----”€ showcase: the REAL editor, allowlist proof included ----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€
if (STAGES.has('showcase')) {
  const ctx = await login(PERF_TWO.email)
  const page = await ctx.newPage()
  await page.goto(`${BASE}/artist/dashboard`, { waitUntil: 'load', timeout: 90000 })
  await page.waitForSelector('text=Your showcase', { timeout: 30000 })

  // First: a NON-allowlisted URL must be rejected, naming itself.
  await page.getByLabel(/Showcase videos/).fill('https://evil.example.com/video/1')
  await page.getByRole('button', { name: 'Save showcase' }).click()
  await page.waitForSelector('text=/could not use/i', { timeout: 30000 })
  await shot(page, 'showcase-bad-embed-rejected')

  // Then the real profile: comedian, Geelong, available, consent ON,
  // mentoring ON, one allowlisted embed.
  await page.getByLabel('Bio').fill('Geelong comedian and MC. A regular on the western Victorian club circuit, bringing sharp crowd work to rooms of every size.')
  const comedianChip = page.getByRole('button', { name: 'Comedian', exact: true })
  if ((await comedianChip.getAttribute('aria-pressed')) !== 'true') await comedianChip.click()
  await page.getByLabel('Genres (comma separated)').fill('Stand-up, crowd work')
  await page.getByLabel('Home city').selectOption('geelong')
  await page.getByLabel(/Pay expectation/).fill('From $200 a set')
  await page.getByLabel(/Showcase videos/).fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  for (const label of [/Open to bookings/, /Show my draw numbers/, /Open to mentoring/]) {
    const box = page.getByRole('checkbox').filter({ has: page.locator('xpath=.') }).first()
    void box
    const row = page.locator('label', { hasText: label }).locator('input[type="checkbox"]')
    if (!(await row.isChecked())) await row.check()
  }
  await page.getByRole('button', { name: 'Save showcase' }).click()
  await page.waitForSelector('text=Profile saved.', { timeout: 30000 })
  await shot(page, 'showcase-editor-saved')

  const row = (await q(`artists?id=eq.${MARLO.id}&select=performance_types,city_slug,available_for_booking,draw_consent,mentor_open,showcase_embeds`))[0]
  proofs.showcase = {
    saved: row,
    badEmbedRejected: true,
    goodEmbedStored: Array.isArray(row.showcase_embeds) && row.showcase_embeds.length === 1,
  }
  console.log('[gate] showcase', JSON.stringify(proofs.showcase.saved))
  await ctx.close()
}

// ----”€----”€ post: the organiser posts the gig through the real form ----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€
if (STAGES.has('post')) {
  const ctx = await login(ORGANISER.email)
  const page = await ctx.newPage()
  await page.goto(`${BASE}/dashboard/gigs`, { waitUntil: 'load', timeout: 90000 })
  await page.waitForSelector('text=Post a gig', { timeout: 30000 })

  await page.getByLabel('Gig title').fill('Opening comedy set: Marketplace Gate Night')
  await page.getByLabel('Performance type').selectOption('comedian')
  await page.getByLabel('City', { exact: true }).selectOption('geelong')
  await page.getByLabel(/Venue \(optional\)/).fill('Waterfront Pavilion')
  await page.getByLabel('Performance date and time').fill('2026-08-21T19:30')
  await page.getByLabel('Applications close').fill('2026-08-14T23:59')
  await page.getByLabel('Pay', { exact: true }).selectOption('fixed_fee')
  await page.getByLabel('Fee (AUD)').fill('250')
  await page.getByLabel('Description').fill('Twenty minute opening set for a packed free room. Sharp crowd work wanted; the room is yours to warm up.')
  await page.getByLabel(/Link an event/).selectOption(GATE_EVENT_ID)
  await shot(page, 'post-gig-form-filled')
  await page.getByRole('button', { name: 'Post gig' }).click()
  await page.waitForSelector('text=Gig posted.', { timeout: 45000 })
  await shot(page, 'post-gig-posted')
  await ctx.close()

  const gig = (await q(`gigs?organisation_id=eq.${ORG_ID}&order=created_at.desc&limit=1&select=id,title,status,event_id,city_slug,performance_type`))[0]
  proofs.post = { gig }
  console.log('[gate] posted gig', gig.id)

  // The board shows it publicly.
  const pub = await browser.newContext(DESKTOP)
  const boardPage = await pub.newPage()
  await boardPage.goto(`${BASE}/gigs?city=geelong&type=comedian`, { waitUntil: 'load', timeout: 90000 })
  await boardPage.waitForSelector('text=Opening comedy set', { timeout: 30000 })
  await shot(boardPage, 'gig-board-desktop')
  await pub.close()
}

save()
const GIG_ID = process.env.GIG_ID ?? proofs.post?.gig?.id
if (!GIG_ID) throw new Error('no gig id; run the post stage or pass GIG_ID')
if (!proofs.post?.gig?.id) {
  const gig = (await q(`gigs?id=eq.${GIG_ID}&select=id,title,status,event_id,city_slug,performance_type`))[0]
  proofs.post = { gig }
}

// ----”€----”€ apply: both performers, through the real panel ----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€
if (STAGES.has('apply')) {
  for (const [perf, artist, label] of [
    [PERF_ONE, SIENNA, 'sienna'],
    [PERF_TWO, MARLO, 'marlo'],
  ]) {
    const ctx = await login(perf.email)
    const page = await ctx.newPage()
    await page.goto(`${BASE}/gigs/${GIG_ID}`, { waitUntil: 'load', timeout: 90000 })
    await page.waitForSelector('text=Apply for this gig', { timeout: 30000 })
    if (label === 'sienna') await shot(page, 'apply-panel-shows-what-travels')
    const alreadyApplied = await page.locator('text=You applied to this gig').count()
    if (!alreadyApplied) {
      await page.getByLabel('Your pitch').fill(`${artist.name} here. Twenty tight minutes, this room is my home crowd.`)
      await page.getByRole('button', { name: 'Apply with my profile' }).click()
      // Success either shows the transient confirmation or re-renders the
      // panel into the applied state; accept both.
      await page.waitForSelector('text=/Application sent|You applied to this gig/', { timeout: 45000 })
    }
    await shot(page, `apply-sent-${label}`)
    await ctx.close()
  }
  const apps = await q(`gig_applications?gig_id=eq.${GIG_ID}&select=id,artist_id,status`)
  proofs.apply = { applications: apps, bothApplied: apps.length === 2 }
  console.log('[gate] applications', JSON.stringify(apps))
  save()
}

// ----”€----”€ review: side-by-side compare, shortlist, booking request ----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€
if (STAGES.has('review')) {
  const ctx = await login(ORGANISER.email)
  const page = await ctx.newPage()
  await page.goto(`${BASE}/dashboard/gigs/${GIG_ID}`, { waitUntil: 'load', timeout: 90000 })
  await page.waitForSelector('text=Tickets driven', { timeout: 30000 })
  await shot(page, 'review-applicants-side-by-side')

  // Shortlist Marlo, then send the structured booking request.
  const marloCard = page.locator('li', { hasText: MARLO.name })
  await marloCard.getByRole('button', { name: 'Shortlist' }).click()
  await page.waitForSelector('text=Shortlisted.', { timeout: 30000 })
  await marloCard.getByRole('button', { name: 'Send booking request' }).click()
  await marloCard.locator('select[aria-label="Pay terms"]').selectOption('fixed_fee')
  await marloCard.locator('input[aria-label="Fee in dollars"]').fill('250')
  await marloCard.locator('textarea[aria-label="Note to the performer"]').fill('Doors 7pm, you are on 7.30 for 20 minutes. Fee on the night.')
  await shot(page, 'review-booking-request-form')
  await marloCard.getByRole('button', { name: 'Send request' }).click()
  await page.waitForSelector(`text=Booking request sent to ${MARLO.name}`, { timeout: 45000 })
  await shot(page, 'review-booking-request-sent')
  await ctx.close()

  const req = (await q(`booking_requests?gig_id=eq.${GIG_ID}&select=id,status,event_id,artist_id&order=created_at.desc&limit=1`))[0]
  proofs.review = { request: req }
  console.log('[gate] booking request', JSON.stringify(req))
  save()
}

// ----”€----”€ accept: the performer accepts; one-tap lineup landing ----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€
if (STAGES.has('accept')) {
  const ctx = await login(PERF_TWO.email)
  const page = await ctx.newPage()
  await page.goto(`${BASE}/artist/dashboard`, { waitUntil: 'load', timeout: 90000 })
  await page.waitForSelector('text=Booking request', { timeout: 30000 })
  await shot(page, 'accept-request-visible')
  await page.getByRole('button', { name: 'Accept', exact: true }).first().click()
  await page.waitForTimeout(3000)
  await shot(page, 'accept-accepted')
  await ctx.close()

  const [req, lineup, app] = await Promise.all([
    q(`booking_requests?gig_id=eq.${GIG_ID}&select=id,status&order=created_at.desc&limit=1`),
    q(`event_artists?event_id=eq.${GATE_EVENT_ID}&artist_id=eq.${MARLO.id}&select=id,status`),
    q(`gig_applications?gig_id=eq.${GIG_ID}&artist_id=eq.${MARLO.id}&select=status`),
  ])
  proofs.accept = {
    requestStatus: req[0]?.status,
    onLineup: lineup.length === 1 && lineup[0].status === 'confirmed',
    applicationStatus: app[0]?.status,
  }
  console.log('[gate] accept', JSON.stringify(proofs.accept))
  save()
}

// ----”€----”€ sale: a guest buys through the booked performer's link ----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€
if (STAGES.has('sale')) {
  // Render the organiser lineup page: it mints the artist's tracked link.
  const ctx = await login(ORGANISER.email)
  const page = await ctx.newPage()
  await page.goto(`${BASE}/dashboard/events/${GATE_EVENT_ID}/lineup`, { waitUntil: 'load', timeout: 90000 })
  await page.waitForSelector(`text=${MARLO.name}`, { timeout: 30000 })
  await ctx.close()

  const link = (await q(`share_links?event_id=eq.${GATE_EVENT_ID}&artist_id=eq.${MARLO.id}&select=id,code&limit=1`))[0]
  if (!link) throw new Error('artist link not minted for the gate event')

  const guest = await browser.newContext(DESKTOP)
  const buyPage = await guest.newPage()
  await buyPage.goto(`${BASE}/s/${link.code}`, { waitUntil: 'load', timeout: 90000 })
  await buyPage.waitForURL(new RegExp(`/events/${GATE_EVENT_SLUG}$`), { timeout: 45000 })
  await buyPage.locator('button[aria-label^="Increase"]').first().click()
  await buyPage.getByRole('button', { name: /Checkout|Register/ }).click()
  await buyPage.waitForURL(/\/checkout\//, { timeout: 60000 })
  await buyPage.waitForTimeout(2000)
  const nameInput = buyPage.getByPlaceholder('Jane Smith')
  if (await nameInput.count()) await nameInput.fill('Gate Sale Guest')
  const emailInput = buyPage.getByPlaceholder('you@example.com').first()
  if (await emailInput.count()) await emailInput.fill('mkt-sale-guest@mailinator.com')
  const useMine = buyPage.getByText('Use my details for all tickets')
  if (await useMine.count()) await useMine.click()
  else {
    const first = buyPage.getByLabel('First name').first()
    if (await first.count()) {
      await first.fill('Gate')
      await buyPage.getByLabel('Last name').first().fill('Guest')
      const ae = buyPage.getByLabel('Email').last()
      if (await ae.count()) await ae.fill('mkt-sale-guest@mailinator.com')
    }
  }
  await buyPage.getByRole('button', { name: 'Register for free' }).click()
  await buyPage.waitForURL(/confirmation/, { timeout: 60000, waitUntil: 'commit' })
  await buyPage.waitForTimeout(3000)
  await shot(buyPage, 'sale-confirmation-via-artist-link')
  await guest.close()

  const conv = await q(`share_link_events?link_id=eq.${link.id}&kind=eq.conversion&select=order_id`)
  proofs.sale = { linkCode: link.code, conversions: conv, attributed: conv.length === 1 }
  console.log('[gate] sale conversions', JSON.stringify(conv))

  save()
  // Both dashboards show it.
  const orgCtx = await login(ORGANISER.email)
  const orgPage = await orgCtx.newPage()
  await orgPage.goto(`${BASE}/dashboard/events/${GATE_EVENT_ID}/lineup`, { waitUntil: 'load', timeout: 90000 })
  await orgPage.waitForSelector('text=Who filled the room', { timeout: 30000 })
  await shot(orgPage, 'sale-organiser-who-filled-the-room')
  await orgCtx.close()

  const artistCtx = await login(PERF_TWO.email)
  const artistPage = await artistCtx.newPage()
  await artistPage.goto(`${BASE}/artist/dashboard`, { waitUntil: 'load', timeout: 90000 })
  await artistPage.waitForSelector('text=Your draw, show by show', { timeout: 30000 })
  await shot(artistPage, 'sale-artist-dashboard-draw')
  const body = await artistPage.textContent('body')
  proofs.sale.artistDashboardShowsGateEvent = body.includes('Marketplace Gate Night')
  await artistCtx.close()
}

// ----”€----”€ directory ----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€
if (STAGES.has('directory')) {
  const pub = await browser.newContext(DESKTOP)
  const page = await pub.newPage()

  await page.goto(`${BASE}/artists?city=geelong&type=comedian`, { waitUntil: 'load', timeout: 90000 })
  await page.waitForSelector(`text=${MARLO.name}`, { timeout: 30000 })
  const listing = await page.textContent('body')
  proofs.directory = {
    cityTypeFilterShowsBoth: listing.includes(MARLO.name) && listing.includes(SIENNA.name),
    consentBadgeOnlyWithConsent:
      /tickets driven/.test(listing) === true, // Marlo consented; assert Sienna lacks it below
  }
  await shot(page, 'directory-city-type-filter')

  // Consent: Sienna has draw but consent OFF, so no draw badge on her card.
  const siennaCard = await page.locator('li', { hasText: SIENNA.name }).textContent()
  proofs.directory.siennaHasNoDrawBadge = !/tickets driven/.test(siennaCard ?? '')

  // Availability toggle: switch Sienna's availability OFF, she leaves the
  // available-only view.
  await patch(`artists?id=eq.${SIENNA.id}`, { available_for_booking: false })
  await page.goto(`${BASE}/artists?city=geelong&type=comedian&available=1`, { waitUntil: 'load', timeout: 90000 })
  await page.waitForSelector(`text=${MARLO.name}`, { timeout: 30000 })
  const availableOnly = await page.textContent('body')
  proofs.directory.availabilityToggleExcludes = !availableOnly.includes(SIENNA.name)
  await shot(page, 'directory-available-only')
  await patch(`artists?id=eq.${SIENNA.id}`, { available_for_booking: true })

  // The profile renders the allowlisted embed (click-to-play facade).
  await page.goto(`${BASE}/artists/${MARLO.slug}`, { waitUntil: 'load', timeout: 90000 })
  await page.waitForSelector('text=Showcase', { timeout: 30000 })
  await shot(page, 'directory-profile-with-embed-1440')
  const profileHtml = await page.content()
  proofs.directory.embedFacadeRendered = /Watch on YouTube/i.test(profileHtml)
  proofs.directory.proofOfDrawRendered = /Proof of draw/.test(profileHtml)
  await pub.close()
}

// ----”€----”€ abuse rails ----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€
if (STAGES.has('abuse')) {
  // Six spray targets from the verified org (service-inserted; the APPLY
  // limit is under test here, not posting).
  const sprayIds = []
  for (let i = 1; i <= 6; i++) {
    const row = await insert('gigs', {
      organisation_id: ORG_ID,
      created_by: ORGANISER.id,
      title: `Rate limit spray target ${i}`,
      description: 'Abuse-rail fixture gig.',
      city_slug: 'geelong',
      performance_type: 'comedian',
      pay_type: 'negotiable',
      event_date: '2026-09-05T09:00:00Z',
      application_deadline: '2026-08-29T23:59:00Z',
      status: 'open',
    })
    sprayIds.push(row.id)
  }

  // Performer one sprays applications; the fifth in the window is the last
  // allowed (gig-apply: 5 per 10 minutes), the next shows the throttle.
  const ctx = await login(PERF_ONE.email)
  const page = await ctx.newPage()
  let throttled = false
  let successes = 0
  for (const [i, id] of sprayIds.entries()) {
    await page.goto(`${BASE}/gigs/${id}`, { waitUntil: 'load', timeout: 90000 })
    await page.waitForSelector('text=Apply for this gig', { timeout: 30000 })
    await page.getByLabel('Your pitch').fill(`Spray ${i + 1}`)
    await page.getByRole('button', { name: 'Apply with my profile' }).click()
    await page.waitForSelector('[role="status"]', { timeout: 45000 })
    const status = await page.locator('[role="status"]').first().textContent()
    if (/Too many applications/.test(status ?? '')) {
      throttled = true
      await shot(page, 'abuse-rate-limit-tripped')
      break
    }
    successes += 1
  }
  proofs.abuse = { applySuccessesBeforeThrottle: successes, rateLimitTripped: throttled }
  await ctx.close()

  // Pair block: the organiser blocks Marlo; Marlo can no longer apply to
  // this organiser's gigs.
  const orgCtx = await login(ORGANISER.email)
  const orgPage = await orgCtx.newPage()
  await orgPage.goto(`${BASE}/dashboard/gigs/${GIG_ID}`, { waitUntil: 'load', timeout: 90000 })
  const marloCard = orgPage.locator('li', { hasText: MARLO.name })
  orgPage.on('dialog', (d) => d.accept())
  await marloCard.getByRole('button', { name: 'Block' }).click()
  await orgPage.waitForSelector(`text=${MARLO.name} blocked.`, { timeout: 30000 })
  await shot(orgPage, 'abuse-blocked')
  await orgCtx.close()

  const marloCtx = await login(PERF_TWO.email)
  const marloPage = await marloCtx.newPage()
  await marloPage.goto(`${BASE}/gigs/${sprayIds[5]}`, { waitUntil: 'load', timeout: 90000 })
  await marloPage.getByLabel('Your pitch').fill('Should be refused by the pair block.')
  await marloPage.getByRole('button', { name: 'Apply with my profile' }).click()
  await marloPage.waitForSelector('text=You cannot apply to this organiser.', { timeout: 45000 })
  await shot(marloPage, 'abuse-block-refuses-application')
  proofs.abuse.blockRefusesApplication = true

  // Report: performer two reports a spray gig; it lands in the queue.
  await marloPage.goto(`${BASE}/gigs/${sprayIds[0]}`, { waitUntil: 'load', timeout: 90000 })
  await marloPage.getByRole('button', { name: 'Report' }).click()
  await marloPage.getByRole('button', { name: 'Send report' }).click()
  await marloPage.waitForSelector('text=Thanks. Our team will take a look.', { timeout: 30000 })
  await shot(marloPage, 'abuse-report-sent')
  await marloCtx.close()

  const reports = await q(`marketplace_reports?target_id=eq.${sprayIds[0]}&select=id,target_type,reason,status`)
  proofs.abuse.reportQueued = reports.length === 1 && reports[0].status === 'open'
  proofs.abuse.sprayGigIds = sprayIds
  console.log('[gate] abuse', JSON.stringify({ ...proofs.abuse, sprayGigIds: undefined }))
  save()
}

// ----”€----”€ notify: rows per type + opt-out exclusion ----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€
if (STAGES.has('notify')) {
  const types = ['gig_posted', 'gig_application', 'booking_request', 'booking_accepted']
  const rows = {}
  for (const t of types) {
    const r = await q(`notifications?type=eq.${t}&select=id,user_id,channel,sent_at&order=sent_at.desc&limit=5`)
    rows[t] = r.length
  }

  // Mentoring request: performer one asks Marlo (mentor_open ON), which also
  // exercises the structured mentor contact.
  const ctx = await login(PERF_ONE.email)
  const page = await ctx.newPage()
  await page.goto(`${BASE}/artists/${MARLO.slug}`, { waitUntil: 'load', timeout: 90000 })
  await page.getByRole('button', { name: 'Request mentoring' }).click()
  await page.getByLabel('Subject').fill('Crowd work help for a first headline spot')
  await page.getByLabel('Note').fill('Twenty minutes booked next month; would love one session on handling a rowdy front row.')
  await page.getByRole('button', { name: 'Send request' }).click()
  await page.waitForSelector('text=/Sent\\./', { timeout: 45000 })
  await shot(page, 'notify-mentoring-request-sent')
  await ctx.close()
  const mentorRows = await q(`notifications?type=eq.mentoring_request&select=id&limit=5`)
  rows.mentoring_request = mentorRows.length

  // Opt-out provably excludes: performer one turns everything off, then a
  // fresh gig is posted in their city and type; NO new gig_posted row lands
  // for them and no send happens.
  await insert('notification_prefs', { user_id: PERF_ONE.id, push_enabled: false, email_enabled: false }, 'user_id')
  const before = await q(`notifications?user_id=eq.${PERF_ONE.id}&type=eq.gig_posted&select=id`)
  const optOutGig = await insert('gigs', {
    organisation_id: ORG_ID,
    created_by: ORGANISER.id,
    title: 'Opt-out exclusion probe gig',
    description: 'Notification exclusion fixture.',
    city_slug: 'geelong',
    performance_type: 'comedian',
    pay_type: 'negotiable',
    event_date: '2026-09-12T09:00:00Z',
    application_deadline: '2026-09-05T23:59:00Z',
    status: 'open',
  })
  // Drive the notify path exactly as posting does, via the staging origin:
  // easiest deterministic trigger is a REAL post through the UI, but the
  // matcher runs server-side on postGigAction only. Post a real one:
  const orgCtx = await login(ORGANISER.email)
  const orgPage = await orgCtx.newPage()
  await orgPage.goto(`${BASE}/dashboard/gigs`, { waitUntil: 'load', timeout: 90000 })
  await orgPage.getByLabel('Gig title').fill('Opt-out probe: real posted gig')
  await orgPage.getByLabel('Performance type').selectOption('comedian')
  await orgPage.getByLabel('City', { exact: true }).selectOption('geelong')
  await orgPage.getByLabel('Performance date and time').fill('2026-09-12T19:30')
  await orgPage.getByLabel('Applications close').fill('2026-09-05T23:59')
  await orgPage.getByRole('button', { name: 'Post gig' }).click()
  await orgPage.waitForSelector('text=Gig posted.', { timeout: 45000 })
  await orgCtx.close()
  await new Promise((r) => setTimeout(r, 5000))
  const after = await q(`notifications?user_id=eq.${PERF_ONE.id}&type=eq.gig_posted&select=id`)
  proofs.notify = {
    rowsPerType: rows,
    optOutBefore: before.length,
    optOutAfter: after.length,
    optOutExcluded: after.length === before.length,
    optOutProbeGigId: optOutGig.id,
  }
  console.log('[gate] notify', JSON.stringify(proofs.notify))
  save()
}

// ----”€----”€ mobile captures ----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€
if (STAGES.has('mobile')) {
  const ctx = await browser.newContext(MOBILE)
  const page = await ctx.newPage()
  for (const [path, name] of [
    ['/gigs?city=geelong&type=comedian', 'mobile-gig-board-390'],
    [`/gigs/${GIG_ID}`, 'mobile-gig-detail-390'],
    ['/artists?city=geelong', 'mobile-directory-390'],
    [`/artists/${MARLO.slug}`, 'mobile-profile-390'],
  ]) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'load', timeout: 90000 })
    await shot(page, name)
  }
  await ctx.close()
}

// ----”€----”€ restore: launch state ----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€----”€
if (STAGES.has('restore')) {
  await setFlag('gig_board', false)
  await setFlag('artist_showcase', false)
  if (proofs.setupOriginalEmail) {
    await patch(`profiles?id=eq.${PERF_TWO.id}`, { email: proofs.setupOriginalEmail })
  }
  await patch(`notification_prefs?user_id=eq.${PERF_ONE.id}`, { push_enabled: true, email_enabled: true })
  await del(`marketplace_blocks?organisation_id=eq.${ORG_ID}&artist_id=eq.${MARLO.id}`)
  const flags = await q('feature_flags?select=flag,enabled&order=flag')
  proofs.restore = { flags }
  console.log('[gate] restore', JSON.stringify(flags))
  save()
}

await browser.close()
proofs.finishedAt = new Date().toISOString()
fs.writeFileSync(`${OUT}/gate.json`, JSON.stringify(proofs, null, 2))

const pass =
  (proofs.showcase?.badEmbedRejected ?? false) &&
  (proofs.showcase?.goodEmbedStored ?? false) &&
  Boolean(proofs.post?.gig?.id) &&
  (proofs.apply?.bothApplied ?? false) &&
  proofs.review?.request?.status === 'pending' || proofs.accept?.requestStatus === 'accepted'
console.log(
  JSON.stringify(
    {
      showcase: Boolean(proofs.showcase?.goodEmbedStored),
      posted: Boolean(proofs.post?.gig?.id),
      bothApplied: Boolean(proofs.apply?.bothApplied),
      accepted: proofs.accept?.requestStatus === 'accepted',
      onLineup: Boolean(proofs.accept?.onLineup),
      saleAttributed: Boolean(proofs.sale?.attributed),
      directory: proofs.directory,
      abuse: { rateLimit: Boolean(proofs.abuse?.rateLimitTripped), block: Boolean(proofs.abuse?.blockRefusesApplication), report: Boolean(proofs.abuse?.reportQueued) },
      notify: proofs.notify?.rowsPerType,
      optOutExcluded: Boolean(proofs.notify?.optOutExcluded),
    },
    null,
    2,
  ),
)
void pass
