/**
 * Live verification of the Event Media Standard against the TEST project.
 *
 * Exercises the REAL pipeline code (processEventImage, parseVideoEmbed,
 * serializeGallery, moderateEventMedia) + the TEST Supabase storage + DB
 * constraints, then seeds a published event so the deployed preview can render
 * it. Every seeded row/object is flagged is_seed_data / lives under a fixed
 * prefix for cleanup (see verify-event-media-cleanup.ts).
 *
 * Run: node --conditions=react-server --env-file=.env.test --import tsx scripts/verify-event-media-standard.ts
 */
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { processEventImage } from '@/lib/media/image-pipeline'
import { parseVideoEmbed } from '@/lib/media/video-embed'
import { serializeGallery } from '@/lib/media/event-media-model'
import { moderateEventMedia } from '@/lib/media/moderation'

const PROD_REF = 'gndnldyfudbytbboxesk'
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (use --env-file=.env.test)')
if (url.includes(PROD_REF)) throw new Error(`Refusing to run against PRODUCTION (${PROD_REF})`)
const TEST_REF = 'vkapkibzokmfaxqogypq'
if (!url.includes(TEST_REF)) throw new Error(`Expected the TEST project (${TEST_REF}); got ${url}`)

const s = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const BUCKET = 'event-images'

const OWNER_EMAIL = 'media-std-organiser@eventlinqs.test'
const ORG_ID = '00000000-0000-4000-9001-000000000001'
const EVENT_ID = '00000000-0000-4000-9002-000000000001'
const TIER_ID = '00000000-0000-4000-9003-000000000001'
const SLUG = 'media-standard-proof'

const results: { name: string; verdict: 'PASS' | 'FAIL'; detail: string }[] = []
const check = (name: string, cond: boolean, detail: string) =>
  results.push({ name, verdict: cond ? 'PASS' : 'FAIL', detail })

async function jpegWithExif(w: number, h: number) {
  return sharp({ create: { width: w, height: h, channels: 3, background: { r: 30, g: 60, b: 110 } } })
    .withMetadata({ exif: { IFD0: { Copyright: 'EventLinqs Verify', Software: 'verify-script' }, GPS: { GPSLatitudeRef: 'S' } } as sharp.WriteableMetadata['exif'] })
    .jpeg()
    .toBuffer()
}
async function jpegPlain(w: number, h: number, tint: number) {
  return sharp({ create: { width: w, height: h, channels: 3, background: { r: tint, g: 120, b: 90 } } }).jpeg().toBuffer()
}

async function main() {
  // ---- 1. Organiser owner + profile + org + category -----------------------
  const created = await s.auth.admin.createUser({ email: OWNER_EMAIL, password: 'Media-Std-Pass-1!', email_confirm: true })
  if (created.error && !/already|exists|registered/i.test(created.error.message)) throw created.error
  let ownerId = created.data?.user?.id
  if (!ownerId) {
    const { data: list } = await s.auth.admin.listUsers()
    ownerId = list?.users?.find((u) => u.email === OWNER_EMAIL)?.id
  }
  if (!ownerId) throw new Error('could not resolve owner id')

  const { data: prof } = await s.from('profiles').select('id').eq('id', ownerId).maybeSingle()
  if (!prof) {
    const { error } = await s.from('profiles').insert({ id: ownerId, email: OWNER_EMAIL, full_name: 'Media Standard Organiser', display_name: 'Media Standard Organiser', is_verified: true })
    if (error) throw error
  }
  let categoryId: string
  const { data: cat } = await s.from('event_categories').select('id').limit(1).maybeSingle()
  if (cat) categoryId = cat.id
  else {
    const { data: ins, error } = await s.from('event_categories').insert({ name: 'Music', slug: 'music' }).select('id').single()
    if (error) throw error
    categoryId = ins.id
  }
  const { data: org } = await s.from('organisations').select('id').eq('id', ORG_ID).maybeSingle()
  if (!org) {
    const { error } = await s.from('organisations').insert({ id: ORG_ID, name: 'Media Standard Test Org', slug: 'media-standard-test-org', owner_id: ownerId, status: 'active', payout_status: 'active', stripe_charges_enabled: true, email: OWNER_EMAIL })
    if (error) throw error
  }
  const prefix = `${ownerId}/${EVENT_ID}`

  // ---- 2. Process + upload real images through the REAL pipeline -----------
  async function processAndUpload(buf: Buffer, role: 'cover' | 'gallery', name: string) {
    const r = await processEventImage(buf, { role })
    if (!r.ok) throw new Error(`pipeline rejected a valid ${role}: ${r.error}`)
    const objectName = `${prefix}/${name}.${r.image.ext}`
    const up = await s.storage.from(BUCKET).upload(objectName, r.image.buffer, { contentType: r.image.contentType, upsert: true, cacheControl: '31536000' })
    if (up.error) throw new Error(`upload ${name}: ${up.error.message}`)
    const { data } = s.storage.from(BUCKET).getPublicUrl(objectName)
    return { url: data.publicUrl, blur: r.image.blurDataURL, objectName, width: r.image.width, height: r.image.height, ext: r.image.ext, contentType: r.image.contentType }
  }

  const coverSrc = await jpegWithExif(1920, 1080)
  const cover = await processAndUpload(coverSrc, 'cover', 'cover')
  check('Cover processed + uploaded to TEST', !!cover.url && cover.width === 1920, `${cover.url} (${cover.width}x${cover.height}, ${cover.contentType})`)

  const gallery = []
  for (let i = 0; i < 4; i++) {
    const g = await processAndUpload(await jpegPlain(1600, 900, 40 + i * 40), 'gallery', `gallery-${i + 1}`)
    gallery.push({ url: g.url, alt: `Gallery image ${i + 1}`, blur: g.blur })
  }
  check('4 gallery images processed + uploaded to TEST', gallery.length === 4, gallery.map((g) => g.url.split('/').pop()).join(', '))

  // ---- 3. Pipeline rejections (real code) ---------------------------------
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/><script>alert(1)</script></svg>')
  check('SVG / active content rejected', !(await processEventImage(svg, { role: 'gallery' })).ok, 'SVG buffer refused by magic-byte path')
  check('Oversize (>4000px) rejected', !(await processEventImage(await jpegPlain(4200, 1000, 10), { role: 'gallery' })).ok, '4200x1000 refused')
  const tiny = await jpegPlain(800, 450, 10)
  check('Under-size COVER rejected', !(await processEventImage(tiny, { role: 'cover' })).ok, '800x450 refused as cover')
  check('Same under-size image OK as GALLERY', (await processEventImage(tiny, { role: 'gallery' })).ok, '800x450 accepted as gallery')

  // ---- 4. Video allowlist (real parser) -----------------------------------
  const yt = parseVideoEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  check('YouTube link -> safe nocookie embed', yt.ok && yt.video.embedUrl === 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', yt.ok ? yt.video.embedUrl : 'rejected')
  check('Raw iframe rejected', !parseVideoEmbed('<iframe src="https://evil/x"></iframe>').ok, 'pasted HTML refused')
  check('Non-allowlisted host rejected', !parseVideoEmbed('https://dailymotion.com/video/x9abc').ok, 'dailymotion refused')

  // ---- 5. EXIF strip on the STORED object ---------------------------------
  const dl = await s.storage.from(BUCKET).download(cover.objectName)
  if (dl.error || !dl.data) throw new Error(`download cover: ${dl.error?.message}`)
  const storedBuf = Buffer.from(await dl.data.arrayBuffer())
  const storedMeta = await sharp(storedBuf).metadata()
  const srcMeta = await sharp(coverSrc).metadata()
  check('EXIF present in source, STRIPPED in stored object', !!srcMeta.exif && !storedMeta.exif, `source exif=${!!srcMeta.exif}, stored exif=${!!storedMeta.exif}, stored format=${storedMeta.format}`)

  // ---- 6. Moderation gate (real code) -------------------------------------
  const modOk = moderateEventMedia({ coverImageUrl: cover.url, galleryUrls: gallery.map((g) => g.url), videoUrl: yt.ok ? yt.video.embedUrl : null, videoProvider: 'youtube' })
  check('Moderation gate PASSES for on-platform media', modOk.ok, 'all images on TEST host, youtube allowlisted')
  const modBad = moderateEventMedia({ coverImageUrl: 'https://evil.example/x.jpg', galleryUrls: [], videoUrl: null, videoProvider: null })
  check('Moderation gate REJECTS an off-platform image', !modBad.ok, 'hot-linked image refused before publish')

  // ---- 7. Seed the published event (is_seed_data) -------------------------
  const start = new Date(Date.now() + 14 * 24 * 3600 * 1000)
  const end = new Date(start.getTime() + 3 * 3600 * 1000)
  const gallerySer = serializeGallery(gallery)
  await s.from('events').delete().eq('id', EVENT_ID)
  const { error: evErr } = await s.from('events').insert({
    id: EVENT_ID, title: 'Media Standard Proof Event', slug: SLUG,
    description: 'A published TEST event proving the Event Media Standard renders cover, gallery, and video live.',
    summary: 'Cover, gallery and video, end to end.',
    organisation_id: ORG_ID, created_by: ownerId, category_id: categoryId,
    start_date: start.toISOString(), end_date: end.toISOString(), timezone: 'Australia/Melbourne',
    event_type: 'in_person', venue_name: 'Media Test Venue', venue_address: '1 Standard St', venue_city: 'Melbourne', venue_state: 'VIC', venue_country: 'Australia',
    cover_image_url: cover.url, cover_image_alt: 'Navy and gold media standard cover', cover_image_blur: cover.blur,
    gallery_urls: gallerySer, video_url: yt.ok ? yt.video.embedUrl : null, video_provider: 'youtube',
    status: 'published', visibility: 'public', published_at: new Date().toISOString(),
    is_age_restricted: false, max_capacity: 200, tags: ['media-standard', 'verify'],
    fee_pass_type: 'pass_to_buyer', is_free: true, is_seed_data: true,
  })
  if (evErr) throw new Error(`event insert: ${evErr.message}`)
  await s.from('ticket_tiers').delete().eq('id', TIER_ID)
  const { error: tErr } = await s.from('ticket_tiers').insert({ id: TIER_ID, event_id: EVENT_ID, name: 'Free GA', description: 'Free general admission', tier_type: 'general_admission', price: 0, currency: 'AUD', total_capacity: 200, sold_count: 0, reserved_count: 0, min_per_order: 1, max_per_order: 10, sort_order: 0, is_visible: true, is_active: true, dynamic_pricing_enabled: false, requires_access_code: false })
  if (tErr) throw new Error(`tier insert: ${tErr.message}`)
  check('Published TEST event seeded with cover + 4 gallery + video', true, `slug=${SLUG}, gallery rows=${gallerySer.length}`)

  // ---- 8. DB constraints (defence in depth) -------------------------------
  const tenGallery = Array.from({ length: 10 }, (_, i) => ({ url: `${cover.url}#${i}`, alt: `x${i}` }))
  const overflow = await s.from('events').update({ gallery_urls: tenGallery }).eq('id', EVENT_ID)
  check('DB rejects a 10-item gallery (events_gallery_max_9)', !!overflow.error, overflow.error ? overflow.error.message.slice(0, 80) : 'NO ERROR (constraint missing!)')
  const badProvider = await s.from('events').update({ video_provider: 'dailymotion' }).eq('id', EVENT_ID)
  check('DB rejects a non-allowlisted video_provider', !!badProvider.error, badProvider.error ? badProvider.error.message.slice(0, 80) : 'NO ERROR (constraint missing!)')

  // ---- Output -------------------------------------------------------------
  const fails = results.filter((r) => r.verdict === 'FAIL')
  console.log('\n================ EVENT MEDIA STANDARD - LIVE VERIFY (TEST) ================')
  for (const r of results) console.log(`  [${r.verdict}] ${r.name}  ::  ${r.detail}`)
  console.log('--------------------------------------------------------------------------')
  console.log(`RESULT: ${fails.length === 0 ? 'ALL PASS' : `${fails.length} FAIL`}  (${results.length} checks)`)
  console.log(`EVENT_SLUG=${SLUG}`)
  console.log(`COVER_PUBLIC_URL=${cover.url}`)
  console.log(`OWNER_ID=${ownerId}`)
  console.log(`STORAGE_PREFIX=${prefix}`)
  console.log('==========================================================================\n')
  if (fails.length) process.exit(1)
}

main().catch((e) => { console.error('VERIFY FAILED:', e?.message ?? e); process.exit(1) })
