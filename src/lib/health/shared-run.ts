/**
 * ONE SHARED RUN OF A HEAVY READ (the PM's 21:38 of 17 November 2026, alert (g), item 3; law 4, the class). At 20:37 that
 * night /admin/today and /admin/health each ran the whole health check on every render, and the admin sidebar's
 * prefetches rendered them again and again: 131 check lines in a minute and 76 statement timeouts across the site. A
 * render now reads one run that stays fresh for ADMIN_CHECKS_FRESH_MS, and renders that start together wait on the same
 * run. A failed run is never kept, so the next render tries again. Per server instance (Fluid compute reuses one across
 * requests). Pure: the run and the clock are given.
 */
export const ADMIN_CHECKS_FRESH_MS = 60_000

export function sharedRun<T>(run: () => Promise<T>, opts: { readonly freshMs?: number; readonly now?: () => number } = {}): () => Promise<T> {
  const freshMs = opts.freshMs ?? ADMIN_CHECKS_FRESH_MS
  const now = opts.now ?? Date.now
  let kept: { readonly at: number; readonly value: Promise<T> } | null = null
  return () => {
    const at = now()
    if (kept !== null && at - kept.at < freshMs) return kept.value
    const value = run()
    const entry = { at, value }
    kept = entry
    value.catch(() => {
      if (kept === entry) kept = null
    })
    return value
  }
}
