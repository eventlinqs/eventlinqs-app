import type { MagicStartDraft } from '@/lib/ai/magic-start'
import type { CommunitySlug } from '@/lib/communities/data'

/**
 * Landing a Magic Start draft on the wizard, as pure functions.
 *
 * WHY THIS IS NOT INLINE IN THE FORM (defect C1). The status message used to
 * be built from two independent sources: a `filled` list assembled by hand
 * while writing the form, and an `unresolved` list produced by the model
 * BEFORE any client-side defaulting ran. The two could not agree, and the
 * founder's first real use showed "End" in both lists at once.
 *
 * Here there is one source. `buildDraftPatch` decides what is written, and
 * `summariseDraft` reports on THAT PATCH and nothing else. A field cannot be
 * described as filled and missing at the same time, because one function knows
 * and the other only reads it.
 *
 * Both are pure and exported so the six-event-type coverage tests can assert
 * every field lands without rendering React or calling a model.
 */

export type DraftTierPatch = {
  id: string
  name: string
  description: string
  tier_type: 'free' | 'general_admission'
  price: string
  currency: string
  total_capacity: string
  sale_start: string
  sale_end: string
  min_per_order: string
  max_per_order: string
  sort_order: number
}

/** Only the step 1 to 5 fields a draft is allowed to touch. */
export type DraftPatch = {
  title?: string
  summary?: string
  description?: string
  category_id?: string
  tags?: string
  community_slugs?: CommunitySlug[]
  start_date?: string
  end_date?: string
  event_type?: 'in_person' | 'virtual' | 'hybrid'
  venue_name?: string
  venue_address?: string
  venue_city?: string
  venue_state?: string
  venue_postal_code?: string
  ticket_tiers?: DraftTierPatch[]
}

export type DraftApplication = {
  patch: DraftPatch
  /** Fields written straight from what the organiser said. */
  filled: string[]
  /** Fields the platform completed on their behalf, named so they can correct them. */
  assumed: string[]
  /** Fields genuinely still empty after everything the platform could do. */
  stillNeeded: string[]
}

/**
 * Add whole hours to a naive "YYYY-MM-DDTHH:mm" local string.
 *
 * Stays in local components on purpose: going through toISOString would shift
 * by the UTC offset and silently move the event.
 */
export function addHoursLocal(localStr: string, hours: number): string {
  const d = new Date(localStr)
  if (Number.isNaN(d.getTime())) return localStr
  d.setHours(d.getHours() + hours)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export type ApplyContext = {
  /** The live categories, so a draft category name resolves to a real id. */
  categories: { id: string; name: string }[]
  /** The live community slugs the wizard offers. */
  allowedCommunitySlugs: readonly string[]
  /** Generates tier ids; injectable so tests are deterministic. */
  newId: () => string
}

/**
 * Turn a draft into the exact set of form writes, and record which of those
 * were the organiser's own facts and which the platform assumed.
 */
export function buildDraftPatch(draft: MagicStartDraft, ctx: ApplyContext): DraftApplication {
  const patch: DraftPatch = {}
  const filled: string[] = []
  const assumed: string[] = []

  if (draft.title) {
    patch.title = draft.title
    filled.push('Title')
  }
  if (draft.summary) {
    patch.summary = draft.summary.slice(0, 200)
    filled.push('Short summary')
  }
  if (draft.description) {
    patch.description = draft.description
    filled.push('Description')
  }

  if (draft.category) {
    const match = ctx.categories.find(
      c => c.name.trim().toLowerCase() === draft.category.trim().toLowerCase(),
    )
    if (match) {
      patch.category_id = match.id
      filled.push('Category')
    }
  }

  if (draft.tags.length > 0) {
    patch.tags = draft.tags.join(', ')
    filled.push('Tags')
  }

  const communities = draft.communities.filter((s): s is CommunitySlug =>
    ctx.allowedCommunitySlugs.includes(s),
  )
  if (communities.length > 0) {
    patch.community_slugs = communities
    filled.push(communities.length === 1 ? 'Community' : 'Communities')
  }

  // ── Dates. The end time is the one field the platform completes silently
  // today, which is exactly what produced defect C1. It is now named as an
  // assumption instead, so the organiser knows to check it.
  if (draft.start_date) {
    patch.start_date = draft.start_date
    filled.push('Start')
    const startMs = new Date(draft.start_date).getTime()
    const endMs = draft.end_date ? new Date(draft.end_date).getTime() : NaN
    if (Number.isFinite(startMs) && (!Number.isFinite(endMs) || endMs <= startMs)) {
      patch.end_date = addHoursLocal(draft.start_date, 2)
      assumed.push('End time, set to 2 hours after the start')
    } else if (draft.end_date) {
      patch.end_date = draft.end_date
      filled.push('End')
    }
  } else if (draft.end_date) {
    patch.end_date = draft.end_date
  }

  patch.event_type = draft.event_type

  if (draft.venue_name) {
    patch.venue_name = draft.venue_name
    filled.push('Venue')
  }
  if (draft.venue_address) patch.venue_address = draft.venue_address
  if (draft.venue_city) patch.venue_city = draft.venue_city
  if (draft.venue_state) patch.venue_state = draft.venue_state
  if (draft.venue_postal_code) patch.venue_postal_code = draft.venue_postal_code

  if (draft.ticket_tiers.length > 0) {
    patch.ticket_tiers = draft.ticket_tiers.map((t, i) => ({
      id: ctx.newId(),
      name: t.name,
      description: '',
      tier_type: (draft.is_free || t.price === 0 ? 'free' : 'general_admission') as
        | 'free'
        | 'general_admission',
      price: String(t.price),
      currency: t.currency,
      total_capacity: t.total_capacity != null ? String(t.total_capacity) : '',
      sale_start: '',
      sale_end: '',
      min_per_order: '1',
      max_per_order: '10',
      sort_order: i,
    }))
    filled.push(draft.is_free ? 'Free ticket' : 'Ticket prices')
  }

  return { patch, filled, assumed, stillNeeded: deriveStillNeeded(patch) }
}

/**
 * What is genuinely still empty, read from the PATCH that was written.
 *
 * This is the only producer of the "add these yourself" list on the client. It
 * never consults the model's own view, because that view describes the draft
 * before the platform's own defaulting ran, which is what allowed a field to be
 * reported as filled and missing simultaneously.
 */
function deriveStillNeeded(patch: DraftPatch): string[] {
  const missing: string[] = []
  if (!patch.title) missing.push('Title')
  if (!patch.summary) missing.push('Short summary')
  if (!patch.description) missing.push('Description')
  if (!patch.category_id) missing.push('Category')
  if (!patch.start_date) missing.push('Date and time')
  if (!patch.venue_name) missing.push('Venue name')
  if (!patch.venue_address) missing.push('Venue street address')
  if (!patch.ticket_tiers || patch.ticket_tiers.length === 0) missing.push('Ticket type and price')
  return missing
}

/**
 * The status sentence, in the organiser's language.
 *
 * Confident, never apologetic, and never contradictory: the three lists are
 * disjoint by construction, because `filled` and `assumed` are what the patch
 * wrote and `stillNeeded` is what it did not.
 */
export function summariseDraft(app: DraftApplication): {
  filled: string[]
  assumed: string[]
  stillNeeded: string[]
} {
  const written = new Set(app.filled)
  return {
    filled: app.filled,
    assumed: app.assumed,
    // Belt and braces: a label can never appear in both lists even if a future
    // edit introduces one, because the intersection is removed here.
    stillNeeded: app.stillNeeded.filter(label => !written.has(label)),
  }
}
