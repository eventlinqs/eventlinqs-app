// LIST ONE WALK-IN EVENT UNLISTED, FROM A CHECKED DATA FILE (the AMCF page, the
// project manager's orders of 23 October 2026, 12:35 and 12:45, and his ruling
// on Question F, 24 October 09:48: UNLISTED for Fred's review, reachable only by
// its link, on no browse surface, noindex; public later, as its own step).
//
// The data file (for AMCF, C:\dev\EVIDENCE\WI1\AMCF-PAGE-DATA-window4.md, the
// source the project manager confirmed on 23 October at 16:05) is one fenced
// ```json block holding listing_source, organisation, event, guide and the
// source_needed ledger. This script never writes, mends or adds a fact. It
// judges the block by the organiser form's own rules (src/lib/walk-in/list-draft.ts)
// and refuses on the first problem by name, including any SOURCE NEEDED line
// that is not yet ruled.
//
// Usage, from the repository root in PowerShell (the Supabase CLI's own login
// supplies the token; the project's service-role key is read from the
// Management API at run time and never printed or stored):
//
//   scripts\ops\with-supabase-token.ps1 node --import ./scripts/lib/server-only-shim.mjs --import ./scripts/lib/src-alias-loader.mjs scripts/ops/list-walk-in-draft.mjs `
//     --data C:\dev\EVIDENCE\WI1\AMCF-PAGE-DATA-window4.md --photos C:\dev\design\amcf-21oct\photos `
//     --owner-email <the organiser account's sign-in address> --target test|production [--apply | --prove-only] [--site <origin>]
//
// Without --apply it is a dry run: it judges the block, puts every photo through
// the upload pipeline in memory, finds the owner and the category, and says what
// it would write. With --apply on TEST it writes. On PRODUCTION it writes only
// after the founder types APPLY, and the write is logged in
// C:\dev\PRODUCTION-WRITES.txt (operating rule 4 of 25 September 2026).
//
// IT IS IDEMPOTENT: the same event (organisation, title, start) is never written
// twice; a draft of it is listed unlisted, an unlisted listing has its words and
// guide written again from the block, and a public event is never touched.
// --prove-only judges the listing already there against the file and writes nothing. IT PROVES
// ITSELF: it reads the event and its guide back (published, unlisted, the guide
// equal to the block line for line, every photo answering), then fetches the
// page on the target site (production's own, or --site for TEST): HTTP 200, a
// noindex robots tag, every line of the block a visitor reads, and the address
// on none of the browse surfaces.

import { createClient } from '@supabase/supabase-js'
import { appendFileSync, existsSync, readFileSync, readSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const TARGETS = { production: 'gndnldyfudbytbboxesk', test: 'vkapkibzokmfaxqogypq' }
const SITES = { production: 'https://www.eventlinqs.com.au', test: null }
/** Browse surfaces an unlisted listing must never appear on (the gate fixture's own list). */
const BROWSE = ['/', '/events', '/sitemap.xml', '/city/melbourne']
const LOG = 'C:/dev/PRODUCTION-WRITES.txt'
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

class Refusal extends Error {}

function parseArgs(argv) {
  const out = { data: null, photos: null, owner: null, target: null, apply: false, proveOnly: false, site: null }
  const take = { '--data': 'data', '--photos': 'photos', '--owner-email': 'owner', '--target': 'target', '--site': 'site' }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--apply') out.apply = true
    else if (a === '--prove-only') out.proveOnly = true
    else if (a in take) {
      out[take[a]] = argv[i + 1] ?? null
      i += 1
    } else throw new Refusal(`unknown argument ${JSON.stringify(a)}`)
  }
  if (!out.target || !(out.target in TARGETS)) throw new Refusal(`--target must be test or production (got ${JSON.stringify(out.target)}); there is no default`)
  if (!out.data || !existsSync(out.data)) throw new Refusal(`--data must name the checked data file (got ${JSON.stringify(out.data)})`)
  if (!out.photos || !existsSync(out.photos)) throw new Refusal(`--photos must name the folder of the block's photos (got ${JSON.stringify(out.photos)})`)
  if (!out.owner || !EMAIL.test(out.owner)) throw new Refusal(`--owner-email must be one plain email address (got ${JSON.stringify(out.owner)})`)
  if (out.apply && out.proveOnly) throw new Refusal('--apply and --prove-only are two different runs; give one')
  if (out.site !== null) {
    if (out.target === 'production') throw new Refusal('--site is for TEST only; production is proved on its own site')
    if (!/^https?:\/\/[^\s/]+$/.test(out.site)) throw new Refusal(`--site must be an origin such as http://127.0.0.1:3000 (got ${JSON.stringify(out.site)})`)
  }
  return out
}

/** One synchronous read of the console, so nothing of ours is pending afterwards. */
function askLine(prompt) {
  process.stdout.write(prompt)
  const buf = Buffer.alloc(256)
  let n = 0
  try {
    n = readSync(0, buf, 0, buf.length, null)
  } catch {
    return ''
  }
  return buf.subarray(0, n).toString('utf8').trim()
}

/** The target's service-role key, from the Management API under the CLI's login. Never printed. */
async function serviceKeyFor(ref) {
  const token = process.env.SUPABASE_ACCESS_TOKEN
  if (!token) throw new Refusal('no SUPABASE_ACCESS_TOKEN: run this through scripts\\ops\\with-supabase-token.ps1')
  // GET /v1/projects/{ref}/api-keys (https://supabase.com/docs/reference/api/v1-get-project-api-keys, read 2026-10-23);
  // on 23 October the legacy service_role key came back whole, with or without reveal.
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys`, { headers: { authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Refusal(`the Management API refused the key read for ${ref} (HTTP ${res.status})`)
  const keys = await res.json()
  const key = Array.isArray(keys) ? keys.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key : null
  if (typeof key !== 'string' || key.split('.').length !== 3) throw new Refusal(`no whole service_role key came back for ${ref}`)
  return key
}

const sorted = (v) =>
  Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted(v[k])])) : v

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const ref = TARGETS[args.target]
  /*
   * THE PRODUCT CODE JUDGES AGAINST THE TARGET, NOT WHATEVER THE SHELL CARRIES.
   * moderateEventMedia accepts only images stored in the platform's own project
   * (getSupabaseUrl(), src/lib/supabase/env.ts: the _PREVIEW variable first, then
   * the plain one). The first TEST drive, 23 October 23:33, uploaded to TEST and
   * was refused as "linked from another site" because the shell named no project.
   * So the project this run writes to is the project the product code reads.
   */
  delete process.env.NEXT_PUBLIC_SUPABASE_URL_PREVIEW
  process.env.NEXT_PUBLIC_SUPABASE_URL = `https://${ref}.supabase.co`
  const { extractListingBlock, planWalkInDraft, writeWalkInListing, pageLines } = await import('@/lib/walk-in/list-draft')
  const { processEventImage } = await import('@/lib/media/image-pipeline')

  console.log(`list-walk-in-draft: ${args.data} -> ${args.target} (${ref})${args.apply ? '' : ' (dry run)'}`)
  const extracted = extractListingBlock(readFileSync(args.data, 'utf8'))
  if (!extracted.ok) throw new Refusal(extracted.problem)
  const planned = planWalkInDraft(extracted.value)
  if (!planned.ok) throw new Refusal(`the data block does not pass the organiser form's rules:\n  - ${planned.problems.join('\n  - ')}`)
  const { plan } = planned
  const e = plan.block.event
  console.log(`  event        ${e.title}`)
  console.log(`  when         ${plan.startsAt} to ${plan.endsAt} (${e.timezone}), ${plan.guide.days.length} day(s)`)
  console.log(`  where        ${e.venue_name}, ${e.venue_city}: city ${plan.citySlug}${plan.suburbSlug ? `, suburb ${plan.suburbSlug}` : ''}`)
  console.log(`  words        listing_source ${plan.block.listing_source}`)
  for (const n of plan.block.source_needed) {
    console.log(`  source       ${n.line}: ${n.ruling === 'left_off' ? 'ruled left off' : `ruled as AMCF wrote it (${n.ruling.as_amcf_wrote})`}`)
  }

  const photoFiles = [e.cover.file, ...e.gallery.map((g) => g.file)]
  for (const [i, file] of photoFiles.entries()) {
    const path = join(args.photos, file)
    if (!existsSync(path)) throw new Refusal(`photo ${file} is not in ${args.photos}`)
    const processed = await processEventImage(await readFile(path), { role: i === 0 ? 'cover' : 'gallery' })
    if (!processed.ok) throw new Refusal(`photo ${file}: ${processed.error}`)
    console.log(`  photo        ${file}: ${processed.image.width}x${processed.image.height} ${processed.image.contentType}${i === 0 ? ' (cover)' : ''}`)
  }

  const key = await serviceKeyFor(ref)
  const client = createClient(`https://${ref}.supabase.co`, key, { auth: { persistSession: false } })
  const owner = await client.from('profiles').select('id, email').ilike('email', args.owner.replace(/[\\%_]/g, (c) => `\\${c}`))
  if (owner.error) throw new Refusal(`the owner could not be read: ${owner.error.message}`)
  const owners = (owner.data ?? []).filter((p) => (p.email ?? '').toLowerCase() === args.owner.toLowerCase())
  if (owners.length !== 1) throw new Refusal(`${args.owner} is ${owners.length} profiles on ${args.target}, not exactly one`)
  const category = await client.from('event_categories').select('id').eq('slug', e.category_slug).maybeSingle()
  if (category.error || !category.data) throw new Refusal(`no category ${e.category_slug} on ${args.target}`)
  const org = await client.from('organisations').select('id, owner_id').eq('slug', plan.block.organisation.slug).maybeSingle()
  if (org.error) throw new Refusal(`the organisation could not be read: ${org.error.message}`)
  if (org.data && org.data.owner_id !== owners[0].id) throw new Refusal(`organisation ${plan.block.organisation.slug} exists and belongs to someone else`)
  console.log(`  owner        one profile on ${args.target}`)
  console.log(`  organisation ${plan.block.organisation.name} (${plan.block.organisation.slug}): ${org.data ? 'exists, theirs' : 'would be created, owned by them'}`)

  if (args.proveOnly) {
    // Judge the listing already there against this file, writing nothing (the page proof's red, and a
    // check after the organiser's corrections).
    if (!org.data) throw new Refusal(`organisation ${plan.block.organisation.slug} is not on ${args.target}; there is no listing to prove`)
    const found = await client.from('events').select('id, slug').eq('organisation_id', org.data.id).eq('title', e.title).eq('start_date', plan.startsAt).maybeSingle()
    if (found.error || !found.data) throw new Refusal(`no listing of ${e.title} on ${args.target} to prove`)
    console.log(`  prove only   nothing written: listing ${found.data.id}, /events/${found.data.slug}, judged against this file`)
    const failures = await prove(client, plan, found.data, photoFiles, args, pageLines)
    return failures.length === 0 ? 0 : 1
  }
  if (!args.apply) {
    console.log('dry run: nothing written. Add --apply to list it unlisted.')
    return 0
  }
  if (args.target === 'production') {
    console.log('')
    console.log(`  PRODUCTION. This lists ${e.title} UNLISTED in that account: published, reachable only by`)
    console.log(`  its link /events/${plan.slug}, on no browse surface, noindex. It is never made public here.`)
    const typed = askLine('  Type APPLY to write it: ')
    if (typed !== 'APPLY') throw new Refusal('not applied: APPLY was not typed')
  }

  const written = await writeWalkInListing(client, plan, { ownerUserId: owners[0].id, readPhoto: (file) => readFile(join(args.photos, file)) })
  if (!written.ok) throw new Refusal(written.reason)
  const said = {
    created: 'written and listed unlisted',
    published: 'the draft already there is now listed unlisted',
    refreshed: 'already listed unlisted; its words and guide written again from the block',
  }
  console.log(`  ${said[written.outcome]}: event ${written.eventId}, /events/${written.slug}`)

  const failures = await prove(client, plan, { id: written.eventId, slug: written.slug }, photoFiles, args, pageLines)
  if (SITES[args.target]) console.log(`  for the owner ${SITES[args.target]}/dashboard/events/${written.eventId}`)

  if (args.target === 'production') {
    const stamp = new Date().toLocaleString('sv-SE', { timeZone: 'Australia/Melbourne' }).slice(0, 16)
    const what = written.outcome === 'refreshed' ? 'words and guide written again from the block' : `listed UNLISTED at /events/${written.slug}`
    appendFileSync(LOG, `${stamp}  founder typed APPLY: APPLIED: walk-in event ${e.title} (${written.eventId}) ${what} in ${plan.block.organisation.name}; proof ${failures.length === 0 ? 'PASS' : 'FAIL'} (scripts/ops/list-walk-in-draft.mjs, ${args.data})\n`)
    console.log(`  logged       ${LOG}`)
  }
  return failures.length === 0 ? 0 : 1
}

/** The proof: the rows read back and compared with the block, then the page as a visitor gets it. */
async function prove(client, plan, listing, photoFiles, args, pageLines) {
  const back = await client
    .from('events')
    .select('status, visibility, published_at, entry_mode, listing_source, title, summary, description, start_date, end_date, cover_image_url, gallery_urls')
    .eq('id', listing.id)
    .single()
  const guide = await client.from('event_guides').select('*').eq('event_id', listing.id).single()
  if (back.error || guide.error) throw new Refusal('the listing could not be read back')
  const failures = []
  if (back.data.status !== 'published') failures.push(`status is ${back.data.status}, not published`)
  if (back.data.visibility !== 'unlisted') failures.push(`visibility is ${back.data.visibility}, not unlisted`)
  if (!back.data.published_at) failures.push('published_at is not set')
  if (back.data.entry_mode !== 'walk_in') failures.push(`entry_mode is ${back.data.entry_mode}`)
  if (back.data.summary !== plan.block.event.summary || (back.data.description ?? null) !== (plan.block.event.description ?? null)) failures.push("the stored summary or description differs from the block")
  if (Date.parse(back.data.start_date) !== Date.parse(plan.startsAt) || Date.parse(back.data.end_date) !== Date.parse(plan.endsAt)) failures.push('the stored times differ from the block')
  for (const k of Object.keys(plan.guide).filter((k) => k !== 'program_published_at')) {
    if (JSON.stringify(sorted(guide.data[k])) !== JSON.stringify(sorted(plan.guide[k]))) failures.push(`the stored guide's ${k} differs from the block`)
  }
  const urls = [back.data.cover_image_url, ...(back.data.gallery_urls ?? []).map((g) => g.url)]
  for (const u of urls) {
    const r = await fetch(u, { method: 'HEAD' })
    if (!r.ok || !(r.headers.get('content-type') ?? '').startsWith('image/')) failures.push(`photo ${u} answered ${r.status}`)
  }
  if (urls.length !== photoFiles.length) failures.push(`${urls.length} photos stored, ${photoFiles.length} in the block`)
  console.log(`  proof, rows  ${failures.length === 0 ? 'PASS' : 'FAIL'}: published, unlisted, entry mode, times, ${Object.keys(plan.guide).length - 1} guide fields, ${urls.length} photos`)

  const site = args.site ?? SITES[args.target]
  if (!site) {
    console.log('  proof, page  NOT JUDGED: no site for TEST; pass --site <origin> of a server reading TEST')
  } else {
    const lines = pageLines(plan)
    const pageFailures = await provePage(site, listing.slug, lines)
    console.log(`  proof, page  ${pageFailures.length === 0 ? 'PASS' : 'FAIL'}: ${site}/events/${listing.slug}, HTTP 200, noindex, ${lines.length} lines of the block, on none of ${BROWSE.join(', ')}`)
    failures.push(...pageFailures)
  }
  for (const f of failures) console.log(`    - ${f}`)
  return failures
}

/**
 * What a visitor reads, as the page is served: the markup's entities and the
 * inline page data's escapes both undone. The day tabs are a client component,
 * so their days reach the HTML as page data rather than as markup.
 */
function readable(html) {
  return html
    .replace(/\\u0026/g, '&')
    .replace(/\\u003c/g, '<')
    .replace(/\\u003e/g, '>')
    .replace(/\\"/g, '"')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

/** The page answers 200, says noindex, carries every line, and no browse surface links to it. */
async function provePage(site, slug, lines) {
  const failures = []
  const res = await fetch(`${site}/events/${slug}`, { redirect: 'manual' }).catch((error) => ({ error }))
  if (res.error || res.status !== 200) {
    failures.push(`the page answered ${res.error ? res.error.message : `HTTP ${res.status}`}`)
    return failures
  }
  const html = await res.text()
  if (!/<meta name="robots" content="noindex/.test(html)) failures.push('the page carries no noindex robots tag')
  const text = readable(html)
  for (const line of lines) if (!text.includes(line)) failures.push(`the page does not carry ${JSON.stringify(line.slice(0, 70))}`)
  for (const path of BROWSE) {
    const r = await fetch(`${site}${path}`).catch(() => null)
    if (!r) failures.push(`${path} could not be read`)
    else if ((await r.text()).includes(`/events/${slug}`)) failures.push(`${path} links to /events/${slug}`)
  }
  return failures
}

main().then(
  (code) => {
    process.exitCode = code
  },
  (error) => {
    console.error(error instanceof Refusal ? `REFUSED: ${error.message}` : error)
    process.exitCode = error instanceof Refusal ? 2 : 1
  },
)
