import 'server-only'
import type { NextResponse } from 'next/server'
import { applyRateLimit } from '@/lib/rate-limit/middleware'
import { authenticateApiKey, noteApiKeyUsed, type ApiKeyScope } from './keys'
import {
  asUuid,
  parsePage,
  readList,
  readOne,
  type ApiV1Resource,
} from './reads'
import {
  apiV1BadRequest,
  apiV1Item,
  apiV1List,
  apiV1NotFound,
  apiV1Unauthorised,
  apiV1Unavailable,
} from './response'

/**
 * API1. THE TWO HANDLERS EVERY v1 ROUTE FILE DELEGATES TO.
 *
 * Six route files, two handlers, one order of operations. A route file holds no
 * database client, builds no response and makes no decision, which is not
 * tidiness: it is what lets a guard read six files and know that all six are
 * scoped, instead of reading six files and hoping.
 *
 * THE ORDER, AND WHY EACH STEP IS WHERE IT IS.
 *
 *   1. `api-v1-auth`, keyed by IP, BEFORE the key is read. It has to be before,
 *      because a caller with no valid key is never named and so can never be
 *      throttled by the organiser bucket.
 *   2. AUTHENTICATE. Reads the database every time, deliberately uncached, so a
 *      key revoked a second ago is refused now. 401 with `WWW-Authenticate`.
 *   3. `api-v1-read`, keyed by the ORGANISATION, AFTER the key names it. The
 *      Scope v5 section 4.1 organiser tier, 1000 a minute.
 *   4. READ, through the scoped readers, which are the only code on the
 *      platform that touches these three views.
 *   5. RESPOND, through the one response builder, which puts the organisation
 *      id on every payload.
 *
 * `noteApiKeyUsed` is fired and NOT awaited. An organiser should be able to see
 * that an integration has gone quiet, and no API call should ever be slower, or
 * fail, because that column could not be written.
 */

type Authenticated =
  | { ok: true; scope: ApiKeyScope }
  | { ok: false; response: NextResponse }

async function admit(request: Request): Promise<Authenticated> {
  const preAuth = await applyRateLimit('api-v1-auth', request)
  if (preAuth) return { ok: false, response: preAuth }

  const auth = await authenticateApiKey(request.headers.get('authorization'))
  if (!auth.ok) return { ok: false, response: apiV1Unauthorised(auth.reason) }

  const tiered = await applyRateLimit('api-v1-read', request, auth.scope.organisationId)
  if (tiered) return { ok: false, response: tiered }

  void noteApiKeyUsed(auth.scope.keyId)
  return { ok: true, scope: auth.scope }
}

/**
 * GET /api/v1/<resource>
 *
 * `?event_id=` is honoured on orders and attendees. An event id belonging to
 * somebody else is not refused and is not an error: it simply matches nothing,
 * because the organisation predicate is still on the query. Refusing it would
 * be the same existence oracle a 403 is.
 */
export async function handleList(request: Request, resource: ApiV1Resource): Promise<NextResponse> {
  const admitted = await admit(request)
  if (!admitted.ok) return admitted.response
  const { scope } = admitted

  const params = new URL(request.url).searchParams
  const rawEventId = params.get('event_id')
  if (rawEventId !== null && asUuid(rawEventId) === null) {
    return apiV1BadRequest(scope, 'event_id must be a uuid')
  }

  const page = parsePage(params)
  const result = await readList(scope, resource, page, { eventId: asUuid(rawEventId) ?? undefined })
  if (!result.ok) return apiV1Unavailable(scope, resource)

  return apiV1List(scope, resource, result.rows, {
    limit: page.limit,
    offset: page.offset,
    total: result.total,
    hasMore: page.offset + result.rows.length < result.total,
  })
}

/**
 * GET /api/v1/<resource>/<id>
 *
 * An id that is not a uuid, an id that does not exist, and an id that belongs
 * to another organiser all answer 404. The last two are the same answer because
 * they are, in this module, the same event: the scope is part of the query, so
 * nothing here ever learns that the row exists.
 */
export async function handleItem(
  request: Request,
  resource: ApiV1Resource,
  rawId: string,
): Promise<NextResponse> {
  const admitted = await admit(request)
  if (!admitted.ok) return admitted.response
  const { scope } = admitted

  const id = asUuid(rawId)
  if (!id) return apiV1NotFound(scope, resource)

  const result = await readOne(scope, resource, id)
  if (!result.ok) return apiV1Unavailable(scope, resource)
  if (!result.row) return apiV1NotFound(scope, resource)

  return apiV1Item(scope, resource, result.row)
}
