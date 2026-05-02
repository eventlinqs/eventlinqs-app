import { createBrowserClient } from '@supabase/ssr'

// Module-level singleton - ensures the same client instance is returned on every
// call, including across React Strict Mode double-renders in dev. Without this,
// two clients compete for the same localStorage auth-token lock and emit warnings.
let browserClient: ReturnType<typeof createBrowserClient> | undefined

export function createClient() {
  if (browserClient) return browserClient
  browserClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  return browserClient
}

// Swallow Supabase's NavigatorLockAcquireTimeoutError - it's a transient race
// between concurrent auth-token reads and never surfaces as user-visible failure.
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason as { message?: string; name?: string } | undefined
    const msg = reason?.message ?? ''
    if (msg.includes('lock') || reason?.name === 'NavigatorLockAcquireTimeoutError') {
      event.preventDefault()
    }
  })
}
