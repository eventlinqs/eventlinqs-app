/**
 * Stage 3 (broadcast_artists) switch-on evidence gate (TEST only, guarded).
 * Re-runs the Broadcast Layer SPEC section 4 gate against staging with the
 * flag ON, through the REAL flows:
 *   1. Organiser tags two artists on a fresh synthetic event via the Lineup UI.
 *   2. A guest buys through artist A's tracked link; a signed-in buyer buys
 *      through artist B's link (free checkout, no payment engine involvement).
 *   3. Attribution splits correctly: DB rows, the organiser's "Who filled the
 *      room" table, and the artist dashboard.
 *   4. The artist share landing carries the "[Artist] live at [Event]" OG
 *      variant and the OG image endpoint renders it.
 *   5. Artist follow works through the real profile button (SPEC 4.5).
 * Writes screenshots + gate JSON to docs/broadcast/evidence/artist-switch-on-2026-07-11/.
 *
 * Usage: node scripts/verify/artist-layer-gate.mjs <baseUrl>
 * STAGES env (default all): setup,tag,buy,dashboards,card,follow
 */
import fs from 'node:fs'
import { chromium, devices } from 'playwright'

const BASE = process.argv[2]
if (!BASE) throw new Error('usage: node scripts/verify/artist-layer-gate.mjs <baseUrl>')
const OUT = 'docs/broadcast/evidence/artist-switch-on-2026-07-11'
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

// Gate fixtures (docs/broadcast/evidence/fixtures.json lineage).
const ORGANISER = { id: 'd11f5c1d-d18f-429f-a58c-67caafc29d1b', email: 'broadcast.gate.organiser@eventlinqs.com' }
const BUYER_ONE = { id: '0b3e58a0-46d8-42e8-8276-1dd8d6ab3849', email: 'broadcast.gate.buyer.one@eventlinqs.com' }
const BUYER_TWO = { id: '2ba9c4de-be40-4e94-8efb-51033c83942f', email: 'broadcast.gate.buyer.two@eventlinqs.com' }
const GATE_PASSWORD = 'ArtistGate2026!Drive'
const ORG_ID = 'e875fa77-1e8a-46fe-8f9d-e82e58b5864b'
const ARTIST_A = { id: 'af36e0f7-2b8f-4d49-a786-9da4ccd81b51', name: 'Sienna Vale', slug: 'sienna-vale-x8ge95' }
const ARTIST_B = { id: '907bf08a-d3de-4255-b0b6-2596c360f6b6', name: 'Marlo Reyes', slug: 'marlo-reyes-lojdor' }
const EVENT_ID = '3f6a1c2e-9d4b-4b7a-8e5f-2c1d0a9b8e71'
const EVENT_SLUG = 'artist-layer-launch-night-geelong'
const TIER_ID = '5b8e2f1a-3c6d-4e9f-8a7b-1d2c3e4f5a6b'
const GUEST_EMAIL = 'artist-gate-guest@mailinator.com'

const STAGES = new Set((process.env.STAGES ?? 'setup,tag,buy,dashboards,card,follow').split(','))
const proofs = { base: BASE, startedAt: new Date().toISOString(), stages: [...STAGES] }

async function q(path) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, { headers: svcH })
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${await res.text()}`)
  return res.json()
}
async function upsert(table, row, conflict = 'id') {
  const res = await fetch(`${URL_}/rest/v1/${table}?on_conflict=${conflict}`, {
    method: 'POST',
    headers: { ...svcH, prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(row),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(`${table} upsert: ${JSON.stringify(body).slice(0, 300)}`)
  return Array.isArray(body) ? body[0] : body
}
async function setPassword(userId) {
  const res = await fetch(`${URL_}/auth/v1/admin/users/${userId}`, {
    method: 'PUT',
    headers: svcH,
    body: JSON.stringify({ password: GATE_PASSWORD }),
  })
  if (!res.ok) throw new Error(`password reset ${userId}: ${res.status} ${await res.text()}`)
}
async function shot(page, name) {
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })
  console.log(`[gate] shot ${name}`)
}

// ── Setup: fixture event + tier + fixture-account passwords ─────────────────
if (STAGES.has('setup')) {
  const cover = (await q(`events?id=eq.8deaff4f-d92f-4dfc-9ef4-cabcda0502a8&select=cover_image_url,category_id`))[0]
  await upsert('events', {
    id: EVENT_ID,
    title: 'Artist Layer Launch Night, Geelong',
    slug: EVENT_SLUG,
    summary: 'Two-artist synthetic gate event for the broadcast_artists switch-on.',
    description: 'The Stage 3 switch-on evidence event: two tagged performers, sales attributed through each of their tracked links.',
    organisation_id: ORG_ID,
    created_by: ORGANISER.id,
    category_id: cover?.category_id ?? null,
    start_date: '2026-08-14T09:30:00Z',
    end_date: '2026-08-14T12:00:00Z',
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
    max_capacity: 60,
    tags: ['broadcast-gate'],
    fee_pass_type: 'pass_to_buyer',
    is_free: true,
    is_seed_data: true,
  })
  await upsert('ticket_tiers', {
    id: TIER_ID,
    event_id: EVENT_ID,
    name: 'Launch Pass',
    description: 'Free entry',
    tier_type: 'general_admission',
    price: 0,
    currency: 'AUD',
    total_capacity: 60,
    sold_count: 0,
    reserved_count: 0,
    min_per_order: 1,
    max_per_order: 6,
    sort_order: 0,
    is_visible: true,
    is_active: true,
    dynamic_pricing_enabled: false,
    requires_access_code: false,
  })
  await setPassword(ORGANISER.id)
  await setPassword(BUYER_ONE.id)
  await setPassword(BUYER_TWO.id)
  proofs.setup = { eventId: EVENT_ID, slug: EVENT_SLUG, tierId: TIER_ID, passwordsRotated: true }
  console.log('[gate] setup done')
}

const browser = await chromium.launch()
const DESKTOP = { viewport: { width: 1440, height: 900 } }
const MOBILE = { ...devices['iPhone 13'] }

async function login(email) {
  const ctx = await browser.newContext(DESKTOP)
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

// ── 1. Tag both artists through the real Lineup UI ──────────────────────────
if (STAGES.has('tag')) {
  const ctx = await login(ORGANISER.email)
  const page = await ctx.newPage()
  await page.goto(`${BASE}/dashboard/events/${EVENT_ID}/lineup`, { waitUntil: 'load', timeout: 90000 })
  for (const artist of [ARTIST_A, ARTIST_B]) {
    await page.getByLabel('Performer name').fill(artist.name)
    await page.getByRole('button', { name: 'Tag performer' }).click()
    await page.waitForSelector('text=Performer tagged.', { timeout: 30000 })
    await page.waitForTimeout(1000)
  }
  await page.reload({ waitUntil: 'load' })
  await shot(page, 'lineup-two-artists-tagged')
  await ctx.close()
}

// The per-artist tracked links minted by the lineup render.
const linkA = (await q(`share_links?event_id=eq.${EVENT_ID}&artist_id=eq.${ARTIST_A.id}&select=id,code&limit=1`))[0]
const linkB = (await q(`share_links?event_id=eq.${EVENT_ID}&artist_id=eq.${ARTIST_B.id}&select=id,code&limit=1`))[0]
if (!linkA || !linkB) throw new Error('artist share links not minted; run the tag stage')
proofs.links = { [ARTIST_A.name]: linkA.code, [ARTIST_B.name]: linkB.code }
console.log('[gate] artist links', linkA.code, linkB.code)

async function freeRegister(page, name, email) {
  await page.locator('button[aria-label^="Increase"]').first().click()
  await page.getByRole('button', { name: /Checkout|Register/ }).click()
  await page.waitForURL(/\/checkout\//, { timeout: 60000 })
  await page.waitForTimeout(2000)
  const nameInput = page.getByPlaceholder('Jane Smith')
  if (await nameInput.count()) {
    if (!(await nameInput.inputValue())) await nameInput.fill(name)
  }
  const emailInput = page.getByPlaceholder('you@example.com').first()
  if (await emailInput.count()) {
    if (!(await emailInput.inputValue())) await emailInput.fill(email)
  }
  // Attendee details: use the buyer-details shortcut when present, else fill
  // the per-ticket fields directly.
  const useMine = page.getByText('Use my details for all tickets')
  if (await useMine.count()) {
    await useMine.click()
  } else {
    const first = page.getByLabel('First name').first()
    if (await first.count()) {
      await first.fill(name.split(' ')[0])
      await page.getByLabel('Last name').first().fill(name.split(' ').slice(1).join(' ') || name)
      const attendeeEmail = page.getByLabel('Email').last()
      if (await attendeeEmail.count()) await attendeeEmail.fill(email)
    }
  }
  await page.getByRole('button', { name: 'Register for free' }).click()
  try {
    // 'commit' rather than 'load': the confirmation URL is the success signal
    // (the server render that records the conversion has already happened).
    await page.waitForURL(/confirmation/, { timeout: 60000, waitUntil: 'commit' })
  } catch (err) {
    await page.screenshot({ path: `${OUT}/freeRegister-stuck.png`, fullPage: true })
    throw err
  }
  await page.waitForTimeout(2500)
  return page.url().match(/orders\/([0-9a-f-]+)\//)?.[1]
}

// ── 2. One sale through each artist link ────────────────────────────────────
if (STAGES.has('buy')) {
  // Guest through artist A's link.
  {
    const ctx = await browser.newContext(DESKTOP)
    const page = await ctx.newPage()
    await page.goto(`${BASE}/s/${linkA.code}`, { waitUntil: 'load', timeout: 90000 })
    await page.waitForURL(new RegExp(`/events/${EVENT_SLUG}$`), { timeout: 45000 })
    const orderId = await freeRegister(page, 'Gate Guest', GUEST_EMAIL)
    await shot(page, 'buy-guest-via-artist-a-confirmation')
    proofs.buyA = { orderId }
    await ctx.close()
  }
  // Signed-in buyer one through artist B's link.
  {
    const ctx = await login(BUYER_ONE.email)
    const page = await ctx.newPage()
    await page.goto(`${BASE}/s/${linkB.code}`, { waitUntil: 'load', timeout: 90000 })
    await page.waitForURL(new RegExp(`/events/${EVENT_SLUG}$`), { timeout: 45000 })
    const orderId = await freeRegister(page, 'Gate Buyer One', BUYER_ONE.email)
    await shot(page, 'buy-signedin-via-artist-b-confirmation')
    proofs.buyB = { orderId }
    await ctx.close()
  }
}

// ── 3. Attribution split: DB truth + both dashboards ────────────────────────
{
  const evA = await q(`share_link_events?link_id=eq.${linkA.id}&select=kind,order_id&order=occurred_at`)
  const evB = await q(`share_link_events?link_id=eq.${linkB.id}&select=kind,order_id&order=occurred_at`)
  const convA = evA.filter(e => e.kind === 'conversion')
  const convB = evB.filter(e => e.kind === 'conversion')
  proofs.attribution = {
    artistA: { clicks: evA.filter(e => e.kind === 'click').length, conversions: convA },
    artistB: { clicks: evB.filter(e => e.kind === 'click').length, conversions: convB },
    splitCorrect:
      convA.length === 1 &&
      convB.length === 1 &&
      convA[0].order_id !== convB[0].order_id,
  }
  console.log('[gate] attribution', JSON.stringify(proofs.attribution))
}

if (STAGES.has('dashboards')) {
  // Organiser: Who filled the room.
  {
    const ctx = await login(ORGANISER.email)
    const page = await ctx.newPage()
    await page.goto(`${BASE}/dashboard/events/${EVENT_ID}/lineup`, { waitUntil: 'load', timeout: 90000 })
    await shot(page, 'organiser-who-filled-the-room')
    const body = await page.textContent('body')
    proofs.organiserDashboard = {
      showsBothArtists: body.includes(ARTIST_A.name) && body.includes(ARTIST_B.name),
    }
    await ctx.close()
  }
  // Artist: Marlo Reyes's own dashboard (owned by buyer two).
  {
    const ctx = await login(BUYER_TWO.email)
    const page = await ctx.newPage()
    await page.goto(`${BASE}/artist/dashboard`, { waitUntil: 'load', timeout: 90000 })
    await shot(page, 'artist-dashboard-marlo')
    const body = await page.textContent('body')
    proofs.artistDashboard = {
      showsArtist: body.includes(ARTIST_B.name),
      showsGateEvent: body.includes('Artist Layer Launch Night'),
    }
    await ctx.close()
  }
}

// ── 4. Artist share card in a link preview ──────────────────────────────────
if (STAGES.has('card')) {
  const landing = await fetch(`${BASE}/events/${EVENT_SLUG}/with/${ARTIST_B.slug}`)
  const html = await landing.text()
  const ogTitle = html.match(/property="og:title" content="([^"]+)"/)?.[1] ?? null
  const ogImage = html.match(/property="og:image" content="([^"]+)"/)?.[1] ?? null
  const cardRes = await fetch(`${BASE}/api/og/event/${EVENT_SLUG}?artist=${ARTIST_B.slug}`)
  const cardBytes = Buffer.from(await cardRes.arrayBuffer())
  fs.writeFileSync(`${OUT}/artist-share-card.png`, cardBytes)
  proofs.shareCard = {
    landingStatus: landing.status,
    ogTitle,
    ogImageCarriesArtist: ogImage?.includes(`artist=${ARTIST_B.slug}`) ?? false,
    cardStatus: cardRes.status,
    cardBytes: cardBytes.length,
    cardIsPng: cardBytes.subarray(1, 4).toString() === 'PNG',
  }
  console.log('[gate] share card', JSON.stringify(proofs.shareCard))
}

// ── 5. Artist follow through the real profile button ────────────────────────
if (STAGES.has('follow')) {
  const ctx = await login(BUYER_ONE.email)
  const page = await ctx.newPage()
  await page.goto(`${BASE}/artists/${ARTIST_A.slug}`, { waitUntil: 'load', timeout: 90000 })
  const btn = page.getByRole('button', { name: /^Follow/ }).first()
  await page.waitForTimeout(1500)
  // Idempotent: the button is a toggle, so only click when not yet following.
  if ((await btn.getAttribute('aria-pressed')) !== 'true') {
    await btn.click()
    await page.waitForTimeout(2500)
  }
  await shot(page, 'artist-follow-following')
  const rows = await q(
    `follows?user_id=eq.${BUYER_ONE.id}&followable_type=eq.artist&followable_id=eq.${ARTIST_A.id}&select=id,created_at`,
  )
  proofs.follow = { rowCount: rows.length, followed: rows.length === 1 }
  console.log('[gate] follow rows', rows.length)
  await ctx.close()
}

// ── Visual captures for the premium check ────────────────────────────────────
for (const [label, opts] of [['1440x900', DESKTOP], ['390x844', MOBILE]]) {
  const ctx = await browser.newContext(opts)
  const page = await ctx.newPage()
  await page.goto(`${BASE}/artists/${ARTIST_B.slug}`, { waitUntil: 'load', timeout: 90000 })
  await shot(page, `artist-profile-${label}`)
  await ctx.close()
}

await browser.close()
proofs.finishedAt = new Date().toISOString()
let merged = proofs
try {
  const prior = JSON.parse(fs.readFileSync(`${OUT}/gate.json`, 'utf8'))
  merged = { ...prior, ...proofs }
} catch {}
fs.writeFileSync(`${OUT}/gate.json`, JSON.stringify(merged, null, 2))

const pass =
  merged.attribution?.splitCorrect &&
  (merged.organiserDashboard?.showsBothArtists ?? false) &&
  (merged.artistDashboard?.showsArtist ?? false) &&
  (merged.artistDashboard?.showsGateEvent ?? false) &&
  (merged.shareCard?.ogTitle?.includes('Marlo Reyes live at') ?? false) &&
  (merged.shareCard?.ogImageCarriesArtist ?? false) &&
  merged.shareCard?.cardStatus === 200 &&
  (merged.shareCard?.cardIsPng ?? false) &&
  (merged.follow?.followed ?? false)
console.log(JSON.stringify({
  attributionSplit: merged.attribution?.splitCorrect ?? false,
  organiserDashboard: merged.organiserDashboard?.showsBothArtists ?? false,
  artistDashboard: (merged.artistDashboard?.showsArtist && merged.artistDashboard?.showsGateEvent) ?? false,
  shareCard: (merged.shareCard?.cardStatus === 200 && merged.shareCard?.ogImageCarriesArtist) ?? false,
  artistFollow: merged.follow?.followed ?? false,
  ALL_GREEN: Boolean(pass),
}, null, 2))
if (!pass) process.exit(1)
