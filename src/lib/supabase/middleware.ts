import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseAnonKey, getSupabaseUrl } from './env'
import { SIGNED_IN_MARKER_COOKIE, signedInMarkerOptions } from '@/lib/auth/signed-in-marker'

export async function updateSession(request: NextRequest) {
  // Stripe webhook must bypass everything - no cookie touching, no redirects.
  // Any NextResponse.redirect() from here turns into a 307 and Stripe retries.
  if (request.nextUrl.pathname === '/api/webhooks/stripe') {
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // API routes handle their own auth - never redirect them to /login
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return withSignedInMarker(supabaseResponse, request, Boolean(user))
  }

  // Default-public, explicit-protected. Only the listed prefixes require auth  -
  // adding a new public marketing/legal/help route requires zero changes here.
  const protectedPrefixes = ['/dashboard']
  const isProtectedRoute = protectedPrefixes.some(prefix =>
    request.nextUrl.pathname === prefix ||
    request.nextUrl.pathname.startsWith(`${prefix}/`)
  )

  if (!user && isProtectedRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirect', request.nextUrl.pathname)
    return withSignedInMarker(NextResponse.redirect(url), request, false)
  }

  // Redirect authenticated users away from auth pages
  if (user && (request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/signup')) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return withSignedInMarker(NextResponse.redirect(url), request, true)
  }

  return withSignedInMarker(supabaseResponse, request, Boolean(user))
}

/**
 * THE SIGNED-IN MARKER, kept in step with the session on every response
 * (src/lib/auth/signed-in-marker.ts says why). Set when there is a user and
 * the request did not already carry it; cleared when there is no user and the
 * request still carries it. Untouched otherwise, so an anonymous response
 * stays byte-for-byte cacheable.
 */
export function withSignedInMarker(response: NextResponse, request: NextRequest, signedIn: boolean): NextResponse {
  const present = request.cookies.has(SIGNED_IN_MARKER_COOKIE)
  if (signedIn && !present) {
    response.cookies.set(SIGNED_IN_MARKER_COOKIE, '1', signedInMarkerOptions(request.nextUrl.protocol === 'https:'))
  } else if (!signedIn && present) {
    response.cookies.set(SIGNED_IN_MARKER_COOKIE, '', { ...signedInMarkerOptions(request.nextUrl.protocol === 'https:'), maxAge: 0 })
  }
  return response
}
