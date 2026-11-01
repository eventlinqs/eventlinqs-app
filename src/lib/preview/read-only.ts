import { NextResponse } from 'next/server'

/**
 * THE DESIGN PREVIEW READS PRODUCTION AND WRITES NOTHING (the CONTROLLER's ruling of 1 November 2026, 11:42, (2)).
 *
 * The preview of feat/w5-design-preview runs on production's URL and ANON key (branch scoped Preview variables), never
 * the service role and never a write credential. PREVIEW_READ_ONLY=1, set on that branch only, makes the proxy refuse
 * every request that could write, BEFORE the session is refreshed or any client is made:
 *   - every method but GET, HEAD and OPTIONS (a server action is a POST to its page, so it is refused here too);
 *   - the pages that withdraw on a plain GET today (Remind me's stop page and the unsubscribe pages), because a method
 *     gate alone would let them through.
 * Unset (production, every other preview), it refuses nothing.
 */
export const PREVIEW_READ_ONLY_MESSAGE = 'Preview only, nothing is saved'

const READS = new Set(['GET', 'HEAD', 'OPTIONS'])
const WITHDRAWS_ON_GET = [/^\/remind\/stop\//, /^\/unsubscribe\//, /^\/waitlist\/unsubscribe\//]

export function previewReadOnlyOn(env: Record<string, string | undefined> = process.env): boolean {
  return env.PREVIEW_READ_ONLY === '1'
}

export function previewReadOnlyRefusal(
  method: string,
  pathname: string,
  env: Record<string, string | undefined> = process.env,
): NextResponse | null {
  if (!previewReadOnlyOn(env)) return null
  const writes = !READS.has(method.toUpperCase()) || WITHDRAWS_ON_GET.some((re) => re.test(pathname))
  if (!writes) return null
  return new NextResponse(PREVIEW_READ_ONLY_MESSAGE, {
    status: 403,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'X-Robots-Tag': 'noindex, nofollow', 'cache-control': 'no-store' },
  })
}
