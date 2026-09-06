import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { sweepEventStorage, type StorageSweepResult } from '@/lib/upload'
import { revalidateEventSurfaces } from '@/lib/events/revalidate-event'
import { recordLifecycleAudit, type LifecycleActor } from '@/lib/events/lifecycle-audit'
import {
  deleteRefusalSentence,
  isMoneyRefusal,
  judgeDeleteEligibility,
  readMoneyRecordCounts,
  type DeleteEligibility,
} from '@/lib/events/delete-eligibility'
import type { EventStatus } from '@/types/database'

/**
 * ONE DELETE FOR EVERY DOOR. The organiser action and the admin console both
 * come through here, so an event is deleted the same way whoever asks: the
 * row (which the database may refuse), then the storage it owned, then the
 * audit row, then every cached surface it appeared on.
 *
 * THE ORDER IS THE DESIGN. The row goes first because the money-records
 * trigger may refuse it, and a refused delete must leave the organiser's
 * artwork exactly where it was. Storage is swept only once the row is gone.
 *
 * WHO RUNS THE DELETE. The caller hands over the client the delete should run
 * under. The organiser action hands over the SESSION client, so row-level
 * security decides who may (the organisation owner) and a manager's attempt
 * deletes nothing rather than something; the admin console hands over the
 * service role. Neither can get past the trigger: it fires for every role.
 *
 * WHAT THIS DOES NOT DO. It does not check ownership itself. The organiser
 * action does that before calling, with the same gate every other organiser
 * action uses, and the session client enforces it again in the database.
 */

export interface DeleteEventClient {
  from(table: string): unknown
}

interface DeleteChain {
  delete(): {
    eq(col: string, value: string): {
      select(cols: string): PromiseLike<{ data: unknown[] | null; error: { message: string; hint?: string | null } | null }>
    }
  }
}

export type DeleteEventOutcome =
  | { ok: true; slug: string | null; title: string; storage: StorageSweepResult; eligibility: DeleteEligibility }
  | { ok: false; reason: 'not_found' | 'money_records' | 'not_allowed' | 'failed'; message: string; eligibility?: DeleteEligibility }

export async function deleteEventEverywhere(input: {
  eventId: string
  actor: LifecycleActor
  deleteWith: DeleteEventClient
}): Promise<DeleteEventOutcome> {
  const admin = createAdminClient()

  // Read what the delete will need AFTER the row is gone: the storage owner,
  // the cached surfaces to clear, and the state to record.
  const { data: row, error: readError } = await admin
    .from('events')
    .select(
      'id, slug, title, status, organisation_id, created_by, cover_image_url, gallery_urls, venue_city, tags, archived_from_status, category:event_categories(slug), organisation:organisations(slug)',
    )
    .eq('id', input.eventId)
    .maybeSingle()
  if (readError) return { ok: false, reason: 'failed', message: 'The event could not be read.' }
  if (!row) return { ok: false, reason: 'not_found', message: 'Event not found' }

  // The same count the trigger reads, asked first so the refusal is a sentence
  // the organiser can act on rather than a Postgres message. The trigger still
  // decides; this is the courtesy, not the enforcement.
  const eligibility = judgeDeleteEligibility(await readMoneyRecordCounts(admin, input.eventId))
  if (!eligibility.deletable) {
    return { ok: false, reason: 'money_records', message: deleteRefusalSentence(eligibility), eligibility }
  }

  const { data: deleted, error } = await (input.deleteWith.from('events') as DeleteChain)
    .delete()
    .eq('id', input.eventId)
    .select('id')

  if (error) {
    if (isMoneyRefusal(error)) {
      // A record appeared between the count and the delete. The database held.
      const fresh = judgeDeleteEligibility(await readMoneyRecordCounts(admin, input.eventId))
      return { ok: false, reason: 'money_records', message: deleteRefusalSentence(fresh), eligibility: fresh }
    }
    console.error('[delete-event] delete refused for', input.eventId, error)
    return { ok: false, reason: 'failed', message: 'The event could not be deleted.' }
  }
  if (!deleted || deleted.length === 0) {
    // Row-level security filtered the row: the caller may not delete it.
    return { ok: false, reason: 'not_allowed', message: 'Only the organisation owner can delete an event.' }
  }

  const galleryUrls = Array.isArray(row.gallery_urls)
    ? (row.gallery_urls as unknown[])
        .map((g) => (typeof g === 'string' ? g : (g as { url?: string } | null)?.url))
        .filter((u): u is string => typeof u === 'string')
    : []
  const storage = await sweepEventStorage({
    eventId: input.eventId,
    createdBy: typeof row.created_by === 'string' ? row.created_by : null,
    urls: [row.cover_image_url, ...galleryUrls].filter((u): u is string => typeof u === 'string'),
  })
  if (storage.remaining > 0) {
    console.error('[delete-event] storage sweep left', storage.remaining, 'objects for event', input.eventId, storage.prefixes)
  }

  await recordLifecycleAudit({
    action: 'event.deleted',
    actor: input.actor,
    event: {
      id: row.id,
      slug: row.slug,
      title: row.title,
      organisation_id: row.organisation_id,
      status: row.status as EventStatus,
      archived_from_status: (row.archived_from_status as EventStatus | null) ?? null,
    },
    metadata: {
      moneyRecords: eligibility.counts,
      storage: { prefixes: storage.prefixes, removed: storage.removed, remaining: storage.remaining },
    },
  })

  const category = row.category as { slug?: string } | { slug?: string }[] | null
  const organisation = row.organisation as { slug?: string } | { slug?: string }[] | null
  revalidateEventSurfaces({
    slug: row.slug,
    venue_city: row.venue_city,
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    category_slug: (Array.isArray(category) ? category[0]?.slug : category?.slug) ?? null,
    organiser_handle: (Array.isArray(organisation) ? organisation[0]?.slug : organisation?.slug) ?? null,
  })

  return { ok: true, slug: row.slug, title: row.title, storage, eligibility }
}
