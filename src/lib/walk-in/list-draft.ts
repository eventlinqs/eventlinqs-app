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
import { checkPublishGate } from '@/lib/events/publish-gate'

/**
 * ONE WALK-IN EVENT, LISTED AS A DRAFT FROM A CHECKED DATA BLOCK (the AMCF page,
 * the project manager's orders of 23 October 2026, 12:35 and 12:45).
 *
 * Window 5 writes the data (C:\dev\design\amcf-21oct\AMCF-PAGE-DATA.md, one
 * fenced json block, every fact from the organiser's own sources); this module
 * never writes a fact of its own. It judges the block by the organiser form's
 * own rules, then writes what the form would have written:
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
 *   publishable?        checkPublishGate is ASKED and its answer reported; the
 *                       draft is never published here
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
})

export type ListingBlock = z.infer<typeof ListingBlockSchema>

export type DraftPlan = {
  block: ListingBlock
  guide: Guide
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

const PLACEHOLDER = /\bto confirm\b|\bTBC\b|\bTBA\b|coming soon|lorem ipsum|placeholder|\[[^\]]*\]/i

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
  for (const [label, line] of linesOf(block, guide)) {
    if (PLACEHOLDER.test(line)) problems.push(`${label} reads as a placeholder: ${JSON.stringify(line.slice(0, 80))}`)
  }
  if (block.listing_source === 'eventlinqs') {
    problems.push(...eventlinqsListingProblems({ summary: block.event.summary, description: block.event.description, guide }))
  }

  const citySlug = resolveCityClaim(block.event.venue_city, block.event.venue_latitude, block.event.venue_longitude)
  if (!citySlug) problems.push(`no city claim for ${block.event.venue_city} at those coordinates`)
  else if (block.event.city_primary && block.event.city_primary !== citySlug) {
    problems.push(`the data says city ${block.event.city_primary} but the venue resolves to ${citySlug}`)
  }

  if (problems.length > 0) return { ok: false, problems }
  return {
    ok: true,
    plan: {
      block,
      guide,
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

export type DraftWriteResult =
  | { ok: true; created: boolean; organisationId: string; eventId: string; slug: string; publishable: { ok: true } | { ok: false; reason: string } }
  | { ok: false; reason: string }

const BUCKET = 'event-images'

/** The event's own address: the title's slug, and a suffix only when that is taken. */
function slugBase(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
}

/**
 * Write the draft. Idempotent: the same event (same organisation, title and
 * start) already there is reported, never written twice. Anything that fails
 * after the event row exists takes the row and its photos away again.
 */
export async function writeWalkInDraft(
  client: SupabaseClient,
  plan: DraftPlan,
  deps: { ownerUserId: string; readPhoto: (file: string) => Promise<Buffer> },
): Promise<DraftWriteResult> {
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

  const already = must('the existing event', await client.from('events').select('id, slug').eq('organisation_id', organisationId).eq('title', block.event.title).eq('start_date', plan.startsAt).maybeSingle()) as { id: string; slug: string } | null
  if (already) return { ok: true, created: false, organisationId, eventId: already.id, slug: already.slug, publishable: await askGate(client, plan, organisationId, already.id) }

  const category = must('the category', await client.from('event_categories').select('id').eq('slug', block.event.category_slug).maybeSingle()) as { id: string } | null
  if (!category) return { ok: false, reason: `no category ${block.event.category_slug}` }

  const base = slugBase(block.event.title)
  const taken = must('the address', await client.from('events').select('id').eq('slug', base).maybeSingle())
  const slug = taken ? `${base}-${Math.random().toString(36).slice(2, 8)}` : base
  const eventId = crypto.randomUUID()
  const objects: string[] = []

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
    visibility: 'public',
    status: 'draft',
    published_at: null,
    entry_mode: 'walk_in',
    listing_source: block.listing_source,
  }))

  try {
    const upload = async (file: string, role: 'cover' | 'gallery') => {
      const processed = await processEventImage(await deps.readPhoto(file), { role })
      if (!processed.ok) throw new Error(`${file}: ${processed.error}`)
      const name = `${deps.ownerUserId}/${eventId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${processed.image.ext}`
      const { error } = await client.storage.from(BUCKET).upload(name, processed.image.buffer, {
        cacheControl: '31536000',
        upsert: false,
        contentType: processed.image.contentType,
      })
      if (error) throw new Error(`${file} could not be stored: ${error.message}`)
      objects.push(name)
      return { url: client.storage.from(BUCKET).getPublicUrl(name).data.publicUrl, blur: processed.image.blurDataURL }
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

    const { program_published_at: _never, ...guideRow } = plan.guide
    void _never
    must('save the guide', await client.from('event_guides').upsert({ event_id: eventId, ...guideRow }, { onConflict: 'event_id' }))
  } catch (error) {
    if (objects.length > 0) await client.storage.from(BUCKET).remove(objects)
    await client.from('event_guides').delete().eq('event_id', eventId)
    await client.from('events').delete().eq('id', eventId)
    return { ok: false, reason: `${(error as Error).message}; the draft and its photos were taken away again` }
  }

  return { ok: true, created: true, organisationId, eventId, slug, publishable: await askGate(client, plan, organisationId, eventId) }
}

/** Ask the publish gate about the saved row, without publishing. */
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
