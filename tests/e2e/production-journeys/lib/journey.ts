import { test as base, expect, type Page, type Response, type TestInfo } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

/**
 * One journey, recorded as a person's walk: every step named, timed (the step's own work, not its photograph), and
 * photographed as it ends, PASS or FAIL. A failed step keeps its screenshot and the exact line that failed; the run's
 * reporter (journey-reporter.ts) gathers every journey into summary.json and summary.md.
 *
 * The page also keeps what a visitor would suffer without seeing it as a failure message: a script error, a same site
 * request answering 400 or more, a request that never completed. Steps assert on it where it matters (cleanPage).
 */

export type StepRecord = { n: number; name: string; ms: number; ok: boolean; shot: string | null; error?: string; at?: string }
export type PageFault = { kind: 'pageerror' | 'console' | 'http' | 'failed'; detail: string; url?: string }

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 70)

function firstLine(err: unknown): string {
  const m = err instanceof Error ? err.message : String(err)
  // Playwright's messages carry ANSI colour codes; the report keeps the words.
  return m.replace(/\u001b\[[0-9;]*m/g, '').split('\n').slice(0, 6).join(' ').slice(0, 600)
}

/** The first frame inside a journey file: the line a reader opens to see what failed. */
function failingLine(err: unknown): string | undefined {
  const stack = err instanceof Error ? (err.stack ?? '') : ''
  const m = stack.match(/(tests[\\/]e2e[\\/]production-journeys[\\/][^\s):]+\.(?:journey|ts):\d+)/)
  return m ? m[1].replace(/\\/g, '/') : undefined
}

export class Journey {
  readonly steps: StepRecord[] = []
  readonly faults: PageFault[] = []
  private readonly origin: string

  constructor(
    readonly page: Page,
    private readonly info: TestInfo,
  ) {
    this.origin = new URL(info.project.use.baseURL ?? 'https://www.eventlinqs.com.au').origin
    page.on('pageerror', (e) => this.faults.push({ kind: 'pageerror', detail: firstLine(e), url: page.url() }))
    page.on('console', (m) => {
      if (m.type() === 'error') this.faults.push({ kind: 'console', detail: m.text().slice(0, 300), url: page.url() })
    })
    page.on('response', (r) => {
      if (r.status() >= 400 && this.sameSite(r.url())) this.faults.push({ kind: 'http', detail: `HTTP ${r.status()}`, url: r.url() })
    })
    page.on('requestfailed', (r) => {
      const why = r.failure()?.errorText ?? 'failed'
      // A navigation that replaces the page aborts its pending requests; that is the browser, not the site.
      if (this.sameSite(r.url()) && !/ERR_ABORTED/.test(why)) this.faults.push({ kind: 'failed', detail: why, url: r.url() })
    })
  }

  private sameSite(u: string): boolean {
    try {
      return new URL(u).origin === this.origin
    } catch {
      return false
    }
  }

  get dir(): string {
    return path.join(process.env.JOURNEY_OUT ?? 'test-results/journeys/adhoc', this.info.project.name, slug(this.info.title))
  }

  private async shoot(n: number, name: string, mark: 'ok' | 'FAIL'): Promise<string | null> {
    try {
      mkdirSync(this.dir, { recursive: true })
      const file = path.join(this.dir, `${String(n).padStart(2, '0')}-${slug(name)}${mark === 'FAIL' ? '-FAIL' : ''}.png`)
      await this.page.screenshot({ path: file, timeout: 10_000 })
      return file.replace(/\\/g, '/')
    } catch {
      return null
    }
  }

  /** One named step: its work timed, then its photograph. A failure keeps both and the failing line, then fails the journey. */
  async step<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const n = this.steps.length + 1
    return base.step(name, async () => {
      const started = Date.now()
      try {
        const out = await fn()
        const ms = Date.now() - started
        this.steps.push({ n, name, ms, ok: true, shot: await this.shoot(n, name, 'ok') })
        return out
      } catch (err) {
        const ms = Date.now() - started
        this.steps.push({ n, name, ms, ok: false, shot: await this.shoot(n, name, 'FAIL'), error: firstLine(err), at: failingLine(err) })
        throw err
      }
    })
  }

  /** Open a page as a visitor: the document must answer below 400, and the cookie question is answered 'no' if asked. */
  async open(pathname: string, opts: { allow?: number[] } = {}): Promise<Response> {
    const res = await this.page.goto(pathname, { waitUntil: 'domcontentloaded' })
    expect(res, `no response for ${pathname}`).not.toBeNull()
    const status = res!.status()
    if (!(opts.allow ?? []).includes(status)) expect(status, `${pathname} answered HTTP ${status}`).toBeLessThan(400)
    await this.refuseCookies()
    return res!
  }

  async refuseCookies(): Promise<void> {
    const refuse = this.page.locator('[data-el-consent="refuse"]').first()
    if (await refuse.isVisible().catch(() => false)) await refuse.click().catch(() => undefined)
  }

  /** No script error and no same site request failed or refused since the mark: what a visitor would have suffered. */
  faultsSince(mark: number): PageFault[] {
    return this.faults.slice(mark)
  }

  mark(): number {
    return this.faults.length
  }

  expectClean(mark: number, what: string): void {
    const bad = this.faultsSince(mark).filter((f) => f.kind !== 'console' || !/Download the React DevTools/.test(f.detail))
    expect(bad, `${what}: ${bad.map((b) => `${b.kind} ${b.detail} ${b.url ?? ''}`).join(' | ')}`).toEqual([])
  }

  write(): void {
    try {
      mkdirSync(this.dir, { recursive: true })
      writeFileSync(path.join(this.dir, 'steps.json'), JSON.stringify({ steps: this.steps, faults: this.faults }, null, 2))
    } catch {
      /* the report still carries the steps */
    }
  }
}

export const test = base.extend<{ journey: Journey }>({
  // The fixture's second argument hands the journey to the test; named run, not use, for the hooks lint rule.
  journey: async ({ page }, run, info) => {
    const j = new Journey(page, info)
    await run(j)
    j.write()
    await info.attach('journey-steps', { body: JSON.stringify({ steps: j.steps, faults: j.faults }), contentType: 'application/json' })
  },
})

export { expect }

/** A unique tag for anything a run makes, so it is findable and removable: qa-<yyyymmddhhmmss>-<4 random>. */
export function runTag(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  const r = Math.random().toString(36).slice(2, 6)
  return `qa${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}${r}`
}
