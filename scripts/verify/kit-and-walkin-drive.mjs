/**
 * TWO OF WINDOW 3's CAR 5 CHANGES, DRIVEN ON A BUILD AGAINST TEST (29 October 2026):
 *
 *   1. /kit/<piece>/<n>, an approved partner kit's slide at a public address (window 6's message 7): an approved kit's
 *      slide answers 200, a 1080 x 1920 JPEG, public, cached an hour at most, never indexed; an unapproved kit and a
 *      malformed address answer 404.
 *   2. The walk-in page at 390 x 844: the cover credit 'Photo: <credit>' and the gallery heading are visible on a phone
 *      (the project manager's 15:56: a past festival's photographs say so wherever they are drawn).
 *
 *   node <a wrapper that loads a TEST env file as plain environment> scripts/verify/kit-and-walkin-drive.mjs --serve --port=3310
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for TEST (vkapkibzokmfaxqogypq), a production build in
 * this tree (next build) when --serve is given, and Playwright's chromium. WRITES TO TEST ONE ROW, said here so it is
 * never a surprise: an approval of one partner kit's newest version in this week's campaign (social_piece_approvals,
 * the row Lawal's press writes; approvals are append-only, so it stays, and the drive prints which). Every request names
 * itself a crawler. Evidence: DRIVE_OUT (default C:\dev\EVIDENCE\CREATIVE-ENGINE-28OCT\kit-walkin-drive).
 */
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { startGateServer, envFor } from '../ops/pre-push-gate.mjs'
import { refuseUnlessThePortIsFree } from './lib/port-is-ours.mjs'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'

assertNotProduction()
const TAG = '[kit-walkin]'
const args = process.argv.slice(2)
const SERVE = args.includes('--serve')
const PORT = Number(args.find((a) => a.startsWith('--port='))?.split('=')[1] ?? 3310)
const OUT = process.env.DRIVE_OUT ?? join('C:', 'dev', 'EVIDENCE', 'CREATIVE-ENGINE-28OCT', 'kit-walkin-drive')
const UA = 'EventLinqs-QA-crawler (kit-and-walkin-drive)'
let BASE = `http://127.0.0.1:${PORT}`
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!/vkapkibzokmfaxqogypq/.test(URL_) || /gndnldyfudbytbboxesk/.test(URL_) || !SERVICE) throw new Error('TEST only: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for vkapkibzokmfaxqogypq')
const db = createClient(URL_, SERVICE, { auth: { persistSession: false } })

const results = []
let failures = 0
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail })
  if (!ok) failures++
  console.log(`${TAG} ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' - ' + detail : ''}`)
}
function jpegSize(buf) {
  let i = 2
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) return null
    const marker = buf[i + 1]
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)]
    i += 2 + buf.readUInt16BE(i + 2)
  }
  return null
}

let stopServer = null
let browser = null
const evidence = { startedAt: new Date().toISOString() }
try {
  mkdirSync(OUT, { recursive: true })
  /* Two partner kits of this week's campaign: one to approve, one left unapproved. */
  const { data: kits, error } = await db.from('social_pieces').select('id, partner_name, social_piece_revisions(version), social_piece_approvals(revision)').eq('kind', 'partner_kit').order('planned_at', { ascending: false }).limit(50)
  if (error) throw new Error(`the kits could not be read: ${error.message}`)
  const newest = (k) => Math.max(...k.social_piece_revisions.map((r) => r.version))
  const unapproved = kits.filter((k) => !k.social_piece_approvals.some((a) => a.revision === newest(k)))
  const alreadyApproved = kits.find((k) => k.social_piece_approvals.some((a) => a.revision === newest(k))) ?? null
  if (unapproved.length < (alreadyApproved ? 1 : 2)) throw new Error('TEST holds too few unapproved partner kits')
  /* A kit an earlier run approved is used again, so a re-drive writes nothing new. */
  const toApprove = alreadyApproved ?? unapproved[0]
  const leftAlone = unapproved.find((k) => k.id !== toApprove.id)
  if (alreadyApproved) {
    check('a TEST partner kit already approved is used (nothing written)', true, `${toApprove.id} (${toApprove.partner_name}), version ${newest(toApprove)}`)
  } else {
    const { data: admin } = await db.from('admin_users').select('id').limit(1).single()
    const approved = await db.from('social_piece_approvals').insert({ piece_id: toApprove.id, revision: newest(toApprove), approved_by: admin.id, approved_at: new Date().toISOString() })
    check('one TEST partner kit approved for the drive (the row Lawal\u2019s press writes)', !approved.error, approved.error?.message ?? `${toApprove.id} (${toApprove.partner_name}), version ${newest(toApprove)}`)
  }
  evidence.approved = { piece: toApprove.id, partner: toApprove.partner_name, version: newest(toApprove), writtenThisRun: !alreadyApproved }
  evidence.unapproved = { piece: leftAlone.id, partner: leftAlone.partner_name }

  if (SERVE) {
    await refuseUnlessThePortIsFree(PORT, 'before the kit and walk-in drive server was started', 'pass --port= for one this window owns')
    mkdirSync('.tmp', { recursive: true })
    const started = await startGateServer(envFor('local'), '.tmp/kit-walkin-server.log', { port: PORT })
    if (started.error) throw new Error(`could not serve the build: ${started.error}`)
    BASE = started.base
    stopServer = started.stop
  }

  /* 1. /kit */
  const get = (path) => fetch(`${BASE}${path}`, { headers: { 'user-agent': UA } })
  const ok = await get(`/kit/${toApprove.id}/1`)
  const bytes = Buffer.from(await ok.arrayBuffer())
  const size = jpegSize(bytes)
  writeFileSync(join(OUT, 'kit-approved-1.jpg'), bytes)
  check('/kit: the approved kit\u2019s slide answers 200 as a JPEG', ok.status === 200 && ok.headers.get('content-type') === 'image/jpeg', `${ok.status} ${ok.headers.get('content-type')}`)
  check('/kit: it is the story slide at 1080 x 1920', size !== null && size[0] === 1080 && size[1] === 1920, JSON.stringify(size))
  check("/kit: public, an hour at most, never indexed", /^public/.test(ok.headers.get('cache-control') ?? '') && /s-maxage=3600/.test(ok.headers.get('cache-control') ?? '') && /noindex/.test(ok.headers.get('x-robots-tag') ?? ''), `${ok.headers.get('cache-control')} | ${ok.headers.get('x-robots-tag')}`)
  for (const [label, path] of [['an unapproved kit', `/kit/${leftAlone.id}/1`], ['a slide past the kit', `/kit/${toApprove.id}/2`], ['a malformed address', '/kit/not-a-piece/1']]) {
    const res = await get(path)
    check(`/kit: ${label} answers 404`, res.status === 404, `${res.status} at ${path}`)
  }

  /* 2. The walk-in page at 390 */
  browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, userAgent: `Mozilla/5.0 (iPhone) ${UA}` })
  const page = await context.newPage()
  const res = await page.goto(`${BASE}/events/amcf-2026`, { waitUntil: 'networkidle', timeout: 180000 })
  check('the AMCF walk-in page answers on TEST', res?.status() === 200, String(res?.status()))
  await page.screenshot({ path: join(OUT, 'amcf-2026-390-first-screen.png') })
  await page.screenshot({ path: join(OUT, 'amcf-2026-390-full.png'), fullPage: true })
  const credit = page.locator('figcaption', { hasText: 'Photo:' }).first()
  const creditText = (await credit.count()) > 0 ? ((await credit.textContent()) ?? '').trim() : ''
  check('on a phone the cover credit is visible and says the festival is past', creditText !== '' && (await credit.isVisible()) && /past/i.test(creditText), creditText || 'no cover credit on this TEST page')
  const heading = page.locator('h2', { hasText: /past festival/i }).first()
  const headingText = (await heading.count()) > 0 ? ((await heading.textContent()) ?? '').trim() : ''
  check('on a phone the gallery heading is visible and says so', headingText !== '' && (await heading.isVisible()), headingText || 'no gallery heading on this TEST page')
  const fit = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }))
  check('nothing wider than the phone', fit.scroll <= fit.inner + 1, `scrollWidth ${fit.scroll}, innerWidth ${fit.inner}`)
  await context.close()
} catch (error) {
  check('the drive ran to its end', false, error.message)
} finally {
  if (browser) await browser.close().catch(() => {})
  if (stopServer) await stopServer()
}
evidence.results = results
writeFileSync(join(OUT, 'drive.json'), JSON.stringify(evidence, null, 2))
console.log(`${TAG} ${failures === 0 ? 'DRIVE PASSED' : `DRIVE FAILED, ${failures} of ${results.length}`}; TEST row written: ${evidence.approved?.writtenThisRun ? `an approval of ${evidence.approved.piece}` : "none (an approval of an earlier run reused)"}`)
process.exitCode = failures === 0 ? 0 : 1
