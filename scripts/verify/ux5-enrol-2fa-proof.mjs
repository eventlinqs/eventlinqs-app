/**
 * UX5 DRIVEN PROOF: the admin two-factor enrolment page can actually be
 * enrolled from, at 390, 768 and 1440.
 *
 * WHAT THIS PROVES, AND WHY IT IS NOT A SCREENSHOT.
 *
 * The defect was that the page said "scan the QR code" and drew nothing to
 * scan. A screenshot of a QR proves a picture exists. It does not prove a
 * PHONE can read it, and it does not prove that what the phone reads is the
 * secret the server is about to check. So this drive:
 *
 *   1. reaches the page through the REAL /admin/login flow, as an un-enrolled
 *      admin, which is the product's own documented first-login bootstrap;
 *   2. rasterises the QR as it is actually painted and DECODES it with jsQR,
 *      which is a camera's job done in software;
 *   3. asserts the decoded string is character-for-character the otpauth URI
 *      the page prints beneath it, and that its `secret` parameter is the
 *      base32 secret the page prints beside it. A QR that decodes to something
 *      else is worse than no QR at all;
 *   4. computes a TOTP code from the DECODED secret using its own RFC 6238
 *      implementation, never the application's, and submits it to the real
 *      enrolment form. If the server accepts it, the picture carried a working
 *      secret. That is the whole claim, driven end to end;
 *   5. checks the page does not overflow its viewport at any width (the UX6
 *      standard), that the fallbacks a person who cannot scan depends on are
 *      still on the screen, and that axe finds nothing serious or critical.
 *
 * A FRESH ADMIN PER VIEWPORT, deliberately. Enrolment is one-time: once it
 * succeeds the route redirects to /admin and refuses re-entry. Reusing one
 * account would mean only the first viewport ever drove the real thing.
 *
 * Usage (the shell must not carry the production Supabase URL):
 *   BASE=http://127.0.0.1:3311 node --env-file=.env.local \
 *     scripts/verify/ux5-enrol-2fa-proof.mjs --out C:/dev/EVIDENCE/UX5
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { randomUUID, createHmac } from 'node:crypto'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
import { AxeBuilder } from '@axe-core/playwright'
import sharp from 'sharp'
import jsQR from 'jsqr'

const args = process.argv.slice(2)
let out = 'C:/dev/EVIDENCE/UX5'
for (let i = 0; i < args.length; i += 1) if (args[i] === '--out') out = args[++i]
mkdirSync(out, { recursive: true })

const BASE = process.env.BASE ?? 'http://127.0.0.1:3311'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (/gndnldyfudbytbboxesk/.test(SUPABASE_URL)) {
  console.error('refusing to run against production')
  process.exit(1)
}
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('FAIL: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  process.exit(1)
}
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

const VIEWPORTS = [
  { label: '390', width: 390, height: 844 },
  { label: '768', width: 768, height: 1024 },
  { label: '1440', width: 1440, height: 1000 },
]

/*
 * THE SMALLEST QR A CAMERA SHOULD BE ASKED TO READ. This is a floor on the
 * PAINTED box, in CSS pixels, not on the module count. 160 is chosen because
 * below it a 33-module version-4 symbol renders under 5px per module on a
 * 1x screen, which is where phone decoders start to miss. It is asserted so a
 * future layout change cannot shrink the QR into uselessness while still
 * "having a QR".
 */
const MIN_QR_CSS_PX = 160

const checks = []
const failures = []
function check(id, ok, detail) {
  checks.push({ id, ok, detail })
  if (!ok) failures.push(`${id}: ${detail}`)
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${id}  ${detail}`)
}

/* ------------------------------------------------------------------ *
 * RFC 6238, implemented here on purpose.
 *
 * Importing src/lib/admin/totp.ts would prove only that the module agrees
 * with itself. This is an independent second opinion: base32 per RFC 4648,
 * HMAC-SHA1, 30 second step, 6 digits, dynamic truncation per RFC 4226.
 * If the server accepts a code from THIS, the secret is a standard TOTP
 * secret and any real authenticator will work.
 * ------------------------------------------------------------------ */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
function base32Decode(s) {
  const clean = s.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase()
  let bits = 0
  let value = 0
  const bytes = []
  for (const ch of clean) {
    const idx = B32.indexOf(ch)
    if (idx === -1) throw new Error(`not base32: ${ch}`)
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      bits -= 8
      bytes.push((value >>> bits) & 0xff)
    }
  }
  return Buffer.from(bytes)
}
function totpAt(secretBase32, atMs) {
  const counter = Math.floor(atMs / 1000 / 30)
  const buf = Buffer.alloc(8)
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0)
  buf.writeUInt32BE(counter >>> 0, 4)
  const mac = createHmac('sha1', base32Decode(secretBase32)).update(buf).digest()
  const offset = mac[mac.length - 1] & 0x0f
  const bin =
    ((mac[offset] & 0x7f) << 24) |
    ((mac[offset + 1] & 0xff) << 16) |
    ((mac[offset + 2] & 0xff) << 8) |
    (mac[offset + 3] & 0xff)
  return String(bin % 1_000_000).padStart(6, '0')
}

/* Decode a PNG of the painted QR the way a camera would. */
async function decodeQrPng(png) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const result = jsQR(new Uint8ClampedArray(data), info.width, info.height)
  return { text: result?.data ?? null, size: `${info.width}x${info.height}` }
}

async function makeUnenrolledAdmin(label) {
  // GENERATED PER RUN, never a literal. A fixture password written into a file
  // is still a password written into a file.
  const email = `ux5-admin-${label}-${Date.now().toString(36)}@eventlinqs.test`
  const password = `${randomUUID()}Aa1`
  const created = await db.auth.admin.createUser({ email, password, email_confirm: true })
  if (created.error) throw new Error(`create admin auth user: ${created.error.message}`)
  const id = created.data.user.id
  await db.from('profiles').upsert({
    id,
    email,
    full_name: 'UX5 Enrolment Proof',
    display_name: 'UX5 Enrolment Proof',
    is_verified: true,
  })
  // No totp_secret_encrypted: this is the un-enrolled first-login bootstrap the
  // product documents, which is the only way this page is ever reachable.
  const { error } = await db
    .from('admin_users')
    .insert({ id, role: 'super_admin', display_name: 'UX5 Enrolment Proof' })
  if (error) throw new Error(`admin_users insert: ${error.message}`)
  return { id, email, password }
}

async function signIn(page, admin) {
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.locator('input[name="email"]').fill(admin.email)
  await page.locator('input[name="password"]').fill(admin.password)
  // The submit is disabled until hydration, deliberately, so no native GET can
  // ever carry the password. Wait for that rather than racing it.
  const submit = page.locator('button[type="submit"]')
  await submit.waitFor({ state: 'visible', timeout: 30000 })
  await page.waitForFunction(
    () => !document.querySelector('button[type="submit"]')?.disabled,
    undefined,
    { timeout: 30000 },
  )
  await submit.click()
  // Settle on the first REAL outcome: the redirect, or a refusal with TEXT IN
  // IT. An empty [role=alert] is already on the login page, so waiting for the
  // element to EXIST resolves instantly and indicts the product for the
  // harness's own impatience.
  await Promise.race([
    page.waitForURL((u) => !u.pathname.endsWith('/admin/login'), { timeout: 60000 }).catch(() => {}),
    page
      .waitForFunction(
        () =>
          [...document.querySelectorAll('[role=alert]')].some(
            (e) => (e.textContent ?? '').trim().length > 0,
          ),
        undefined,
        { timeout: 60000 },
      )
      .catch(() => {}),
  ])
  return new URL(page.url()).pathname
}

const created = []
let browser = null
const report = { startedAt: new Date().toISOString(), base: BASE, viewports: {} }

try {
  browser = await chromium.launch()

  for (const vp of VIEWPORTS) {
    console.log(`\n---- UX5 enrolment at ${vp.label} ----`)
    const admin = await makeUnenrolledAdmin(vp.label)
    created.push(admin.id)

    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      locale: 'en-AU',
      isMobile: vp.width < 768,
      hasTouch: vp.width < 1024,
      deviceScaleFactor: 2,
    })
    const page = await ctx.newPage()
    page.on('pageerror', (e) => console.log(`    pageerror ${String(e).slice(0, 160)}`))

    const landed = await signIn(page, admin)
    check(
      `ux5.${vp.label}.login.lands-on-enrolment`,
      landed === '/admin/enrol-2fa',
      `an un-enrolled admin is sent to ${landed}`,
    )
    if (landed !== '/admin/enrol-2fa') {
      await page.screenshot({ path: join(out, `ux5-login-refused-${vp.label}.png`), fullPage: true })
      await ctx.close()
      continue
    }

    await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {})
    await page.evaluate(() => document.fonts.ready).catch(() => {})

    // ---- what the page itself says, read from the DOM, never assumed ----
    const codes = await page.locator('code').allInnerTexts()
    const uriOnPage = (codes.find((c) => c.trim().startsWith('otpauth://')) ?? '').trim()
    const secretOnPage = (
      codes.find((c) => /^[A-Z2-7]{16,}$/.test(c.trim().replace(/\s+/g, ''))) ?? ''
    )
      .trim()
      .replace(/\s+/g, '')
    check(`ux5.${vp.label}.uri.visible`, uriOnPage.startsWith('otpauth://totp/'), uriOnPage ? 'the otpauth URI is on the screen' : 'NO otpauth URI on the screen')
    check(`ux5.${vp.label}.secret.visible`, secretOnPage.length >= 16, secretOnPage ? `the base32 secret is on the screen (${secretOnPage.length} chars)` : 'NO base32 secret on the screen')

    // ---- the QR: drawn, safe, big enough, and inside the viewport ----
    const qr = page.locator('[role="img"] svg').first()
    const qrCount = await page.locator('[role="img"] svg').count()
    check(`ux5.${vp.label}.qr.drawn`, qrCount > 0, `${qrCount} QR svg on the page`)
    if (qrCount === 0) {
      await page.screenshot({ path: join(out, `ux5-no-qr-${vp.label}.png`), fullPage: true })
      await ctx.close()
      continue
    }

    const svgHtml = await qr.evaluate((el) => el.outerHTML)
    check(
      `ux5.${vp.label}.qr.no-script`,
      !/<script|<foreignObject|javascript:/i.test(svgHtml),
      'the injected SVG carries no script, no foreignObject and no javascript: URL',
    )
    check(
      `ux5.${vp.label}.qr.carries-no-plaintext-secret`,
      !svgHtml.includes(secretOnPage),
      'the SVG markup does not repeat the secret as text',
    )

    const box = await qr.boundingBox()
    check(
      `ux5.${vp.label}.qr.scannable-size`,
      !!box && Math.min(box.width, box.height) >= MIN_QR_CSS_PX,
      box ? `painted ${Math.round(box.width)}x${Math.round(box.height)} css px, floor ${MIN_QR_CSS_PX}` : 'no painted box',
    )
    check(
      `ux5.${vp.label}.qr.inside-viewport`,
      !!box && box.x >= 0 && box.x + box.width <= vp.width + 0.5,
      box ? `right edge ${Math.round(box.x + box.width)} against a ${vp.width} viewport` : 'no painted box',
    )

    // ---- THE DECODE. A camera's job, in software. ----
    const qrPng = await qr.screenshot({ path: join(out, `ux5-qr-${vp.label}.png`) })
    const decoded = await decodeQrPng(qrPng)
    check(
      `ux5.${vp.label}.qr.decodes`,
      !!decoded.text,
      decoded.text ? `jsQR read ${decoded.text.length} chars off the ${decoded.size} raster` : `jsQR could NOT read the ${decoded.size} raster`,
    )
    check(
      `ux5.${vp.label}.qr.matches-uri`,
      decoded.text === uriOnPage,
      decoded.text === uriOnPage
        ? 'the decoded string is the otpauth URI printed below it, character for character'
        : `decoded !== printed URI (decoded ${JSON.stringify((decoded.text ?? '').slice(0, 60))})`,
    )

    const decodedSecret = decoded.text
      ? (new URL(decoded.text.replace('otpauth://', 'https://')).searchParams.get('secret') ?? '')
      : ''
    check(
      `ux5.${vp.label}.qr.secret-matches`,
      decodedSecret !== '' && decodedSecret === secretOnPage,
      decodedSecret === secretOnPage
        ? 'the secret inside the QR is the secret printed beside it'
        : `QR secret !== printed secret`,
    )

    // ---- no overflow at this width (the UX6 standard) ----
    const widths = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }))
    check(
      `ux5.${vp.label}.no-overflow`,
      widths.scrollWidth <= widths.innerWidth,
      `scrollWidth ${widths.scrollWidth} against innerWidth ${widths.innerWidth}`,
    )

    /*
     * THE SHELL MUST REACH THE BOTTOM OF THE DOCUMENT.
     *
     * Read off the 390 capture by eye, then measured here rather than judged
     * from a picture. The admin chrome paints its own dark background on a
     * `min-h-screen` wrapper; if the document is taller than that wrapper, the
     * strip below it falls through to whatever the root layout paints, and on a
     * phone that is the bit of the page a thumb rests on.
     */
    const shell = await page.evaluate(() => {
      const el = document.querySelector('main')?.closest('div.min-h-screen') ?? null
      const doc = document.documentElement
      const bottom = el ? Math.round(el.getBoundingClientRect().bottom + window.scrollY) : null
      // When it fails, SAY WHAT IS DOWN THERE. A measurement that reports a gap
      // and cannot name the thing making it sends the next reader guessing.
      const below =
        bottom === null
          ? []
          : [...document.querySelectorAll('body *')]
              .filter((n) => {
                const r = n.getBoundingClientRect()
                return r.height > 0 && Math.round(r.bottom + window.scrollY) > bottom + 1
              })
              .slice(0, 6)
              .map((n) => {
                const r = n.getBoundingClientRect()
                return `${n.tagName.toLowerCase()}${n.className ? '.' + String(n.className).split(/\s+/).slice(0, 3).join('.') : ''} h=${Math.round(r.height)} bottom=${Math.round(r.bottom + window.scrollY)}`
              })
      return {
        docHeight: doc.scrollHeight,
        shellBottom: bottom,
        bodyBackground: getComputedStyle(document.body).backgroundColor,
        below,
      }
    })
    check(
      `ux5.${vp.label}.shell.covers-the-document`,
      shell.shellBottom !== null && shell.shellBottom >= shell.docHeight - 1,
      shell.shellBottom === null
        ? 'the admin shell wrapper was not found'
        : `shell ends at ${shell.shellBottom}, document is ${shell.docHeight} tall (body paints ${shell.bodyBackground})${shell.below.length ? ' | below it: ' + shell.below.join(' ;; ') : ''}`,
    )

    await page.screenshot({ path: join(out, `ux5-enrol-${vp.label}.png`), fullPage: true })

    // ---- accessibility ----
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    const bad = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    check(
      `ux5.${vp.label}.axe`,
      bad.length === 0,
      bad.length === 0
        ? `0 serious/critical (${axe.violations.length} total at any impact)`
        : bad.map((v) => `${v.id}(${v.nodes.length})`).join(', '),
    )

    // ---- THE ENROLMENT ITSELF, using a code derived from the DECODED QR ----
    /*
     * WAIT FOR HYDRATION, ON A REAL SIGNAL. The form carries method="post" so
     * that it degrades, which means a click landed before React attaches fires
     * a NATIVE post to this URL and the run reports a refusal that is entirely
     * the harness's impatience. The login step can use "the submit button
     * stopped being disabled" as its proxy; this button is never disabled, so
     * there is no proxy here. React's own fiber key on the element is the fact.
     */
    await page
      .waitForFunction(
        () => {
          const el = document.querySelector('form')
          return (
            !!el &&
            Object.keys(el).some((k) => k.startsWith('__reactFiber$') || k.startsWith('__reactProps$'))
          )
        },
        undefined,
        { timeout: 30000 },
      )
      .catch(() => {})
    const hydrated = await page.evaluate(() => {
      const el = document.querySelector('form')
      return (
        !!el && Object.keys(el).some((k) => k.startsWith('__reactFiber$') || k.startsWith('__reactProps$'))
      )
    })
    check(
      `ux5.${vp.label}.form.hydrated`,
      hydrated,
      hydrated ? 'the enrolment form is interactive before it is used' : 'the form never hydrated, so the click below would be a native POST',
    )

    const codeToType = totpAt(decodedSecret || secretOnPage, Date.now())
    await page.locator('input[name="code"]').fill(codeToType)
    const verify = page.locator('form button[type="submit"]')
    await verify.click()
    await page
      .waitForFunction(
        () => /Save your recovery codes/i.test(document.body.innerText),
        undefined,
        { timeout: 60000 },
      )
      .catch(() => {})
    const bodyText = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
    const accepted = /Save your recovery codes/i.test(bodyText)
    check(
      `ux5.${vp.label}.enrol.accepted`,
      accepted,
      accepted
        ? 'a TOTP computed from the QR was accepted by the real enrolment form'
        : `the form refused the code: ${bodyText.slice(0, 160)}`,
    )
    await page.screenshot({ path: join(out, `ux5-recovery-${vp.label}.png`), fullPage: true })

    if (accepted) {
      /*
       * SCOPED TO THE RECOVERY SECTION, and matched on the REAL code format.
       *
       * The first version of this read every `ul li` on the page and filtered
       * on "at least 8 characters, no spaces". The admin shell's own navigation
       * is a `ul` of `li`, and half its labels are single words longer than
       * eight characters, so the count moved with the viewport: 14 at 390 and 4
       * at 1440, against 10 written to the row. That is a harness reading the
       * furniture, and it accused the product of losing recovery codes it had
       * stored correctly. The format comes from `formatRecoveryCode`: base32,
       * lowercased, grouped 4-3-3.
       */
      const recovery = await page
        .locator('section', { has: page.getByRole('heading', { name: /recovery codes/i }) })
        .locator('li')
        .allInnerTexts()
      const codesShown = recovery.filter((t) => /^[a-z2-7]{4}-[a-z2-7]{3}-[a-z2-7]{3}$/.test(t.trim()))
      check(
        `ux5.${vp.label}.recovery.shown`,
        codesShown.length > 0,
        `${codesShown.length} recovery code(s) shown once`,
      )
      const after = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }))
      check(
        `ux5.${vp.label}.recovery.no-overflow`,
        after.scrollWidth <= after.innerWidth,
        `scrollWidth ${after.scrollWidth} against innerWidth ${after.innerWidth}`,
      )

      // The database is the witness, not the screen.
      const { data: row } = await db
        .from('admin_users')
        .select('totp_secret_encrypted, totp_enrolled_at, totp_recovery_codes_hashed')
        .eq('id', admin.id)
        .maybeSingle()
      check(
        `ux5.${vp.label}.enrol.persisted`,
        !!row?.totp_secret_encrypted && !!row?.totp_enrolled_at,
        row?.totp_enrolled_at
          ? `admin_users row carries an encrypted secret, enrolled at ${row.totp_enrolled_at}`
          : 'the admin_users row was NOT updated',
      )
      check(
        `ux5.${vp.label}.enrol.recovery-persisted`,
        (row?.totp_recovery_codes_hashed ?? []).length === codesShown.length,
        `${(row?.totp_recovery_codes_hashed ?? []).length} hashed on the row against ${codesShown.length} shown`,
      )

      // ---- the route refuses re-entry once enrolled ----
      await page.goto(`${BASE}/admin/enrol-2fa`, { waitUntil: 'domcontentloaded', timeout: 60000 })
      const afterPath = new URL(page.url()).pathname
      check(
        `ux5.${vp.label}.enrol.refuses-re-entry`,
        afterPath === '/admin',
        `an enrolled admin returning to /admin/enrol-2fa lands on ${afterPath}`,
      )

      /*
       * THE PAGE'S OTHER PROMISE, DRIVEN ONCE.
       *
       * This screen tells an administrator "Each code works once if you lose
       * your authenticator", and those ten codes are the entire escape route
       * from a locked admin console. A page that hands somebody a lifeline it
       * has never tested is the same defect as a page that says "scan this" and
       * draws nothing, one layer further in.
       *
       * Driven from a FRESH CONTEXT, because "I lost my phone" means a browser
       * that has never signed in here. Once at 1440 only: this is a question
       * about behaviour, not about layout, and the layout is measured above at
       * all three widths.
       */
      if (vp.label === '1440' && codesShown.length > 0) {
        const oneCode = codesShown[0].trim()
        for (const attempt of ['first', 'second']) {
          const fresh = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-AU' })
          const freshPage = await fresh.newPage()
          await freshPage.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded', timeout: 120000 })
          await freshPage.locator('input[name="email"]').fill(admin.email)
          await freshPage.locator('input[name="password"]').fill(admin.password)
          await freshPage.getByRole('button', { name: /use recovery code/i }).click()
          await freshPage.locator('input[name="recovery"]').fill(oneCode)
          const go = freshPage.locator('button[type="submit"]')
          await freshPage.waitForFunction(
            () => !document.querySelector('button[type="submit"]')?.disabled,
            undefined,
            { timeout: 30000 },
          )
          await go.click()
          await Promise.race([
            freshPage.waitForURL((u) => !u.pathname.endsWith('/admin/login'), { timeout: 60000 }).catch(() => {}),
            freshPage
              .waitForFunction(
                () =>
                  [...document.querySelectorAll('[role=alert]')].some(
                    (e) => (e.textContent ?? '').trim().length > 0,
                  ),
                undefined,
                { timeout: 60000 },
              )
              .catch(() => {}),
          ])
          const landedOn = new URL(freshPage.url()).pathname
          const signedIn = !landedOn.endsWith('/admin/login')
          if (attempt === 'first') {
            check(
              'ux5.recovery.code-works-once.first-use',
              signedIn,
              signedIn
                ? `a recovery code from the enrolment screen signed the admin in, landing on ${landedOn}`
                : 'the recovery code the page handed out did not work',
            )
          } else {
            check(
              'ux5.recovery.code-works-once.second-use-refused',
              !signedIn,
              signedIn
                ? `the SAME recovery code was accepted a second time, landing on ${landedOn}; the page promises it works once`
                : 'the same code was refused the second time, as the page promises',
            )
          }
          await freshPage.screenshot({ path: join(out, `ux5-recovery-${attempt}-use.png`), fullPage: true })
          await fresh.close()
        }
      }
    }

    report.viewports[vp.label] = { uriOnPage, secretOnPage, decoded: decoded.text, raster: decoded.size }
    await ctx.close()
  }

  /*
   * THE OTHER HALF OF THE CLEARANCE FIX, DRIVEN.
   *
   * Withdrawing the reservation where the bar is absent is only half a change.
   * The half that can go wrong silently is the PUBLIC site, where the bar IS
   * drawn and the footer is pulled down over the strip it reserves. If the
   * withdrawal reached those pages too, the bar would sit on the last row of
   * the footer and nothing above would have noticed. So both directions are
   * measured, on a real page, at the width where it matters.
   */
  for (const scenario of [
    // The bar is in the DOM on every public page and hidden by CSS above `md`,
    // so PRESENT and VISIBLE are different questions and both are asked. The
    // reservation follows presence, because that is what the layout can know.
    { label: 'public-390', path: '/', width: 390, height: 844, expectBar: true, expectVisible: true, expectPadding: 64 },
    { label: 'public-1440', path: '/', width: 1440, height: 1000, expectBar: true, expectVisible: false, expectPadding: 0 },
    { label: 'admin-390', path: '/admin/login', width: 390, height: 844, expectBar: false, expectVisible: false, expectPadding: 0 },
  ]) {
    const ctx = await browser.newContext({
      viewport: { width: scenario.width, height: scenario.height },
      locale: 'en-AU',
      isMobile: scenario.width < 768,
      hasTouch: scenario.width < 1024,
    })
    const page = await ctx.newPage()
    await page.goto(`${BASE}${scenario.path}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {})
    const m = await page.evaluate(() => {
      const wrapper = document.getElementById('main-content')
      const bar = document.querySelector('nav[aria-label="Primary"]')
      const doc = document.documentElement
      return {
        barPresent: !!bar,
        barVisible: !!bar && getComputedStyle(bar).display !== 'none',
        paddingBottom: wrapper ? Math.round(parseFloat(getComputedStyle(wrapper).paddingBottom)) : null,
        docHeight: doc.scrollHeight,
        wrapperBottom: wrapper
          ? Math.round(wrapper.getBoundingClientRect().bottom + window.scrollY)
          : null,
      }
    })
    check(
      `ux5.clearance.${scenario.label}.bar`,
      m.barPresent === scenario.expectBar && m.barVisible === scenario.expectVisible,
      `the mobile bar is ${m.barPresent ? 'in the DOM' : 'absent'} and ${m.barVisible ? 'visible' : 'not visible'} on ${scenario.path} at ${scenario.width}`,
    )
    check(
      `ux5.clearance.${scenario.label}.reservation`,
      m.paddingBottom === scenario.expectPadding,
      `#main-content reserves ${m.paddingBottom}px, expected ${scenario.expectPadding}px`,
    )
    check(
      `ux5.clearance.${scenario.label}.no-pale-band`,
      m.wrapperBottom !== null && m.wrapperBottom >= m.docHeight - 1,
      `content ends at ${m.wrapperBottom}, document is ${m.docHeight} tall`,
    )
    await page.screenshot({ path: join(out, `ux5-clearance-${scenario.label}.png`), fullPage: true })
    await ctx.close()
  }
} finally {
  if (browser) await browser.close()
  for (const id of created) {
    await db.from('admin_users').delete().eq('id', id)
    await db.from('profiles').delete().eq('id', id)
    await db.auth.admin.deleteUser(id).catch(() => {})
  }
  console.log(`\n  cleaned up ${created.length} fixture admin account(s)`)
}

report.finishedAt = new Date().toISOString()
report.checks = checks
report.failures = failures
writeFileSync(join(out, 'ux5-drive-report.json'), JSON.stringify(report, null, 2))

console.log(`\n${checks.filter((c) => c.ok).length} of ${checks.length} checks passed`)
if (failures.length) {
  console.error(`FAIL: ${failures.length} check(s) failed`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log('UX5: PASS')
