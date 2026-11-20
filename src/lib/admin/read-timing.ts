/**
 * EACH READ OF AN ADMIN PAGE, TIMED ON THE SERVER'S OWN CLOCK (law 41, Lawal's 16:08 of 20 November 2026: every page in
 * one second; the PM's 00:05:28 of 21 November 2026, item 1: each admin fault named with its slowest read). The walk in
 * Lawal's Chrome measured /admin/today at 17.1, 9.9 and 22.8 seconds with its first byte under one, and the browser
 * cannot see which of its eleven reads holds the page. Each read is wrapped here; when the page's reads settle, one line
 * names every read and its milliseconds, slowest first, so the runtime log of any visit names the cause. It changes no
 * answer and swallows no error: a read that throws still throws, after it is timed.
 */
export type ReadTimes = { readonly page: string; readonly reads: { readonly name: string; readonly ms: number; readonly failed: boolean }[] }

export function readClock(page: string): { readonly timed: <T>(name: string, read: Promise<T>) => Promise<T>; readonly report: () => ReadTimes } {
  const reads: { name: string; ms: number; failed: boolean }[] = []
  const timed = <T,>(name: string, read: Promise<T>): Promise<T> => {
    const started = performance.now()
    return read.then(
      (value) => {
        reads.push({ name, ms: Math.round(performance.now() - started), failed: false })
        return value
      },
      (error: unknown) => {
        reads.push({ name, ms: Math.round(performance.now() - started), failed: true })
        throw error
      },
    )
  }
  const report = (): ReadTimes => ({ page, reads: [...reads].sort((a, b) => b.ms - a.ms) })
  return { timed, report }
}

/** The one log line: the page, then every read slowest first, e.g. "[admin-read] /admin/today 9120 ms: centre 9120, ...". */
export function readTimesLine(t: ReadTimes): string {
  const slowest = t.reads[0]?.ms ?? 0
  return `[admin-read] ${t.page} ${slowest} ms: ${t.reads.map((r) => `${r.name} ${r.ms}${r.failed ? ' (failed)' : ''}`).join(', ')}`
}
