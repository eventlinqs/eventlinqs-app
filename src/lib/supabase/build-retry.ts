/**
 * Build-time fetch resilience against the live Supabase pool.
 *
 * Static generation runs page data fetchers against the live pool. Under the
 * export-worker fan-out the pool can momentarily reject with PGRST003
 * (pool exhausted) or time a statement out (57014); a single transient hit
 * should not ship an empty page to the ISR cache.
 *
 * `withBuildRetry` retries a supabase-js call on those transient pool/timeout
 * errors with exponential backoff and returns the final `{ data, error }` so
 * the caller's existing soft-fallback (`error || !data -> empty`) still runs.
 * Real, non-transient errors return immediately and are NOT masked: the caller
 * handles them exactly as before, at build and at runtime alike.
 */

const POOL_ERROR =
  /PGRST003|statement timeout|canceling statement|too many connections|remaining connection slots|57014|pool|ECONNRESET|ETIMEDOUT|fetch failed/i

export function isTransientPoolError(error: unknown): boolean {
  if (!error) return false
  const parts: string[] = []
  if (error instanceof Error) parts.push(error.message)
  if (typeof error === 'string') parts.push(error)
  if (typeof error === 'object') {
    const e = error as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown }
    for (const v of [e.message, e.code, e.details, e.hint]) {
      if (typeof v === 'string') parts.push(v)
    }
  }
  return POOL_ERROR.test(parts.join(' '))
}

type SupabaseResult<T> = { data: T | null; error: unknown }

export async function withBuildRetry<T>(
  run: () => PromiseLike<SupabaseResult<T>>,
  {
    retries = 3,
    baseMs = 250,
    label = 'query',
  }: { retries?: number; baseMs?: number; label?: string } = {},
): Promise<SupabaseResult<T>> {
  let res = await run()
  let attempt = 0
  while (res.error && isTransientPoolError(res.error) && attempt < retries) {
    const delay = baseMs * 2 ** attempt
    await new Promise(r => setTimeout(r, delay))
    attempt += 1
    res = await run()
  }
  if (res.error && isTransientPoolError(res.error)) {
    // Exhausted: hand the final error back so the caller's soft-fallback runs
    // (an empty page now, real data on the next ISR revalidate). Logged, not
    // swallowed, and never thrown here - non-transient errors were returned
    // on the first pass untouched.
    console.warn(
      `[build-retry] ${label}: transient pool error after ${retries} retries; failing soft to ISR`,
    )
  }
  return res
}
