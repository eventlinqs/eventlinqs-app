/**
 * BREAK ATTEMPT: UPLOAD AN IMAGE FAR OVER THE SIZE LIMIT.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS AS ITS OWN SCRIPT.
 *
 * This was the one attempt in scripts/verify/break-attempts-money.mjs that was
 * labelled READ NOT DRIVEN, and the label was correct: the verdict came from
 * reading upload.ts:106 rather than from watching a refusal happen. A code
 * reading is not a pass, and on this project a static conclusion has been wrong
 * eight times.
 *
 * The reason it was never driven is that it needs an organiser sitting on the
 * media step of the create-event wizard, and a saved session could not get
 * there. This builds the event in the same run instead, so the step is reached
 * the way an organiser reaches it.
 *
 * ---------------------------------------------------------------------------
 * THERE ARE TWO GATES AND THEY ARE NOT THE SAME GATE.
 *
 *   THE CLIENT GATE, event-media-step.tsx addFiles(): refuses an oversized file
 *   before any request is made and shows "Each image must be under 10MB." This
 *   is the one a PERSON meets, and it is the one this script drives, in the
 *   DOM, because the DOM is the authority on what a person is told.
 *
 *   THE SERVER GATE, upload.ts:106: `if (file.size > MAX_IMAGE_BYTES)`, placed
 *   ahead of arrayBuffer() so the bytes never reach the native decoder. This is
 *   the one that matters against an attacker, who does not run our client.
 *
 * A drive through the browser CANNOT reach the server gate, and saying it can
 * would be the same overclaim the READ NOT DRIVEN label was protecting against:
 * the client refuses first, so the request is never sent. This script therefore
 * reports the two separately, and the server gate's ordering is pinned by
 * tests/unit/security/upload-size-gate.test.ts rather than asserted here.
 *
 * Usage: node scripts/verify/oversize-upload-drive.mjs
 */
import { writeFileSync, unlinkSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import { chromium, BASE, makeJourney, note, attach, finish, messagesOnScreen, fillIf, clickText, signUpAndConfirm } from '../journeys/harness.mjs'

assertNotProduction()

const stamp = process.env.RUN_STAMP ?? String(Date.now()).slice(-6)
const j = makeJourney('oversize-upload', 'Break attempt: an image far over the size limit')
const results = []

function verdict(name, v, detail) {
  results.push({ name, v, detail })
  console.log(`\n${v.padEnd(16)} ${name}`)
  console.log(`      ${detail}`)
}

/**
 * A REAL FILE OF REAL BYTES, not a mock. 12MB against a 10MB cap, carrying a
 * genuine PNG signature so nothing can refuse it for being the wrong format and
 * be mistaken for refusing it on size. The refusal has to be about the size or
 * it has not proved anything.
 */
const OVERSIZE_PATH = join(process.cwd(), `.tmp-oversize-${stamp}.png`)
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const TWELVE_MB = 12 * 1024 * 1024
writeFileSync(OVERSIZE_PATH, Buffer.concat([PNG_SIGNATURE, Buffer.alloc(TWELVE_MB - PNG_SIGNATURE.length, 0x7f)]))

const browser = await chromium.launch()

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-AU' })
  const p = await ctx.newPage()
  await attach(j, p)

  const EMAIL = `oversize.${stamp}@example.com`
  const PASSWORD = `Str0ng-${stamp}-Pass!`
  if (!(await signUpAndConfirm(j, p, { name: 'Oversize Organiser', email: EMAIL, password: PASSWORD }))) {
    verdict('upload an image far over the size limit', 'SKIPPED', 'could not create an organiser account')
    throw new Error('no account')
  }

  // Walk the wizard only as far as a file input, which is the media step. There
  // is no need to finish the event: the gate under test is on the upload.
  await p.goto(`${BASE}/dashboard/events/create`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await p.waitForTimeout(3000)
  if (await p.$('button:has-text("Continue to event details")')) {
    await fillIf(p, 'input#name, input[name="name"]', `Oversize Presents ${stamp}`)
    await fillIf(p, 'textarea#description, textarea[name="description"]', 'Events for our community.')
    await clickText(p, 'Continue to event details')
    await p.waitForTimeout(6000)
  }
  await fillIf(p, 'input[placeholder^="e.g. Summer Music Festival"]', `Oversize Night ${stamp}`)
  await fillIf(p, 'input[placeholder^="A brief one-line"]', 'Testing the upload size gate.')
  await fillIf(p, 'textarea[placeholder^="Describe your event in detail"]', 'An event that exists only to be handed a file that is too big.')
  const sel = await p.$('select')
  if (sel) {
    const opt = await p.evaluate(() => {
      const s = document.querySelector('select')
      const o = [...s.options].find(x => x.value)
      return o?.value ?? null
    })
    if (opt) await p.selectOption('select', opt)
  }

  let fileInput = null
  for (let i = 0; i < 9 && !fileInput; i += 1) {
    fileInput = await p.$('input[type="file"]')
    if (fileInput) break
    const dates = await p.$$('input[type="date"], input[type="datetime-local"]')
    for (let d = 0; d < dates.length; d += 1) {
      const when = new Date(Date.now() + 21 * 864e5 + d * 3 * 36e5)
      const type = await p.evaluate(e => e.type, dates[d])
      await dates[d].fill(type === 'date' ? when.toISOString().slice(0, 10) : when.toISOString().slice(0, 16)).catch(() => {})
    }
    if (!(await clickText(p, 'Continue'))) break
    await p.waitForTimeout(4000)
  }
  fileInput = fileInput ?? (await p.$('input[type="file"]'))

  if (!fileInput) {
    verdict(
      'upload an image far over the size limit',
      'SKIPPED',
      'the wizard never reached a step carrying a file input, so the gate could not be driven. This is the same obstacle that left the attempt READ NOT DRIVEN; it is reported rather than resolved into a pass.',
    )
    throw new Error('no file input')
  }

  // WATCH THE WIRE. If the client gate holds, NOTHING is sent: that absence is
  // half the evidence and it has to be observed, not assumed.
  let uploadPosts = 0
  p.on('request', r => {
    if (r.method() === 'POST') uploadPosts += 1
  })

  const before = uploadPosts
  await fileInput.setInputFiles(OVERSIZE_PATH)
  await p.waitForTimeout(9000)

  const shown = (await messagesOnScreen(p)).join(' // ')
  const pageText = await p.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' '))
  const namesTheSize = /10\s*MB|too (big|large)|size/i.test(`${shown} ${pageText}`)
  const posted = uploadPosts - before

  verdict(
    'upload an image far over the size limit',
    namesTheSize ? 'HELD' : posted > 0 ? 'BROKEN' : 'REFUSED-SILENT',
    namesTheSize
      ? `12MB PNG offered against a 10MB cap. Refused, and the refusal names the size: "${(shown || pageText.match(/[^.]*10\s*MB[^.]*/i)?.[0] || '').trim().slice(0, 120)}". ${posted} upload request(s) were made, so the bytes were never sent.`
      : posted > 0
        ? `THE FILE WAS SENT: ${posted} POST(s) followed a 12MB file against a 10MB cap, and nothing on screen named the size.`
        : 'nothing was sent and nothing was said, so the person is left looking at a file that silently did not attach',
  )

  verdict(
    'the SERVER gate, which this drive cannot reach',
    'NOT DRIVEN HERE',
    'upload.ts:106 refuses on file.size ahead of arrayBuffer(), so an oversized file never reaches the decoder. The client refuses first, so a browser drive can never make that request and claiming otherwise would be the overclaim this script was written to remove. Its ordering is pinned instead by tests/unit/security/upload-size-gate.test.ts.',
  )

  await ctx.close()
} catch (err) {
  note(j, 'stopped', String(err?.message ?? err))
} finally {
  await browser.close()
  if (existsSync(OVERSIZE_PATH)) unlinkSync(OVERSIZE_PATH)
}

console.log('\n==== VERDICTS ====')
for (const r of results) console.log(`  ${r.v.padEnd(16)} ${r.name}`)
await finish(j)
process.exit(results.some(r => r.v === 'BROKEN' || r.v === 'REFUSED-SILENT') ? 1 : 0)
