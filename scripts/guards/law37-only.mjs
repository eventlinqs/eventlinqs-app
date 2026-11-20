/**
 * GUARD: LAW 37, ONLY A PERMITTED PHOTOGRAPH SHOWN WHOLE POSTS (Lawal, 20 November 2026, 11:24, locked: 'This is the
 * format that works. Lock it in ... Both Instagram and Facebook ... I will never see that ever again'; the PM's 11:28,
 * train AI, item 3: 'THE POLICY BAR refuses any piece not in this format (a guard reading the piece's family and render
 * spec ...), drilled red').
 *
 * It holds, reading src only (comments stripped):
 *   - the earlier families stay OFF: src/lib/social/law37.ts EARLIER_FAMILIES_ON is false (law 13: only Lawal's word
 *     turns them back on), and law37Refusal refuses any slide that is not law 37's one slide;
 *   - the one validation pipeline refuses them: pieceQuality (piece-quality.ts), which approval, the standing policy,
 *     scheduling and publishing all read, pushes the [law37] refusal;
 *   - they are never drawn: the week's plan, which the hourly redraw draws from (store.ts planNow), keeps only pieces
 *     law37Refusal passes;
 *   - the photograph is drawn whole with nothing over it: renderCampaignSlide sends the photo slide to drawLaw37Photo,
 *     and the only words drawLaw37Photo draws are a story's one line, placed beneath the photograph.
 *
 * Run: node scripts/guards/law37-only.mjs
 */
import { readFileSync } from 'node:fs'
import { declareWork } from '../lib/work-report.mjs'

const TAG = '[law37-only]'
const LAW = 'src/lib/social/law37.ts'
const QUALITY = 'src/lib/social/piece-quality.ts'
const STORE = 'src/lib/social/store.ts'
const SLIDES = 'src/lib/broadcast/campaign-slides.tsx'
const PHOTO = 'src/lib/broadcast/law37-photo.tsx'
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
const read = (p) => strip(readFileSync(p, 'utf8'))
const law = read(LAW)
const quality = read(QUALITY)
const store = read(STORE)
const slides = read(SLIDES)
const photo = read(PHOTO)
const faults = []

if (!/export const EARLIER_FAMILIES_ON = false\b/.test(law)) faults.push(`${LAW}: EARLIER_FAMILIES_ON is not false, so the earlier families are back on without Lawal's word (law 13, law 37 (g))`)
if (!/export const LAW37_SLIDE = 'photo' as const/.test(law)) faults.push(`${LAW}: law 37's one slide is no longer the photograph ('photo')`)
if (!/\.filter\(\(s\) => s\.t !== LAW37_SLIDE\)/.test(law)) faults.push(`${LAW}: law37Refusal no longer refuses every slide that is not the photograph`)

const qualityBody = quality.slice(quality.indexOf('export function pieceQuality('), quality.indexOf('export function pieceCorrections('))
if (!/const law37 = law37Refusal\(input\.slides\)\s*\n\s*if \(law37\) out\.push\(`\[law37\] \$\{law37\}`\)/.test(qualityBody)) {
  faults.push(`${QUALITY}: pieceQuality, the one rule set approval, the policy, scheduling and publishing read, no longer refuses a piece outside law 37's format`)
}

const planNow = store.slice(store.indexOf('async function planNow('), store.indexOf('async function partnerLink('))
if (!/pieces: locked\.filter\(\(p\) => law37Refusal\(p\.slides\) === null\)/.test(planNow)) faults.push(`${STORE}: the week's plan (and the hourly redraw it feeds) can draw an earlier family again`)

const render = slides.slice(slides.indexOf('export async function renderCampaignSlide('))
if (!/^\s*if \(slide\.t === 'photo'\) return drawLaw37Photo\(f, slide, image\)/m.test(render.split('\n').slice(0, 4).join('\n'))) {
  faults.push(`${SLIDES}: renderCampaignSlide does not send law 37's photograph straight to drawLaw37Photo`)
}

// The only words drawLaw37Photo draws: a story's one line, beneath the photograph, never over it.
// A JSX child {slide.x}, never a template's ${slide.x} inside an error's words.
const texts = [...photo.matchAll(/(?<!\$)\{slide\.(\w+)\}/g)].map((m) => m[1])
if (texts.some((t) => t !== 'line')) faults.push(`${PHOTO}: it draws words other than a story's one line (${texts.join(', ')})`)
if (texts.includes('line') && !/top: d\.photo\.y \+ d\.photo\.height \+ \d+/.test(photo)) faults.push(`${PHOTO}: a story's line is no longer placed beneath the photograph`)

declareWork('law37-only', { did: { 'file read': 5 }, found: { fault: faults.length } })
if (faults.length > 0) {
  for (const f of faults) console.error(`${TAG} FAIL: ${f}`)
  console.error(`${TAG} FAIL - ${faults.length} way(s) a piece outside law 37's format could be drawn, approved or posted.`)
  process.exit(1)
}
console.log(`${TAG} PASS - law 37 holds: the earlier families are off, the one validation pipeline refuses any piece not a permitted photograph shown whole, the plan draws none, and the photograph is drawn whole with nothing over it.`)
