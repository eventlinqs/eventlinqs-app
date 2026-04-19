import { cookies } from 'next/headers'
import { randomUUID } from 'crypto'

/**
 * Guest session cookie — owns anonymous checkouts so the reservations
 * table can satisfy its (user_id IS NOT NULL OR session_id IS NOT NULL)
 * constraint when the buyer is not signed in.
 *
 * The cookie is httpOnly so browser JS can't read it, SameSite=Lax so
 * it's sent on top-level navigations (e.g. router.push to /checkout),
 * and secure in production. 30-day TTL.
 *
 * Both helpers are async because Next 16's cookies() is async.
 * `getOrCreate` calls cookies().set(), which only succeeds inside a
 * Server Action, Route Handler, or Middleware — use it from server
 * actions that need to attach ownership to a new row. Reads from
 * Server Components use `get` instead.
 */

export const GUEST_SESSION_COOKIE = 'eventlinqs_guest_session'
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30 // 30 days

export async function getOrCreateGuestSessionId(): Promise<string> {
  const jar = await cookies()
  const existing = jar.get(GUEST_SESSION_COOKIE)?.value
  if (existing) return existing

  const id = randomUUID()
  jar.set(GUEST_SESSION_COOKIE, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  })
  return id
}

export async function getGuestSessionId(): Promise<string | null> {
  const jar = await cookies()
  return jar.get(GUEST_SESSION_COOKIE)?.value ?? null
}
