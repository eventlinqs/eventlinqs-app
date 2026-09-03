/**
 * A2 DRIVE: a hybrid event sells an in-person tier and a livestream tier, a
 * livestream ticket holder reaches the stream and the room, an in-person ticket
 * holder does not, a stranger with the wrong secret does not, and geography is
 * enforced from the request country (Scope v5, 3.11).
 *
 * UI ONLY. Every step is what a real organiser or attendee does with a mouse
 * and a keyboard. The confirmation emails are read out of the console mail
 * transport the way a person reads their inbox. Nothing is seeded by hand.
 *
 * Requires a production server on BASE (default http://localhost:3311) built
 * from this tree, started with EMAIL_TRANSPORT=console against TEST, writing
 * its console to SERVER_LOG (default .tmp-serve.log).
 *
 * Usage:
 *   node scripts/journeys/a2-virtual-hybrid.mjs
 *   JOURNEY_VIEWPORT=mobile-390 node scripts/journeys/a2-virtual-hybrid.mjs
 *   EVIDENCE_DIR=C:\dev\EVIDENCE\A2 node scripts/journeys/a2-virtual-hybrid.mjs
 *
 * Every screenshot is also copied to EVIDENCE_DIR/<viewport>/ when that is set.
 */
import { copyFileSync, mkdirSync, existsSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  chromium,
  BASE,
  makeJourney,
  note,
  attach,
  describe,
  finish,
  messagesOnScreen,
  fillIf,
  clickText,
  signUpAndConfirm,
  linkFromInbox,
} from './harness.mjs'

const j = makeJourney('a2-virtual-hybrid', 'A2: hybrid event, livestream ticket, the gated room')
const stamp = process.env.RUN_STAMP ?? String(Date.now()).slice(-6)
const viewportLabel = process.env.JOURNEY_VIEWPORT ?? 'desktop-1440'
const ORGANISER = { name: 'Priya Natarajan', email: `priya.stream.${stamp}@example.com`, password: `Str0ng-${stamp}-Pass!` }
const VIEWER = { name: 'Tom Akana', email: `tom.viewer.${stamp}@example.com`, password: `Str0ng-${stamp}-View!` }
const WALKIN = { name: 'Mei Ling', email: `mei.door.${stamp}@example.com`, password: `Str0ng-${stamp}-Door!` }
const TITLE = `Geelong Sessions Live ${stamp}`
const STREAM_LINK = 'https://www.youtube.com/live/dQw4w9WgXcQ'

const browser = await chromium.launch()
const results = []
function verdict(name, ok, detail) {
  results.push({ name, ok, detail })
  note(j, `${ok ? 'PASS' : 'FAIL'}  ${name}`, detail)
  if (!ok) j.blockers.push(`${name}: ${detail ?? ''}`)
}

/**
 * THE VIEWPORT IS THE LABEL, not a decoration on it. The first run of this
 * journey (3 September 2026) accepted JOURNEY_VIEWPORT for the evidence path
 * and opened every context at 1440 regardless, so a "mobile-390" run would have
 * produced desktop screenshots filed under a mobile name. The three sizes the
 * Definition of Done names are the three sizes opened here.
 */
const VIEWPORTS = {
  'mobile-390': { width: 390, height: 844 },
  'tablet-768': { width: 768, height: 1024 },
  'desktop-1440': { width: 1440, height: 1000 },
}
const viewport = VIEWPORTS[viewportLabel] ?? VIEWPORTS['desktop-1440']

/**
 * THREE PEOPLE, THREE CONNECTIONS. The organiser, the viewer and the walk-in are
 * three different people on three different networks, and the signup limiter
 * (auth-signup, 5 per address per 10 minutes) keys on the forwarded address,
 * exactly as it does behind Vercel. Driving all three from one address is not
 * what happens in the world; it is a harness artefact, and on 3 September it
 * refused the third signup and reported the product as the problem. Each
 * context therefore carries its own documentation-range address.
 */
let connections = 0
async function fresh(extraHeaders) {
  connections += 1
  const ctx = await browser.newContext({
    viewport,
    locale: 'en-AU',
    extraHTTPHeaders: { 'x-forwarded-for': `203.0.113.${connections}`, ...(extraHeaders ?? {}) },
  })
  const p = await ctx.newPage()
  await attach(j, p)
  return { ctx, p }
}

/** Addresses and sessions the axe and Lighthouse passes need, written beside the evidence. */
const run = { viewport: viewportLabel, base: BASE }
async function keepSession(ctx, name) {
  if (!process.env.EVIDENCE_DIR) return
  const dest = join(process.env.EVIDENCE_DIR, viewportLabel)
  mkdirSync(dest, { recursive: true })
  await ctx.storageState({ path: join(dest, `session-${name}.json`) })
}

async function textOnPage(p) {
  return (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ')
}

/** Walk the wizard as a hybrid event with two tiers. Returns the public slug. */
async function createHybridEvent(p) {
  await p.goto(`${BASE}/dashboard/events/create`, { waitUntil: 'networkidle', timeout: 60000 })
  await p.waitForTimeout(2500)
  if (await p.$('button:has-text("Continue to event details")')) {
    await fillIf(p, 'input#name, input[name="name"]', `Natarajan Presents ${stamp}`)
    await fillIf(p, 'textarea#description, textarea[name="description"]', 'Live music from Geelong, in the room and on the stream.')
    await clickText(p, 'Continue to event details')
    await p.waitForTimeout(6000)
  }
  await fillIf(p, 'input[placeholder^="e.g. Summer Music Festival"]', TITLE)
  await fillIf(p, 'input[placeholder^="A brief one-line"]', 'A night of live music, in person and streamed.')
  await fillIf(p, 'textarea[placeholder^="Describe your event in detail"]', 'Two sets from Geelong artists. Come to the room, or watch the livestream from home.')
  const sel = await p.$('select')
  if (sel) {
    const opt = await p.evaluate(() => {
      const s = document.querySelector('select')
      const o = [...s.options].find((x) => /music/i.test(x.textContent)) ?? [...s.options].find((x) => x.value)
      return o?.value ?? null
    })
    if (opt) await p.selectOption('select', opt)
  }
  await clickText(p, 'Continue')
  await p.waitForTimeout(3500)
  await describe(j, p, 'Step 2 dates')

  // Dates: three weeks out.
  const dates = await p.$$('input[type="date"], input[type="datetime-local"]')
  for (let d = 0; d < dates.length; d += 1) {
    const when = new Date(Date.now() + 21 * 864e5 + d * 3 * 36e5)
    const type = await p.evaluate((e) => e.type, dates[d])
    await dates[d].fill(type === 'date' ? when.toISOString().slice(0, 10) : when.toISOString().slice(0, 16)).catch(() => {})
  }
  await clickText(p, 'Continue')
  await p.waitForTimeout(3500)

  // Step 3: Hybrid, a venue, the stream link, and Australia and New Zealand only.
  const hybrid = await p.$('button:has-text("hybrid")')
  if (!hybrid) {
    j.blockers.push('the location step offers no Hybrid event type')
    return null
  }
  await hybrid.click()
  await p.waitForTimeout(600)
  const venueName = p.getByLabel(/^venue name/i).first()
  if (await venueName.count()) await venueName.fill('The Wool Exchange')
  const venueAddress = p.getByLabel(/^address/i).first()
  if (await venueAddress.count()) await venueAddress.fill('44 Moorabool Street, Geelong')
  const cityField = p.getByLabel(/^city/i).first()
  if (await cityField.count()) await cityField.fill('Geelong')
  const stateField = p.getByLabel(/^state/i).first()
  if (await stateField.count()) await stateField.fill('VIC')

  const streamField = p.getByLabel(/^stream link/i).first()
  const hasStreamField = (await streamField.count()) > 0
  verdict('the organiser is offered a Stream link field on a hybrid event', hasStreamField)
  if (hasStreamField) await streamField.fill(STREAM_LINK)

  const anz = await p.$('button:has-text("Australia and New Zealand")')
  verdict('the organiser can restrict the stream to a region with one pick', Boolean(anz))
  if (anz) await anz.click()
  await p.waitForTimeout(500)
  await describe(j, p, 'Step 3 hybrid location and stream')
  await clickText(p, 'Continue')
  await p.waitForTimeout(3500)

  // Step 4: media. Make a cover through the platform.
  if (await p.$('button:has-text("Make a cover")')) {
    await clickText(p, 'Make a cover')
    const started = Date.now()
    let made = false
    while (Date.now() - started < 45000) {
      made = await p.evaluate(() =>
        [...document.querySelectorAll('img')].some((im) => {
          const r = im.getBoundingClientRect()
          return r.width > 120 && r.height > 80 && im.complete && im.naturalWidth > 0
        }),
      )
      if (made) break
      await p.waitForTimeout(1500)
    }
    if (made && (await p.$('button:has-text("Use this cover")'))) {
      await clickText(p, 'Use this cover')
      await p.waitForTimeout(3000)
    }
    verdict('a cover was composed for the hybrid event', made)
  }

  // Continue to ticketing, WAITING FOR THE UPLOAD RATHER THAN A CLOCK. The form
  // refuses Continue while the cover is still uploading and says so ("Your cover
  // is still uploading. Give it a moment, then continue."). On a cold server the
  // composed cover outlasted a fixed wait and the first run of this journey
  // reported "never reached the ticketing step" against the product. A person
  // reads the sentence, waits, and presses Continue again; so does this.
  const ticketingStarted = Date.now()
  while (!(await p.$('button:has-text("Add Ticket Tier")')) && Date.now() - ticketingStarted < 90000) {
    await clickText(p, 'Continue')
    await p.waitForTimeout(2500)
    const shown = await messagesOnScreen(p)
    if (shown.some((s) => /still uploading/i.test(s))) await p.waitForTimeout(3000)
  }

  // Step 5: two free tiers, one in person and one livestream.
  if (!(await p.$('button:has-text("Add Ticket Tier")'))) {
    await describe(j, p, 'Stuck before ticketing')
    j.blockers.push(`never reached the ticketing step: ${(await messagesOnScreen(p)).join(' // ') || 'no message shown'}`)
    return null
  }
  await fillIf(p, '#tier-name-0', 'In the room')
  const t0 = await p.$('#type-21, select#type-21')
  if (t0) await t0.selectOption('free').catch(() => {})
  await fillIf(p, '#tier-capacity-0', '80')
  const admits0 = p.locator('#tier-admits-0')
  verdict('a hybrid event asks who each tier admits', (await admits0.count()) > 0)
  if (await admits0.count()) await admits0.selectOption('in_person')

  await clickText(p, 'Add Ticket Tier')
  await p.waitForTimeout(800)
  await fillIf(p, '#tier-name-1', 'Watch the livestream')
  const typeSelects = await p.$$('select[id^="type-"]')
  if (typeSelects[1]) await typeSelects[1].selectOption('free').catch(() => {})
  await fillIf(p, '#tier-capacity-1', '500')
  const admits1 = p.locator('#tier-admits-1')
  if (await admits1.count()) await admits1.selectOption('virtual')
  await describe(j, p, 'Step 5 two tiers')

  // Walk to review and publish.
  for (let i = 0; i < 4; i += 1) {
    if (await p.$('button:has-text("Publish and get your launch kit")')) break
    if (!(await clickText(p, 'Continue'))) break
    await p.waitForTimeout(3500)
  }
  const pub = await p.$('button:has-text("Publish and get your launch kit")')
  if (!pub) {
    j.blockers.push(`never reached Review: ${(await messagesOnScreen(p)).join(' // ') || 'no message'}`)
    return null
  }
  await describe(j, p, 'Review before publish')
  await pub.click()
  await p.waitForTimeout(12000)
  const url = p.url()
  const shown = await messagesOnScreen(p)
  const published = /launch-kit|\/dashboard\/events\//.test(url) && !shown.some((s) => /could not|refused|failed/i.test(s))
  verdict('the hybrid event published', published, `${url.replace(BASE, '')} ${shown.join(' // ')}`)
  await describe(j, p, 'After publish')

  // The event id from the address after publish, and the public slug from a
  // real link on the page (never /events/create, which is the wizard itself).
  const eventId = url.match(/\/dashboard\/events\/([0-9a-f-]{36})/)?.[1] ?? null
  const slug = await p.evaluate(() => {
    const skip = new Set(['create', 'browse', 'map', 'search'])
    for (const a of document.querySelectorAll('a[href]')) {
      const m = a.getAttribute('href')?.match(/^(?:https?:\/\/[^/]+)?\/events\/([a-z0-9-]+)\/?$/)
      if (m && !skip.has(m[1])) return m[1]
    }
    return null
  })
  return { slug, eventId }
}

/** Sign in, open the public page, take one ticket of the named tier, land on the confirmation. */
async function takeTicket(p, slug, tierName) {
  await p.goto(`${BASE}/events/${slug}`, { waitUntil: 'networkidle', timeout: 60000 })
  await p.waitForTimeout(2500)
  await describe(j, p, `Public event page as ${tierName} buyer`)
  const body = await textOnPage(p)
  verdict('the public page never shows the stream link', !body.includes(STREAM_LINK) && !body.includes('youtube.com/live'), 'searched the rendered text')
  // The + beside the named tier.
  const row = p.locator('div', { hasText: tierName }).filter({ has: p.locator('button[aria-label^="Increase"]') }).last()
  const plus = row.locator('button[aria-label^="Increase"]').first()
  if (!(await plus.count())) {
    j.blockers.push(`no quantity control for the tier "${tierName}"`)
    return null
  }
  await plus.click()
  await p.waitForTimeout(1200)
  let clicked = false
  for (const el of await p.$$('button')) {
    const t = ((await el.innerText().catch(() => '')) || '').trim()
    if (/^(register|checkout|get tickets|reserve)/i.test(t) && (await el.isVisible().catch(() => false))) {
      await el.click().catch(() => {})
      clicked = true
      break
    }
  }
  if (!clicked) {
    j.blockers.push('ticket selection offers no way to continue')
    return null
  }
  await p.waitForTimeout(9000)
  await describe(j, p, `Confirmation for ${tierName}`)
  const orderMatch = p.url().match(/\/orders\/([0-9a-f-]{36})/)
  return orderMatch ? orderMatch[1] : null
}

try {
  // ── ORGANISER ────────────────────────────────────────────────────────────
  const org = await fresh()
  const signedUp = await signUpAndConfirm(j, org.p, ORGANISER)
  if (!signedUp) throw new Error('organiser signup failed')
  const created = await createHybridEvent(org.p)
  const slug = created?.slug ?? null
  const eventId = created?.eventId ?? null
  if (!slug) throw new Error('no event slug')
  note(j, 'Public slug', `${slug} (event ${eventId ?? 'unknown'})`)
  run.slug = slug
  run.eventId = eventId
  run.organiserStreamUrl = eventId ? `/dashboard/events/${eventId}/stream` : null
  run.organiserEditUrl = eventId ? `/dashboard/events/${eventId}/edit` : null
  await keepSession(org.ctx, 'organiser')

  // ── LIVESTREAM VIEWER (AU) ───────────────────────────────────────────────
  const viewer = await fresh({ 'x-vercel-ip-country': 'AU' })
  if (!(await signUpAndConfirm(j, viewer.p, VIEWER))) throw new Error('viewer signup failed')
  const viewerOrder = await takeTicket(viewer.p, slug, 'Watch the livestream')
  verdict('the viewer holds a confirmed livestream ticket', Boolean(viewerOrder), viewerOrder ?? 'no order')
  run.viewerConfirmationUrl = viewerOrder ? `/orders/${viewerOrder}/confirmation` : null
  run.viewerTicketUrl = (await viewer.p.locator('a', { hasText: /view ticket/i }).first().getAttribute('href').catch(() => null)) ?? null
  await keepSession(viewer.ctx, 'viewer')

  // The email the viewer received carries a Join the livestream link.
  const emailWatch = linkFromInbox(VIEWER.email, /\/t\/[^/]+\/watch\?k=/)
  verdict('the confirmation email carries a Join the livestream link', Boolean(emailWatch), emailWatch ? emailWatch.replace(BASE, '') : 'no watch link in the email')

  // From the confirmation page to the ticket, then Join the livestream.
  const join = viewer.p.locator('a', { hasText: /join the livestream/i }).first()
  verdict('the confirmation page offers Join the livestream', (await join.count()) > 0)
  let watchUrl = emailWatch
  if (await join.count()) {
    await join.click()
    await viewer.p.waitForTimeout(4000)
    watchUrl = viewer.p.url()
  } else if (emailWatch) {
    await viewer.p.goto(emailWatch, { waitUntil: 'networkidle', timeout: 60000 })
  }
  await describe(j, viewer.p, 'The watch page as an admitted viewer')
  const watchText = await textOnPage(viewer.p)
  const embed = await viewer.p.$('iframe[src*="youtube-nocookie.com/embed/"]')
  verdict('the admitted viewer sees the stream', Boolean(embed) || watchText.includes('Open the stream'), embed ? 'YouTube embed present' : 'no embed')

  run.watchUrl = watchUrl ? watchUrl.replace(BASE, '') : null

  // Chat, read back on the CHAT tab. The first run of this journey switched to
  // the Questions tab before reading the page and then reported the chat
  // message missing, which was the tab filter working, not the room failing.
  const chatBox = viewer.p.getByLabel(/^say something/i).first()
  verdict('the room offers a chat composer', (await chatBox.count()) > 0)
  if (await chatBox.count()) {
    await chatBox.fill(`Hello from the stream ${stamp}`)
    await clickText(viewer.p, 'Send')
    await viewer.p.waitForTimeout(3000)
  }
  const chatText = await textOnPage(viewer.p)
  verdict('the viewer sees their own chat message', chatText.includes(`Hello from the stream ${stamp}`))
  await describe(j, viewer.p, 'The room after chatting')

  // A question, on the Questions tab.
  const askTab = viewer.p.locator('button', { hasText: /^questions/i }).first()
  if (await askTab.count()) await askTab.click()
  const qBox = viewer.p.getByLabel(/^ask a question/i).first()
  verdict('the room offers a question composer', (await qBox.count()) > 0)
  if (await qBox.count()) {
    await qBox.fill(`When does the second set start ${stamp}`)
    await clickText(viewer.p, 'Ask')
    await viewer.p.waitForTimeout(3000)
  }
  const questionText = await textOnPage(viewer.p)
  verdict('the viewer sees their own question, waiting for the organiser', questionText.includes(`When does the second set start ${stamp}`) && /waiting for the organiser/i.test(questionText))
  await describe(j, viewer.p, 'The room after asking')

  // ── ORGANISER ANSWERS ────────────────────────────────────────────────────
  if (eventId) {
    await org.p.goto(`${BASE}/dashboard/events/${eventId}`, { waitUntil: 'networkidle', timeout: 60000 })
  } else {
    await org.p.goto(`${BASE}/dashboard/events`, { waitUntil: 'networkidle', timeout: 60000 })
    const eventLink = org.p.locator('a', { hasText: TITLE }).first()
    if (await eventLink.count()) await eventLink.click()
  }
  await org.p.waitForTimeout(3500)
  await describe(j, org.p, 'Organiser event overview')
  const streamTab = org.p.locator('a', { hasText: /^stream$/i }).first()
  verdict('the organiser dashboard offers a Stream tab', (await streamTab.count()) > 0)
  if (await streamTab.count()) {
    await streamTab.click()
    await org.p.waitForTimeout(3500)
    await describe(j, org.p, 'Organiser stream room')
    const orgText = await textOnPage(org.p)
    verdict('the organiser sees the question', orgText.includes(`When does the second set start ${stamp}`))
    const answerBox = org.p.getByLabel(/^your answer/i).first()
    if (await answerBox.count()) {
      await answerBox.fill('The second set starts at nine, straight after the break.')
      await clickText(org.p, 'Answer')
      await org.p.waitForTimeout(3000)
    }
    const answered = await textOnPage(org.p)
    verdict('the organiser sees their answer saved under the question', /your answer is in the room/i.test(answered) && answered.includes('The second set starts at nine'))
    await describe(j, org.p, 'Organiser answered the question')

    // Hide the CHAT message, found inside the Chat section by its own text. The
    // first run clicked the first Hide on the page, which sat on the question,
    // and then reported that the viewer never saw the answer: the answer had
    // been hidden along with the question it belonged to.
    const chatItem = org.p.locator('section[aria-labelledby="chat-heading"] li', { hasText: `Hello from the stream ${stamp}` }).first()
    verdict('the organiser sees the chat message in the Chat section', (await chatItem.count()) > 0)
    const hide = chatItem.locator('button', { hasText: /^hide$/i }).first()
    if (await hide.count()) {
      await hide.click()
      await org.p.waitForTimeout(2500)
    }
    const hidden = await textOnPage(org.p)
    verdict('the organiser can hide a chat message', /hidden\. it vanishes from every viewer/i.test(hidden))
    await describe(j, org.p, 'Organiser hid the chat message')
  }

  // ── VIEWER SEES THE ANSWER, HIDDEN MESSAGE GONE ──────────────────────────
  await viewer.p.waitForTimeout(6500)
  const afterText = await textOnPage(viewer.p)
  verdict('the viewer sees the organiser answer', afterText.includes('The second set starts at nine'))
  await describe(j, viewer.p, 'Viewer sees the answer')
  const chatTab = viewer.p.locator('button', { hasText: /^chat$/i }).first()
  if (await chatTab.count()) await chatTab.click()
  await viewer.p.waitForTimeout(800)
  const chatAfter = await textOnPage(viewer.p)
  verdict('the hidden chat message has vanished from the viewer room', !chatAfter.includes(`Hello from the stream ${stamp}`))
  await describe(j, viewer.p, 'Viewer chat after the organiser hid the message')

  // ── NON-HOLDERS ──────────────────────────────────────────────────────────
  if (watchUrl) {
    const wrong = await fresh({ 'x-vercel-ip-country': 'AU' })
    const tampered = watchUrl.replace(/k=[^&]+/, 'k=00000000-0000-0000-0000-000000000000')
    const r = await wrong.p.goto(tampered, { waitUntil: 'networkidle', timeout: 60000 })
    verdict('a wrong secret is refused with a 404', r?.status() === 404, `status ${r?.status()}`)
    await describe(j, wrong.p, 'Wrong secret')
    await wrong.ctx.close()

    const abroad = await fresh({ 'x-vercel-ip-country': 'US' })
    await abroad.p.goto(watchUrl, { waitUntil: 'networkidle', timeout: 60000 })
    const abroadText = await textOnPage(abroad.p)
    verdict(
      'a viewer outside the allowed countries is refused and told why',
      /Australia and New Zealand/.test(abroadText) && !(await abroad.p.$('iframe[src*="youtube"]')),
      abroadText.slice(0, 160),
    )
    await describe(j, abroad.p, 'Blocked by geography')
    await abroad.ctx.close()

    const nz = await fresh({ 'x-vercel-ip-country': 'NZ' })
    await nz.p.goto(watchUrl, { waitUntil: 'networkidle', timeout: 60000 })
    verdict('a viewer in New Zealand is admitted', Boolean(await nz.p.$('iframe[src*="youtube-nocookie.com/embed/"]')))
    await nz.ctx.close()
  }

  // In-person ticket holder cannot watch.
  const walkin = await fresh({ 'x-vercel-ip-country': 'AU' })
  if (await signUpAndConfirm(j, walkin.p, WALKIN)) {
    const walkinOrder = await takeTicket(walkin.p, slug, 'In the room')
    verdict('the walk-in holds a confirmed in-person ticket', Boolean(walkinOrder))
    const joinForWalkin = walkin.p.locator('a', { hasText: /join the livestream/i })
    verdict('an in-person ticket offers no Join the livestream link', (await joinForWalkin.count()) === 0)
    const ticketLink = walkin.p.locator('a', { hasText: /view ticket/i }).first()
    if (await ticketLink.count()) {
      const href = await ticketLink.getAttribute('href')
      run.walkinTicketUrl = href ?? null
      run.walkinConfirmationUrl = walkinOrder ? `/orders/${walkinOrder}/confirmation` : null
      await keepSession(walkin.ctx, 'walkin')
      if (href) {
        const forced = `${BASE}${href.replace('?k=', '/watch?k=')}`
        await walkin.p.goto(forced, { waitUntil: 'networkidle', timeout: 60000 })
        const forcedText = await textOnPage(walkin.p)
        verdict(
          'forcing the watch address with an in-person ticket is refused',
          !(await walkin.p.$('iframe[src*="youtube"]')) && /in.person|does not include the livestream/i.test(forcedText),
          forcedText.slice(0, 160),
        )
        await describe(j, walkin.p, 'In-person ticket forced onto the watch address')
      }
    }
  }
  await walkin.ctx.close()
  await viewer.ctx.close()
  await org.ctx.close()
} catch (err) {
  j.blockers.push(`journey stopped: ${err instanceof Error ? err.message : String(err)}`)
} finally {
  const passed = results.filter((r) => r.ok).length
  note(j, 'Verdicts', `${passed} of ${results.length} passed`)
  if (process.env.EVIDENCE_DIR) {
    const dest = join(process.env.EVIDENCE_DIR, viewportLabel)
    mkdirSync(dest, { recursive: true })
    for (const f of readdirSync(j.OUT)) copyFileSync(join(j.OUT, f), join(dest, f))
    // The addresses this run created, so the axe and Lighthouse passes scan the
    // same event, ticket and room a person just used rather than a hand-picked
    // one. Bearer addresses carry their secret, which is why this file lives in
    // the evidence directory outside the repository and not under docs/.
    run.verdicts = results
    writeFileSync(join(dest, 'run.json'), JSON.stringify(run, null, 2))
    note(j, 'Evidence copied', dest)
  }
  await finish(j, browser)
  if (!existsSync(j.OUT)) process.exit(1)
  process.exit(results.some((r) => !r.ok) || j.blockers.length > 0 ? 1 : 0)
}
