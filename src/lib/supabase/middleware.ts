import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  // Stripe webhook must bypass everything — no cookie touching, no redirects.
  // Any NextResponse.redirect() from here turns into a 307 and Stripe retries.
  if (request.nextUrl.pathname === '/api/webhooks/stripe') {
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

  // API routes handle their own auth — never redirect them to /login
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return supabaseResponse
  }

  // Default-public, explicit-protected. Only the listed prefixes require auth —
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
    return NextResponse.redirect(url)
  }

  // Redirect authenticated users away from auth pages
  if (user && (request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/signup')) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
