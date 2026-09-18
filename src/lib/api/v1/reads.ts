import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ApiKeyScope } from './keys'

/**
 * API1. THE ONLY PLACE A ROW IS READ FOR THE PUBLIC API.
 *
 * Six routes, three resources, one file, and every query in it ends in the same
 * predicate: `.eq('organisation_id', scope.organisationId)`. That uniformity is
 * the point, and it is what `scripts/guards/api-v1-organiser-scope.mjs` proves
 * on every build. A route file cannot read a row of its own, because it holds
 * no client; this module cannot read an unscoped row, because the guard reads
 * every `.from(` in it and demands the predicate in the same chain.
 *
 * THE OBJECTS ARE VIEWS, NOT TABLES, and each one carries organisation_id. That
 * is why the predicate can be identical across three resources whose underlying
 * tables are not: `tickets` has no organisation_id at all, and the view does
 * that join once, in the database. The reasoning in full is at the top of
 * supabase/migrations/20260918000010_organiser_api_keys.sql.
 *
 * THE SERVICE ROLE, AND WHY THAT IS NOT A HOLE. These views are readable by
 * `service_role` and by nobody else (the migration revokes `anon` and
 * `authenticated`), and every write privilege is revoked from every role
 * including `service_role`. So the client used here can select these three
 * objects and can do nothing else with them, and the scope predicate is applied
 * before the rows leave the database rather than after.
 *
 * A MISSING ROW AND SOMEBODY ELSE'S ROW ARE THE SAME EVENT HERE. `readOne`
 * returns null for both, because the scope is part of the query rather than a
 * check after it. The caller therefore cannot tell them apart even if it wanted
 * to, which is how "404, not 403" is made structural instead of remembered.
 */

/** The three readable objects, and their public names. Nothing else is reachable. */
export const API_V1_RESOURCES = {
  events: 'api_v1_events',
  orders: 'api_v1_orders',
  attendees: 'api_v1_attendees',
} as const

export type ApiV1Resource = keyof typeof API_V1_RESOURCES

/**
 * Pagination bounds.
 *
 * 50 by default because that is one screen of an integrator's table; 200 as the
 * ceiling because a page is a unit of work and an unbounded one is how a read
 * API becomes an export endpoint by accident.
 */
export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 200

export type ReadPage = { limit: number; offset: number }

export type ListResult =
  | { ok: true; rows: unknown[]; total: number }
  | { ok: false }

export type ItemResult =
  | { ok: true; row: unknown | null }
  | { ok: false }

/** Newest first on all three, because an integrator polls for what is new. */
const ORDER_COLUMN: Record<ApiV1Resource, string> = {
  events: 'created_at',
  orders: 'created_at',
  attendees: 'created_at',
}

export async function readList(
  scope: ApiKeyScope,
  resource: ApiV1Resource,
  page: ReadPage,
  filter?: { eventId?: string },
): Promise<ListResult> {
  const from = page.offset
  const to = page.offset + page.limit - 1

  if (resource === 'events') {
    const { data, count, error } = await createAdminClient()
      .from(API_V1_RESOURCES.events)
      .select('*', { count: 'exact' })
      .eq('organisation_id', scope.organisationId)
      .order(ORDER_COLUMN.events, { ascending: false })
      .range(from, to)
    if (error) return { ok: false }
    return { ok: true, rows: data ?? [], total: count ?? 0 }
  }

  if (resource === 'orders') {
    let query = createAdminClient()
      .from(API_V1_RESOURCES.orders)
      .select('*', { count: 'exact' })
      .eq('organisation_id', scope.organisationId)
    if (filter?.eventId) query = query.eq('event_id', filter.eventId)
    const { data, count, error } = await query
      .order(ORDER_COLUMN.orders, { ascending: false })
      .range(from, to)
    if (error) return { ok: false }
    return { ok: true, rows: data ?? [], total: count ?? 0 }
  }

  let query = createAdminClient()
    .from(API_V1_RESOURCES.attendees)
    .select('*', { count: 'exact' })
    .eq('organisation_id', scope.organisationId)
  if (filter?.eventId) query = query.eq('event_id', filter.eventId)
  const { data, count, error } = await query
    .order(ORDER_COLUMN.attendees, { ascending: false })
    .range(from, to)
  if (error) return { ok: false }
  return { ok: true, rows: data ?? [], total: count ?? 0 }
}

/**
 * One row by id, within the scope.
 *
 * Null means "there is no such row FOR YOU", and the caller turns that into a
 * 404 whether the id is fictional or belongs to a competitor.
 */
export async function readOne(
  scope: ApiKeyScope,
  resource: ApiV1Resource,
  id: string,
): Promise<ItemResult> {
  if (resource === 'events') {
    const { data, error } = await createAdminClient()
      .from(API_V1_RESOURCES.events)
      .select('*')
      .eq('organisation_id', scope.organisationId)
      .eq('id', id)
      .maybeSingle()
    if (error) return { ok: false }
    return { ok: true, row: data ?? null }
  }

  if (resource === 'orders') {
    const { data, error } = await createAdminClient()
      .from(API_V1_RESOURCES.orders)
      .select('*')
      .eq('organisation_id', scope.organisationId)
      .eq('id', id)
      .maybeSingle()
    if (error) return { ok: false }
    return { ok: true, row: data ?? null }
  }

  const { data, error } = await createAdminClient()
    .from(API_V1_RESOURCES.attendees)
    .select('*')
    .eq('organisation_id', scope.organisationId)
    .eq('id', id)
    .maybeSingle()
  if (error) return { ok: false }
  return { ok: true, row: data ?? null }
}

/**
 * `?limit=` and `?offset=`, clamped rather than refused.
 *
 * An integrator who asks for 5000 gets 200 and a `page` block telling them so,
 * which is a page they can iterate; a 400 is a page they have to read the
 * documentation to fix.
 */
export function parsePage(params: URLSearchParams): ReadPage {
  return {
    limit: clamp(params.get('limit'), DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE),
    offset: clamp(params.get('offset'), 0, 0, Number.MAX_SAFE_INTEGER),
  }
}

function clamp(raw: string | null, fallback: number, low: number, high: number): number {
  if (raw === null || raw.trim() === '') return fallback
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(Math.max(parsed, low), high)
}

/** A uuid, or nothing. An id that is not one never reaches a query. */
export function asUuid(raw: string | null | undefined): string | null {
  if (!raw) return null
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw) ? raw : null
}
