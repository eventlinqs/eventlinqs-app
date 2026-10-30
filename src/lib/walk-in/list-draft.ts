import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { parseGuide, walkInHoursProblems, type Guide } from './guide'
import { eventlinqsListingProblems } from '@/lib/events/eventlinqs-listing-words'
import { fromZonedInputValue } from '@/lib/dates/event-time'
import { resolveCityClaim } from '@/lib/cities/resolve'
import { resolveSuburbSlug } from '@/lib/cities/resolve-suburb'
import { serializeGallery, type GalleryImage } from '@/lib/media/event-media-model'
import { MAX_GALLERY_IMAGES } from '@/lib/media/limits'
import { moderateEventMedia } from '@/lib/media/moderation'
import { processEventImage } from '@/lib/media/image-pipeline'
import { photoHashes } from '@/lib/images/photo-hash'
import { lockPhotoToEvent, PHOTO_ALREADY_USED, photoLockedElsewhere, type PhotoHashes } from '@/lib/images/photo-lock'
import { checkPublishGate } from '@/lib/events/publish-gate'
import { canTransition } from '@/lib/event-lifecycle'
import type { EventStatus } from '@/types/database'

/**
 * ONE WALK-IN EVENT, LISTED UNLISTED FROM A CHECKED DATA BLOCK (the AMCF page,
 * the project manager's orders of 23 October 2026, 12:35 and 12:45, and his
 * ruling on Question F, 24 October 09:48: AMCF goes to production UNLISTED for
 * Fred's review, reachable only by its link, on no browse surface, noindex).
 *
 * The data is one fenced json block, every fact from the organiser's own
 * sources (for AMCF, C:\dev\EVIDENCE\WI1\AMCF-PAGE-DATA-window4.md, the source
 * the project manager confirmed on 23 October at 16:05); this module never
 * writes a fact of its own. It judges the block by the organiser form's own
 * rules, then writes what the form would have written:
 *
 *   the guide           parseGuide, the one shape of public.event_guides
 *   the hours           walkInHoursProblems against the event's own dates, the
 *                       publish gate's own check
 *   EventLinqs' words   eventlinqsListingProblems, only when listing_source is
 *                       'eventlinqs' (ruling 2: the organiser's words show as
 *                       written)
 *   no placeholder      the Definition of Done, and the founder's ruling of
 *                       23 October 12:21 that the "to confirm" placeholder goes:
 *                       every day's opening is a clock time, and no line says
 *                       to confirm, TBC, TBA, coming soon or carries a bracket
 *   the times           fromZonedInputValue, the conversion the form uses
 *   the city            resolveCityClaim and resolveSuburbSlug from the venue's
 *                       coordinates, as the form's save does
 *   the photos          processEventImage, the organiser upload's own pipeline
 *                       (validation, EXIF strip), stored where an upload goes
 *   the media           moderateEventMedia, before the row takes the urls
 *   "to be announced"   allowed: it is AMCF's own state of a fact ("Stay tuned as
 *                       we reveal this year's topic"), in the project manager's
 *                       wording of 24 October 11:58; the founder's ruling bans
 *                       "to confirm", which stands for a fact we have not checked
 *   SOURCE NEEDED       a line the organiser's own pages do not carry is named
 *                       in the block's ledger with its exact words, and the run
 *                       stops while any is unruled; ruled, it shows as the
 *                       organiser wrote it (that source named) or it is left off
 *   the listing         UNLISTED from the first write, then published by the
 *                       pair publishEvent uses (canTransition and
 *                       checkPublishGate) in one write. An unlisted page is
 *                       noindex (eventRobotsDirective) and on no browse surface.
 *                       Not done here, as publishEvent does: the owner's "event
 *                       published" email (the founder runs this himself), the
 *                       activation analytics (no organiser published it) and
 *                       revalidation (a new unlisted page has nothing cached)
 *
 * The writer takes the target project's client from its caller, so the same
 * code writes TEST in a drive and production on Lawal's APPLY.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const FILE = /^[A-Za-z0-9._-]+\.(jpe?g|png|webp|avif)$/i
const text = (max: number) => z.string().trim().min(1).max(max)

const PhotoSchema = z.object({ file: z.string().regex(FILE), alt: text(250) })

/** A SOURCE NEEDED line and its ruling: none yet, left off, or as the organiser wrote it with that source named. */
const SourceNeededSchema = z.object({
  line: text(120),
  words: text(600),
  ruling: z.union([z.null(), z.literal('left_off'), z.object({ as_amcf_wrote: text(300) })]),
})

export const ListingBlockSchema = z.object({
  listing_source: z.enum(['organiser', 'eventlinqs']),
  organisation: z.object({
    name: text(120),
    slug: z.string().regex(SLUG).max(60),
    short_name: z.string().trim().max(40).nullable().default(null),
    website: z.string().url().nullable().default(null),
    instagram_handle: z.string().trim().max(60).nullable().default(null),
  }),
  event: z.object({
    title: text(140),
    /** The event's address. Optional; derived from the title when absent. */
    slug: z.string().regex(SLUG).max(60).nullable().default(null),
    summary: text(300),
    description: z.string().trim().max(5000).nullable().default(null),
    category_slug: z.string().regex(SLUG),
    start: z.tuple([z.string().regex(ISO_DATE), z.string().regex(CLOCK)]),
    end: z.tuple([z.string().regex(ISO_DATE), z.string().regex(CLOCK)]),
    timezone: z.string().trim().min(3).default('Australia/Melbourne'),
    age_restriction_min: z.number().int().min(1).max(25).nullable().default(null),
    venue_name: text(120),
    venue_address: text(200),
    venue_city: text(80),
    venue_state: text(40),
    venue_country: text(60).default('Australia'),
    venue_postal_code: z.string().trim().max(10).nullable().default(null),
    venue_latitude: z.number().min(-90).max(90),
    venue_longitude: z.number().min(-180).max(180),
    city_primary: z.string().regex(SLUG).nullable().default(null),
    cover: PhotoSchema,
    gallery: z.array(PhotoSchema).max(MAX_GALLERY_IMAGES).default([]),
  }),
  guide: z.unknown(),
  source_needed: z.array(SourceNeededSchema).default([]),
})

export type ListingBlock = z.infer<typeof ListingBlockSchema>

export type DraftPlan = {
  block: ListingBlock
  guide: Guide
  /** The event's address, given or derived from the title. */
  slug: string
  startsAt: string
  endsAt: string
  citySlug: string
  suburbSlug: string | null
}

/** The one fenced json block of a data file, or the reason there is not exactly one. */
export function extractListingBlock(markdown: string): { ok: true; value: unknown } | { ok: false; problem: string } {
  const blocks = [...markdown.matchAll(/```json[^\S\r\n]*\r?\n([\s\S]*?)\r?\n```/g)]
  if (blocks.length !== 1) return { ok: false, problem: `the data file must hold exactly one fenced json block; it holds ${blocks.length}` }
  try {
    return { ok: true, value: JSON.parse(blocks[0][1]) }
  } catch (error) {
    return { ok: false, problem: `the json block does not parse: ${(error as Error).message}` }
  }
}

/*
 * A detector has to name what it bans. `lorem\sipsum` rather than a space: the
 * literal phrase matches its own subject matter in scripts/guards/no-partial-builds.mjs
 * (the joke that guard records five times), and \s keeps every other rule of that
 * guard on this file, where listing it as a detector would excuse it from all of them.
 */
const PLACEHOLDER = /\bto confirm\b|\bTBC\b|\bTBA\b|coming soon|lorem\sipsum|placeholder|\[[^\]]*\]/i
/** The banned word in every form, the same pattern scripts/guards/no-banned-word-anywhere.mjs holds. */
const BANNED_IN_ADDRESSES = /cultur(e|es|al|ally)/i

/** Every line the page shows, labelled for a refusal. */
function linesOf(block: ListingBlock, guide: Guide): Array<[string, string]> {
  const out: Array<[string, string]> = [
    ['the title', block.event.title],
    ['the summary', block.event.summary],
  ]
  if (block.event.description) out.push(['the description', block.event.description])
  guide.days.forEach((d, i) => {
    if (d.hours_label) out.push([`day ${i + 1}'s hours wording`, d.hours_label])
    d.items.forEach((item, j) => out.push([`day ${i + 1}, item ${j + 1}`, `${item.when} ${item.what}`]))
    if (d.closer) out.push([`day ${i + 1}'s closing act`, `${d.closer.name} ${d.closer.note ?? ''}`])
  })
  guide.at_a_glance.forEach((g, i) => out.push([`at a glance ${i + 1}`, `${g.value} ${g.label}`]))
  guide.highlights.forEach((h, i) => out.push([`highlight ${i + 1}`, `${h.title} ${h.body}`]))
  for (const key of ['highlights_note', 'program_note', 'quote_text', 'quote_attribution', 'getting_there', 'access_notes', 'photos_heading', 'cover_credit', 'photo_credit'] as const) {
    const v = guide[key]
    if (v) out.push([key.replace(/_/g, ' '), v])
  }
  return out
}

/** Judge a data block by the organiser form's own rules. Pure. */
export function planWalkInDraft(input: unknown): { ok: true; plan: DraftPlan } | { ok: false; problems: string[] } {
  const parsed = ListingBlockSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, problems: parsed.error.issues.map((i) => `${i.path.join('.') || 'block'}: ${i.message}`) }
  }
  const block = parsed.data
  const guided = parseGuide(block.guide)
  if (!guided.ok) return { ok: false, problems: guided.problems.map((p) => `guide.${p}`) }
  const guide = guided.guide
  const problems: string[] = []

  const startsAt = fromZonedInputValue(`${block.event.start[0]}T${block.event.start[1]}`, block.event.timezone)
  const endsAt = fromZonedInputValue(`${block.event.end[0]}T${block.event.end[1]}`, block.event.timezone)
  if (!startsAt || !endsAt) problems.push('the start or end time could not be read in the event\'s timezone')
  else if (Date.parse(endsAt) <= Date.parse(startsAt)) problems.push('the event ends before it starts')

  if (startsAt && endsAt) {
    problems.push(...walkInHoursProblems(guide.days, { startsAt, endsAt, timezone: block.event.timezone }))
  }
  guide.days.forEach((d, i) => {
    if (d.opens === null) problems.push(`day ${i + 1} (${d.date}) has no opening time; every day opens at a clock time`)
  })
  if (block.event.start[1] !== guide.days[0]?.opens) {
    problems.push(`the event starts at ${block.event.start[1]} but its first day opens at ${guide.days[0]?.opens ?? 'no time'}`)
  }
  const lines = linesOf(block, guide)
  for (const [label, line] of lines) {
    if (PLACEHOLDER.test(line)) problems.push(`${label} reads as a placeholder: ${JSON.stringify(line.slice(0, 80))}`)
  }
  // SOURCE NEEDED (project manager, 24 October 09:48): as the organiser wrote it, or left off; never shown unruled.
  for (const needed of block.source_needed) {
    const onPage = lines.some(([, line]) => line.includes(needed.words))
    if (needed.ruling === null) problems.push(`${needed.line} is SOURCE NEEDED and not ruled: ${JSON.stringify(needed.words.slice(0, 80))}`)
    else if (needed.ruling === 'left_off' && onPage) problems.push(`${needed.line} is ruled left off, but the page still carries those words`)
    else if (needed.ruling !== 'left_off' && !onPage) problems.push(`${needed.line} is ruled as AMCF wrote it, but no line on the page carries those words exactly`)
  }
  if (block.listing_source === 'eventlinqs') {
    problems.push(...eventlinqsListingProblems({ summary: block.event.summary, description: block.event.description, guide }))
  }

  const citySlug = resolveCityClaim(block.event.venue_city, block.event.venue_latitude, block.event.venue_longitude)
  if (!citySlug) problems.push(`no city claim for ${block.event.venue_city} at those coordinates`)
  else if (block.event.city_primary && block.event.city_primary !== citySlug) {
    problems.push(`the data says city ${block.event.city_primary} but the venue resolves to ${citySlug}`)
  }

  /*
   * The word the constitution bans in every form reaches no address: "route
   * names, file names, slugs, identifiers ... and data must all use community"
   * (CLAUDE.md, Copy and banned content). An organiser's own NAME shows as
   * written (ruling 2); its addresses do not carry the word.
   */
  const slug = block.event.slug ?? slugBase(block.event.title)
  for (const [label, s] of [['the event address', slug], ['the organisation address', block.organisation.slug]] as const) {
    if (BANNED_IN_ADDRESSES.test(s)) problems.push(`${label} "${s}" carries a word the constitution bans in every address; give the block its own slug`)
  }

  if (problems.length > 0) return { ok: false, problems }
  return {
    ok: true,
    plan: {
      block,
      guide,
      slug,
      startsAt,
      endsAt,
      citySlug: citySlug as string,
      suburbSlug: resolveSuburbSlug({
        citySlug,
        latitude: block.event.venue_latitude,
        longitude: block.event.venue_longitude,
      }),
    },
  }
}

export type ListingWriteResult =
  | {
      ok: true
      /** created: a new event, listed unlisted; published: an existing draft, now listed unlisted; refreshed: an unlisted listing whose words and guide were written again from the block. */
      outcome: 'created' | 'published' | 'refreshed'
      organisationId: string
      eventId: string
      slug: string
    }
  | { ok: false; reason: string }

const BUCKET = 'event-images'

/** The event's own address: the title's slug, and a suffix only when that is taken. */
function slugBase(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
}

/**
 * Write the listing, UNLISTED. Idempotent: the same event (same organisation,
 * title and start) is found, never written twice. A draft of it is published
 * unlisted; an unlisted listing has its words and guide written again from the
 * block (so the organiser's corrections go through the same checked file); a public event,
 * or one in any other state, is never touched. Anything that fails after a new
 * event row exists takes the row and its photos away again.
 */
export async function writeWalkInListing(
  client: SupabaseClient,
  plan: DraftPlan,
  deps: { ownerUserId: string; readPhoto: (file: string) => Promise<Buffer> },
): Promise<ListingWriteResult> {
  const { block } = plan
  const must = <T>(label: string, r: { data: T; error: { message: string } | null }): T => {
    if (r.error) throw new Error(`${label}: ${r.error.message}`)
    return r.data
  }

  // The organisation: found by its slug and owned by the owner, or created.
  const found = must('the organisation', await client.from('organisations').select('id, owner_id').eq('slug', block.organisation.slug).maybeSingle()) as { id: string; owner_id: string } | null
  if (found && found.owner_id !== deps.ownerUserId) {
    return { ok: false, reason: `organisation ${block.organisation.slug} exists and belongs to someone else` }
  }
  let organisationId = found?.id ?? null
  if (!organisationId) {
    const made = must('create the organisation', await client.from('organisations').insert({
      name: block.organisation.name,
      slug: block.organisation.slug,
      owner_id: deps.ownerUserId,
      status: 'active',
      short_name: block.organisation.short_name,
      website: block.organisation.website,
      instagram_handle: block.organisation.instagram_handle,
    }).select('id').single()) as { id: string }
    organisationId = made.id
    // The owner is also its member, as WI2's listings organisation is made
    // (scripts/ops/make-listings-organisation.mjs), so every member-scoped read finds them.
    const member = await client.from('organisation_members').insert({ organisation_id: organisationId, user_id: deps.ownerUserId, role: 'owner' })
    if (member.error) {
      await client.from('organisations').delete().eq('id', organisationId)
      return { ok: false, reason: `the owner could not be made its member: ${member.error.message}; the organisation was taken away again` }
    }
  }

  const already = must('the existing event', await client.from('events').select('id, slug, status, visibility').eq('organisation_id', organisationId).eq('title', block.event.title).eq('start_date', plan.startsAt).maybeSingle()) as { id: string; slug: string; status: string; visibility: string } | null
  if (already) {
    const at = `${already.slug} is ${already.status} and ${already.visibility}`
    if (already.status === 'draft') {
      try {
        await saveWords(client, already.id, plan)
        await saveGuide(client, already.id, plan)
      } catch (error) {
        return { ok: false, reason: (error as Error).message }
      }
      const listed = await publishUnlisted(client, plan, organisationId, already.id, 'draft')
      if (!listed.ok) return { ok: false, reason: `${listed.reason}; the draft is left as it was` }
      return { ok: true, outcome: 'published', organisationId, eventId: already.id, slug: already.slug }
    }
    if (already.status === 'published' && already.visibility === 'unlisted') {
      try {
        await saveWords(client, already.id, plan)
        await saveGuide(client, already.id, plan)
      } catch (error) {
        return { ok: false, reason: (error as Error).message }
      }
      return { ok: true, outcome: 'refreshed', organisationId, eventId: already.id, slug: already.slug }
    }
    return { ok: false, reason: `${at}; this lists a draft or refreshes an unlisted listing, and never touches anything else (the switch to public is its own step)` }
  }

  const category = must('the category', await client.from('event_categories').select('id').eq('slug', block.event.category_slug).maybeSingle()) as { id: string } | null
  if (!category) return { ok: false, reason: `no category ${block.event.category_slug}` }

  const base = plan.slug
  const taken = must('the address', await client.from('events').select('id').eq('slug', base).maybeSingle())
  const slug = taken ? `${base}-${Math.random().toString(36).slice(2, 8)}` : base
  const eventId = crypto.randomUUID()
  const objects: string[] = []

  // UNLISTED FROM THE FIRST WRITE: never public, not even as a draft.
  must('create the draft', await client.from('events').insert({
    id: eventId,
    organisation_id: organisationId,
    created_by: deps.ownerUserId,
    title: block.event.title,
    slug,
    summary: block.event.summary,
    description: block.event.description,
    category_id: category.id,
    start_date: plan.startsAt,
    end_date: plan.endsAt,
    timezone: block.event.timezone,
    event_type: 'in_person',
    venue_name: block.event.venue_name,
    venue_address: block.event.venue_address,
    venue_city: block.event.venue_city,
    venue_state: block.event.venue_state,
    venue_country: block.event.venue_country,
    venue_postal_code: block.event.venue_postal_code,
    venue_latitude: block.event.venue_latitude,
    venue_longitude: block.event.venue_longitude,
    venue_geocode_source: 'manual',
    venue_geocoded_at: new Date().toISOString(),
    city_primary: plan.citySlug,
    suburb_primary: plan.suburbSlug,
    is_age_restricted: block.event.age_restriction_min !== null,
    age_restriction_min: block.event.age_restriction_min,
    visibility: 'unlisted',
    status: 'draft',
    published_at: null,
    entry_mode: 'walk_in',
    listing_source: block.listing_source,
  }))

  // NO PHOTO IS EVER REUSED (Lawal's 00:23 of 31 October 2026, P8 and P9): each photo is refused before it is stored when
  // another event holds it, and the whole set is locked to this night only once the listing is written, so a write that
  // fails and takes the draft away never leaves a photo locked to a night that is gone.
  const lockRpc = {
    rpc: (name: string, args: Record<string, unknown>) =>
      (client.rpc as unknown as (n: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { code: string; message: string } | null }>)(name, args),
  }
  const toLock: { url: string; role: 'cover' | 'gallery'; hashes: PhotoHashes }[] = []
  try {
    const upload = async (file: string, role: 'cover' | 'gallery') => {
      const bytes = await deps.readPhoto(file)
      const hashes = await photoHashes(bytes)
      if (await photoLockedElsewhere(hashes, eventId, lockRpc)) throw new Error(`${file}: ${PHOTO_ALREADY_USED}`)
      const processed = await processEventImage(bytes, { role })
      if (!processed.ok) throw new Error(`${file}: ${processed.error}`)
      const name = `${deps.ownerUserId}/${eventId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${processed.image.ext}`
      const { error } = await client.storage.from(BUCKET).upload(name, processed.image.buffer, {
        cacheControl: '31536000',
        upsert: false,
        contentType: processed.image.contentType,
      })
      if (error) throw new Error(`${file} could not be stored: ${error.message}`)
      objects.push(name)
      const url = client.storage.from(BUCKET).getPublicUrl(name).data.publicUrl
      toLock.push({ url, role, hashes })
      return { url, blur: processed.image.blurDataURL }
    }
    const cover = await upload(block.event.cover.file, 'cover')
    const gallery: GalleryImage[] = []
    for (const g of block.event.gallery) gallery.push({ url: (await upload(g.file, 'gallery')).url, alt: g.alt })
    const media = moderateEventMedia({ coverImageUrl: cover.url, galleryUrls: gallery.map((g) => g.url), videoUrl: null, videoProvider: null })
    if (!media.ok) throw new Error(media.message)

    must('attach the photos', await client.from('events').update({
      cover_image_url: cover.url,
      cover_image_alt: block.event.cover.alt,
      cover_image_blur: cover.blur,
      gallery_urls: serializeGallery(gallery),
    }).eq('id', eventId))

    await saveGuide(client, eventId, plan)
    const listed = await publishUnlisted(client, plan, organisationId, eventId, 'draft')
    if (!listed.ok) throw new Error(listed.reason)
    for (const p of toLock) {
      const locked = await lockPhotoToEvent({ eventId, hashes: p.hashes, imageUrl: p.url, role: p.role }, lockRpc)
      if (!locked.ok) throw new Error(locked.error)
    }
  } catch (error) {
    if (objects.length > 0) await client.storage.from(BUCKET).remove(objects)
    await client.from('event_guides').delete().eq('event_id', eventId)
    await client.from('events').delete().eq('id', eventId)
    return { ok: false, reason: `${(error as Error).message}; the event and its photos were taken away again` }
  }

  return { ok: true, outcome: 'created', organisationId, eventId, slug }
}

/** The event's own words, written from the block, so the organiser's corrections reach a rerun too. */
async function saveWords(client: SupabaseClient, eventId: string, plan: DraftPlan): Promise<void> {
  const { error } = await client.from('events').update({ summary: plan.block.event.summary, description: plan.block.event.description }).eq('id', eventId)
  if (error) throw new Error(`save the event's words: ${error.message}`)
}

/** The guide, written from the block. program_published_at is never written here. */
async function saveGuide(client: SupabaseClient, eventId: string, plan: DraftPlan): Promise<void> {
  const { program_published_at: _never, ...guideRow } = plan.guide
  void _never
  const { error } = await client.from('event_guides').upsert({ event_id: eventId, ...guideRow }, { onConflict: 'event_id' })
  if (error) throw new Error(`save the guide: ${error.message}`)
}

/**
 * Publish UNLISTED, by the pair publishEvent uses: the lifecycle allows draft to
 * published, and the publish gate passes the saved row. One write, guarded on
 * the status it was read in, so a row someone else changed meanwhile is left.
 */
async function publishUnlisted(
  client: SupabaseClient,
  plan: DraftPlan,
  organisationId: string,
  eventId: string,
  from: EventStatus,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!canTransition(from, 'published')) return { ok: false, reason: `the lifecycle does not allow ${from} to published` }
  const gate = await askGate(client, plan, organisationId, eventId)
  if (!gate.ok) return { ok: false, reason: `the publish gate refused it: ${gate.reason}` }
  const { data, error } = await client
    .from('events')
    .update({ status: 'published', published_at: new Date().toISOString(), visibility: 'unlisted' })
    .eq('id', eventId)
    .eq('status', from)
    .select('id')
  if (error) return { ok: false, reason: `it could not be published unlisted: ${error.message}` }
  if ((data ?? []).length !== 1) return { ok: false, reason: `it was no longer ${from} when it came to be published` }
  return { ok: true }
}

/** Ask the publish gate about the saved row. */
async function askGate(client: SupabaseClient, plan: DraftPlan, organisationId: string, eventId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const row = (await client.from('events').select('cover_image_url').eq('id', eventId).single()).data as { cover_image_url: string | null } | null
  const gate = await checkPublishGate(
    client,
    {
      organisationId,
      tiersHavePaid: false,
      coverImageUrl: row?.cover_image_url ?? null,
      endsAt: plan.endsAt,
      isPhysical: true,
      venueName: plan.block.event.venue_name,
      venueAddress: plan.block.event.venue_address,
      walkIn: { tierCount: 0, days: plan.guide.days, startsAt: plan.startsAt, endsAt: plan.endsAt, timezone: plan.block.event.timezone },
    },
    null,
  )
  return gate.ok ? { ok: true } : { ok: false, reason: gate.message }
}

/**
 * Every line of the block a visitor reads on the walk-in page
 * (src/components/events/walk-in/walk-in-event-page.tsx), for the page proof.
 */
export function pageLines(plan: DraftPlan): string[] {
  const g = plan.guide
  const out: string[] = [plan.block.event.title, plan.block.event.summary]
  for (const d of g.days) {
    for (const item of d.items) out.push(item.what)
    if (d.closer) out.push(d.closer.name)
  }
  for (const a of g.at_a_glance) out.push(a.value, a.label)
  for (const h of g.highlights) out.push(h.title, h.body)
  for (const v of [g.highlights_note, g.program_note, g.quote_text, g.quote_attribution, g.getting_there, g.access_notes, g.photos_heading, g.cover_credit, g.photo_credit]) {
    if (v) out.push(v)
  }
  return out
}
