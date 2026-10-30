import type { GoogleApi } from './spend-guard-math'

/**
 * EVERY BILLED GOOGLE WEB SERVICE CALL GOES THROUGH HERE (the PROJECT MANAGER's 16:52 of 30 October 2026). The
 * database is asked first (public.google_spend_reserve, service role only); the call is made only on its yes, and a
 * database that cannot answer is a no. Nothing here holds a key: the caller's call does, and it never runs on a no.
 * scripts/guards/google-calls-through-the-spend-guard.mjs fails the build if a Places web service address appears in
 * src/ outside a file that uses this.
 */

export interface SpendRequest {
  readonly api: GoogleApi
  readonly units: number
  /** What the call is for, kept in the ledger (for example 'venue photo, Forum Melbourne'). */
  readonly purpose: string
}

/** The one method used, so a test or a script can hand in any Supabase client. */
export interface RpcClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>
}

export type Spent<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: string }

export async function withGoogleSpend<T>(db: RpcClient, req: SpendRequest, call: () => Promise<T>): Promise<Spent<T>> {
  let answer: { allowed?: unknown; reason?: unknown } | undefined
  try {
    const { data, error } = await db.rpc('google_spend_reserve', { p_api: req.api, p_units: req.units, p_purpose: req.purpose })
    if (error) return { ok: false, reason: `the cost guard could not answer, so no call was made: ${error.message}` }
    answer = Array.isArray(data) ? data[0] : undefined
  } catch (err) {
    return { ok: false, reason: `the cost guard could not answer, so no call was made: ${err instanceof Error ? err.message : String(err)}` }
  }
  if (!answer) return { ok: false, reason: 'the cost guard gave no answer, so no call was made' }
  if (answer.allowed !== true) return { ok: false, reason: typeof answer.reason === 'string' ? answer.reason : 'refused by the cost guard' }
  return { ok: true, value: await call() }
}
