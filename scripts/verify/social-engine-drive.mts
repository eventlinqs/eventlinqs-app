/**
 * ITEM 11 ON TEST: the social engine's real store against the TEST database (never production), on TEST's own events.
 *
 *   node --env-file=<a TEST env file> node_modules/tsx/dist/cli.mjs scripts/verify/social-engine-drive.mts <out dir>
 *
 * tsx loads src as CommonJS, which scripts/lib/server-only-shim.mjs (an ESM hook) never sees, so the drive points the
 * build markers server-only and client-only at the repo's own empty stub, as vitest.config.ts does, before src loads.
 *
 * It plans the week, reads the posts back, changes one post's words (a stray number refused, then kept), approves it,
 * finds the next feed post held by the gap, records the post, counts one arrival through its own link and none
 * through another, renders its card as the JPEG Instagram takes, and prints every row it made so
 * scripts/verify/social-engine-drive-cleanup.sql removes them. Each check prints PASS or FAIL; the last line is the
 * verdict.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import Module from 'node:module'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import QRCode from 'qrcode'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import { createClient } from '@supabase/supabase-js'
import type * as StoreModule from '@/lib/social/store'
import type * as CardsModule from '@/lib/broadcast/social-cards'
import type * as KitModule from '@/lib/broadcast/kit-artefacts'
import type * as FetchModule from '@/lib/media/fetch-image'

const EMPTY = fileURLToPath(new URL('../../tests/stubs/empty.ts', import.meta.url))
const cjs = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string }
const resolveFilename = cjs._resolveFilename
cjs._resolveFilename = (request: string, ...rest: unknown[]) =>
  request === 'server-only' || request === 'client-only' ? EMPTY : resolveFilename(request, ...rest)

/* src is CommonJS to tsx; read each module's exports whichever way the loader hands them over. */
const storeMod = (await import('@/lib/social/store')) as typeof StoreModule & { default?: typeof StoreModule }
const cardsMod = (await import('@/lib/broadcast/social-cards')) as typeof CardsModule & { default?: typeof CardsModule }
const kitMod = (await import('@/lib/broadcast/kit-artefacts')) as typeof KitModule & { default?: typeof KitModule }
const fetchMod = (await import('@/lib/media/fetch-image')) as typeof FetchModule & { default?: typeof FetchModule }
const fetchImageBytes = fetchMod.fetchImageBytes ?? fetchMod.default!.fetchImageBytes
const store = (storeMod.default ?? storeMod) as typeof StoreModule
const cards = (cardsMod.default ?? cardsMod) as typeof CardsModule
const kit = (kitMod.default ?? kitMod) as typeof KitModule

assertNotProduction()
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!url.includes('vkapkibzokmfaxqogypq') || url.includes('gndnldyfudbytbboxesk')) {
  console.error('social-engine-drive runs on TEST only')
  process.exit(2)
}
const out = process.argv[2] ?? 'evidence-social'
mkdirSync(out, { recursive: true })
const db = createClient(url, key, { auth: { persistSession: false } })
let fails = 0
const check = (name: string, ok: boolean, seen: unknown = null) => {
  if (!ok) fails += 1
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `: ${JSON.stringify(seen)}`}`)
}

const started = new Date()
const { data: admin } = await db.from('admin_users').select('id').limit(1).maybeSingle()
const by = admin?.id as string
check('a TEST admin to plan and approve as', Boolean(by), admin)

const before = new Set(((await db.from('social_posts').select('id').limit(5000)).data ?? []).map((r) => r.id as string))
const candidates = await store.readCandidates(db, started)
check(`TEST has events this week to post (${candidates.length})`, candidates.length > 0, candidates.length)

const planned = await store.planWeek(db, { plannedBy: by, now: started })
console.log(`planned ${planned.planned}; held ${planned.held.length}: ${planned.held.map((h) => h.reason).join(' / ')}`)
check('the week is planned', planned.planned > 0, planned)

const posts = (await store.readPosts(db, new Date())).filter((p) => !before.has(p.id))
check('every planned post is read back', posts.length === planned.planned, { posts: posts.length, planned: planned.planned })
check('each post has its own link', new Set(posts.map((p) => p.link)).size === posts.length && posts.every((p) => /^https:\/\/www\.eventlinqs\.com\.au\/e\/[0-9A-Za-z]{10}$/.test(p.link)), posts.map((p) => p.link))
const worded = posts.filter((p) => p.draft !== null)
check('the Launch Kit words carry the post link', worded.length > 0 && worded.every((p) => p.draft!.caption.includes(p.link)), worded.length)
check('two formats per event', posts.every((p) => posts.some((q) => q.eventId === p.eventId && q.format !== p.format)), null)

const again = await store.planWeek(db, { plannedBy: by, now: new Date() })
check('planning again plans nothing twice', again.planned === 0, again)

const feed = posts.filter((p) => p.format === 'feed' && p.draft !== null)
const p = feed[0]
writeFileSync(join(out, 'post-words.txt'), `${p.eventTitle}\n\n${p.draft!.caption}\n`)
const stray = await store.writeDraft(db, { postId: p.id, caption: `Only 9137 left. ${p.link}`, by, now: new Date() })
check('a stray number is refused in its own words', stray.state === 'refused' && /9137/.test(stray.reason), stray)
const kept = await store.writeDraft(db, { postId: p.id, caption: `${p.draft!.caption}\n\nSee you there.`, by, now: new Date() })
check('a person’s words are kept as version 2', kept.state === 'done', kept)
const v2 = (await store.readPosts(db, new Date())).find((x) => x.id === p.id)!
check('the newest version is 2, by a person', v2.draft?.version === 2 && v2.draft.writtenBy === 'person', v2.draft)

const approved = await store.approveDraft(db, { draftId: v2.draft!.id, by, now: new Date() })
check('the newest words are approved', approved.state === 'done', approved)
const second = feed[1]
if (second) {
  const held = await store.approveDraft(db, { draftId: second.draft!.id, by, now: new Date() })
  check('the next feed post waits for the gap', held.state === 'refused' && /waits until/.test(held.reason), held)
}
const went = await store.recordPosting(db, { postId: p.id, postUrl: `https://www.instagram.com/p/bp-drive-${started.getTime().toString(36)}/`, postedAt: new Date(), by, now: new Date() })
check('the post is recorded with its address', went.state === 'done', went)

await new Promise((r) => setTimeout(r, 1100))
await db.from('share_link_events').insert({ link_id: v2.shareLinkId, kind: 'click', visitor_hash: `bp-drive-${started.getTime()}` })
if (second) await db.from('share_link_events').insert({ link_id: second.shareLinkId, kind: 'click', visitor_hash: `bp-drive-${started.getTime()}-b` })
const after = (await store.readPosts(db, new Date())).find((x) => x.id === p.id)!
check('one arrival through its own link is its own, another post’s is not', after.result.arrived === 1 && after.result.tickets === 0, after.result)

const rule = await store.cadenceFor(db, 'instagram', 'feed', new Date())
check('the starting rule stands with no baseline', rule.basis === 'starting' && rule.gapHours === 12, rule)

const card = await store.cardOf(db, p.id, new Date())
check('the card reads its event and its own link', card !== null && card.link === p.link, card?.link)
if (card) {
  const cover = await fetchImageBytes(card.context.coverImageUrl)
  check("every card carries a photograph, the night's own or the library's for a listing", cover !== null, card.context.coverImageUrl)
  check('a listing card says listed, never ticketing', !card.listing || card.libraryPhoto || card.context.coverImageUrl !== null, card)
  for (const format of ['feed', 'story'] as const) {
    const prepared = cover ? await cards.prepareCardCover(cover.bytes, format) : null
    check(`the ${format} card's photograph is prepared (${prepared?.kind ?? 'none'}, from ${card.context.coverImageUrl})`, prepared !== null, null)
    const bytes = await cards.renderSocialCard(format, {
      ...kit.toCardInput(card.context, 'instagram'),
      shortUrl: card.link,
      listing: card.listing,
      libraryPhoto: card.libraryPhoto,
      cover: prepared,
      organiserLogo: null,
      qr: await QRCode.toDataURL(card.link, { errorCorrectionLevel: 'M', margin: 0, width: 480 }),
    })
    writeFileSync(join(out, `card-${format}.jpg`), bytes)
    check(`the ${format} card renders as a JPEG (${bytes.byteLength} bytes)`, bytes[0] === 0xff && bytes[1] === 0xd8, bytes.slice(0, 4))
  }
}

const made = (await store.readPosts(db, new Date())).filter((x) => !before.has(x.id))
console.log(`MADE posts ${made.map((x) => x.id).join(',')}`)
console.log(`MADE links ${made.map((x) => x.shareLinkId).join(',')}`)
console.log(`MADE since ${started.toISOString()} by ${by}`)
console.log(fails === 0 ? 'DRIVE PASSED' : `DRIVE FAILED, ${fails} check(s)`)
process.exit(fails === 0 ? 0 : 1)
