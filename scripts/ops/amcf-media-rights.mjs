/**
 * THE AMCF MEDIA-RIGHTS ROWS (the engine plan's directive, 28 October 2026 19:52: "AMCF IS THE REAL PILOT"; the
 * directive's section 8; migration 20261028201001).
 *
 * The organiser's seven photographs, one social_assets row each, organiser authorised for the AMCF 2026 night only,
 * with the whole record from scripts/ops/amcf-media-rights.manifest.json: rights holder, the original file, the day it
 * came, the evidence, the permitted uses, restrictions, the archival credit (J6: they are from a past festival), the
 * licence's end with the festival, a focal point, and each file's own pixel size read from the file.
 *
 *   node --env-file=<env> scripts/ops/amcf-media-rights.mjs              a dry run: reads, prints every row, writes nothing
 *   node --env-file=<a TEST env> scripts/ops/amcf-media-rights.mjs --apply --approve-as <staff user id>
 *                                                                       TEST only: uploads the files and enters the rows,
 *                                                                       approved by that staff user for the demonstration
 *
 * Production is never written here: on production the rows go in pending through /admin/social or window 4's logged
 * path on Lawal's APPLY, and Lawal approves each himself (J12). Idempotent: a file or row already present is left.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'

const TEST_REF = 'vkapkibzokmfaxqogypq'
const PHOTOS = 'C:/dev/design/amcf-21oct/photos'
const argv = process.argv.slice(2)
const apply = argv.includes('--apply')
const approveAs = argv.includes('--approve-as') ? argv[argv.indexOf('--approve-as') + 1] : null

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!url || !key) {
  console.error('needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from --env-file')
  process.exit(2)
}
const onTest = new URL(url).hostname.startsWith(`${TEST_REF}.`)
if (apply && !onTest) {
  console.error('REFUSED: --apply writes TEST only. Production rows go in pending through /admin/social or the logged production path, approved by Lawal.')
  process.exit(2)
}
if (apply && !/^[0-9a-f-]{36}$/i.test(approveAs ?? '')) {
  console.error('--apply needs --approve-as <the staff user id the demonstration approves as>')
  process.exit(2)
}

const m = JSON.parse(readFileSync(new URL('./amcf-media-rights.manifest.json', import.meta.url), 'utf8'))
const db = createClient(url, key, { auth: { persistSession: false } })
const target = onTest ? `TEST (${TEST_REF})` : 'NOT TEST (read only)'

const { data: ev, error: everr } = await db.from('events').select('id, slug, title, start_date, end_date, venue_name').eq('slug', m.eventSlug).maybeSingle()
if (everr || !ev) {
  console.error(`the night ${m.eventSlug} could not be read on ${target}: ${everr?.message ?? 'no such night'}`)
  process.exit(1)
}
console.log(`${apply ? 'APPLY' : 'DRY RUN'} on ${target}: ${ev.title} (${ev.slug}, ${ev.id}), ${ev.venue_name}, ${ev.start_date} to ${ev.end_date}`)

const publicUrl = (path) => db.storage.from('event-images').getPublicUrl(path).data.publicUrl
let written = 0
let present = 0
for (const p of m.photos) {
  const bytes = readFileSync(join(PHOTOS, p.file))
  const meta = await sharp(bytes).metadata()
  const path = `${m.storagePrefix}/${p.file}`
  const assetUrl = publicUrl(path)
  const row = {
    asset_state: 'organiser_authorised',
    asset_type: 'photo',
    event_id: ev.id,
    asset_url: assetUrl,
    source_url: m.sourceUrl,
    rights_holder: m.rightsHolder,
    permission_evidence: m.permissionEvidence,
    evidence_file: m.evidenceFile,
    attribution_text: m.attribution,
    scope: m.scope,
    archival: m.archival,
    expires_at: m.expiresAt,
    restrictions: m.restrictions,
    original_file: `${p.file} (${meta.width} x ${meta.height}, the copy in C:\\dev\\design\\amcf-21oct\\photos; the organiser's originals are asked for)`,
    received_on: m.receivedOn,
    permitted_uses: m.permittedUses,
    focal_x: p.focal[0],
    focal_y: p.focal[1],
    source_width: meta.width,
    source_height: meta.height,
  }
  const { data: have } = await db.from('social_assets').select('id, approval_status').eq('asset_url', assetUrl).eq('event_id', ev.id).maybeSingle()
  console.log(`${p.file}: ${meta.width} x ${meta.height}, focal ${p.focal.join(', ')}, ${p.subject}; ${have ? `in the register already (${have.approval_status})` : 'new'}`)
  if (!apply) continue
  if (have) {
    present += 1
    continue
  }
  const up = await db.storage.from('event-images').upload(path, bytes, { contentType: 'image/jpeg', upsert: false })
  if (up.error && !/exists/i.test(up.error.message)) throw new Error(`upload ${path}: ${up.error.message}`)
  const ins = await db.from('social_assets').insert({ ...row, created_by: approveAs }).select('id').single()
  if (ins.error) throw new Error(`row ${p.file}: ${ins.error.message}`)
  const ok = await db.from('social_assets').update({ approval_status: 'approved', approved_by: approveAs, approved_at: new Date().toISOString() }).eq('id', ins.data.id).select('id')
  if (ok.error) throw new Error(`approve ${p.file}: ${ok.error.message}`)
  written += 1
  console.log(`  MADE asset ${ins.data.id}, approved on TEST for the demonstration`)
}
if (!apply) console.log(`\nDRY RUN: ${m.photos.length} row(s) shown, nothing written. Every row carries:\n${JSON.stringify({ rights_holder: m.rightsHolder, attribution: m.attribution, archival: m.archival, scope: m.scope, received_on: m.receivedOn, permitted_uses: m.permittedUses, restrictions: m.restrictions, expires_at: m.expiresAt }, null, 2)}`)
else console.log(`\nAPPLIED on TEST: ${written} new, ${present} already present.`)

// The read back: what the planner itself would draw for the night now.
const { data: usable, error: uerr } = await db.rpc('social_usable_images', { p_events: [ev.id], p_at: new Date().toISOString() })
console.log(uerr ? `read back: social_usable_images is not on ${target} yet (${uerr.code}): the migration is not applied there` : `read back: the planner draws ${usable?.[0]?.asset_url ?? 'no image (type led)'} for ${ev.slug}`)
