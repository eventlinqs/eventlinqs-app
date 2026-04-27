/**
 * Public Supabase client.
 *
 * USE FOR PUBLIC / ANONYMOUS DATA ONLY.
 *
 * Returns a plain @supabase/supabase-js client configured with the anon key
 * and zero session persistence. It does NOT read `cookies()` or `headers()`,
 * which is the architectural difference from `createClient()` in
 * `./server.ts`. Pages that touch `cookies()` are forced into dynamic SSR
 * by Next.js, which silently disables `generateStaticParams` and
 * `revalidate`. Using this client is what makes ISR / static generation
 * possible for public read-only pages.
 *
 * RLS still applies — anon-key reads are gated by Postgres policies, the
 * same way the server `createClient` is. Treat this as: "the same data,
 * but without the auth-session side effect that disqualifies static
 * rendering."
 *
 * SAFE for:
 * - Listing public events / organisations / categories
 * - Reading event detail content for pre-rendered pages
 * - Any read whose result is the same for an anonymous viewer
 *
 * NOT SAFE for:
 * - Anything personalised by the signed-in user (saved events, dashboard,
 *   access-code-unlocked tiers, draft / private events the user owns).
 *   For those, use `createClient()` from `./server.ts` in a dynamic route,
 *   or fetch from a client component that hits an authenticated API route.
 *
 * Usage:
 *   import { createPublicClient } from '@/lib/supabase/public-client'
 *   const supabase = createPublicClient()
 *   const { data } = await supabase
 *     .from('events')
 *     .select('*')
 *     .eq('status', 'published')
 *     .eq('visibility', 'public')
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let cachedClient: SupabaseClient | null = null

export function createPublicClient(): SupabaseClient {
  if (cachedClient) return cachedClient
  cachedClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  )
  return cachedClient
}
