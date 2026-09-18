import { NextResponse } from 'next/server'
import type { ApiKeyScope } from './keys'

/**
 * API1. THE ONLY PLACE A v1 RESPONSE IS BUILT.
 *
 * The item asks that "every response carries the organiser id". That is a
 * property of a shape, and a property of a shape is only true if there is one
 * shape. So every v1 route returns through here, no route calls
 * `NextResponse.json` itself, and the organisation id is injected by this file
 * rather than remembered by six handlers.
 *
 * WHY IT MATTERS TO AN INTEGRATOR rather than being decoration: an organiser
 * with three businesses holds three keys, and a response that does not name
 * which business it is about is a response that gets filed against the wrong
 * one. The id is the answer to "whose data is this", on every single payload.
 *
 * THE REFUSALS THAT CANNOT CARRY IT ARE THE ONES BEFORE THE KEY IS KNOWN, and
 * they are the only ones: `apiV1Unauthorised` is reached when there is no valid
 * key, so there is no organisation to name. That is stated here rather than
 * left as a gap somebody finds later.
 *
 * 404 AND NEVER 403. A v1 route asked for an id it may not see answers exactly
 * as it answers for an id that does not exist. A 403 is an existence oracle: it
 * tells the holder of organiser A's key that a given uuid is a real event
 * belonging to somebody, which is a fact they were not given a key for. There
 * is no `apiV1Forbidden` in this file on purpose, and the guard fails the build
 * if a 403 appears anywhere on the v1 surface.
 */

export type ApiV1Page = {
  limit: number
  offset: number
  total: number
  hasMore: boolean
}

function withScope(scope: ApiKeyScope, body: Record<string, unknown>): Record<string, unknown> {
  return { ok: true, organisation_id: scope.organisationId, ...body }
}

export function apiV1Json(
  scope: ApiKeyScope,
  body: Record<string, unknown>,
  init?: { status?: number; headers?: HeadersInit },
): NextResponse {
  return NextResponse.json(withScope(scope, body), {
    status: init?.status ?? 200,
    headers: { 'Cache-Control': 'no-store', ...(init?.headers ?? {}) },
  })
}

export function apiV1List(
  scope: ApiKeyScope,
  resource: string,
  rows: unknown[],
  page: ApiV1Page,
): NextResponse {
  return apiV1Json(scope, { resource, data: rows, page })
}

export function apiV1Item(scope: ApiKeyScope, resource: string, row: unknown): NextResponse {
  return apiV1Json(scope, { resource, data: row })
}

/**
 * The one answer for "no such row" and for "not yours". One function, so the
 * two cases are physically incapable of differing.
 */
export function apiV1NotFound(scope: ApiKeyScope, resource: string): NextResponse {
  return NextResponse.json(
    { ok: false, organisation_id: scope.organisationId, error: 'not_found', resource },
    { status: 404, headers: { 'Cache-Control': 'no-store' } },
  )
}

export function apiV1BadRequest(scope: ApiKeyScope, message: string): NextResponse {
  return NextResponse.json(
    { ok: false, organisation_id: scope.organisationId, error: 'bad_request', message },
    { status: 400, headers: { 'Cache-Control': 'no-store' } },
  )
}

export function apiV1Unavailable(scope: ApiKeyScope, resource: string): NextResponse {
  return NextResponse.json(
    { ok: false, organisation_id: scope.organisationId, error: 'read_failed', resource },
    { status: 503, headers: { 'Cache-Control': 'no-store' } },
  )
}

/**
 * The refusal before a key is known, and therefore the only one with no
 * organisation id on it. `WWW-Authenticate` is sent so a client library can
 * tell "your credential is wrong" from "your request is wrong" without parsing
 * the body.
 */
export function apiV1Unauthorised(reason: string): NextResponse {
  return NextResponse.json(
    { ok: false, error: 'unauthorised', reason },
    {
      status: 401,
      headers: {
        'Cache-Control': 'no-store',
        'WWW-Authenticate': 'Bearer realm="EventLinqs API v1"',
      },
    },
  )
}
