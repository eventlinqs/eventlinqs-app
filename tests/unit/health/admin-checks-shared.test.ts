import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ADMIN_CHECKS_FRESH_MS, sharedRun } from '@/lib/health/shared-run'

/*
 * ONE HEAVY ADMIN RENDER CANNOT LOAD THE DATABASE FOR THE WHOLE SITE (the PM's 21:38 of 17 November 2026, alert (g), item 3;
 * law 4, the class). At 20:37 that night /admin/today and /admin/health each ran the whole health check on every render
 * (131 check lines in one minute: Stripe probes, the Anthropic key, Resend, every database check), and the sidebar's
 * prefetches rendered them again and again; production answered with 76 statement timeouts. The admin now reads one shared
 * run, fresh for 60 seconds, and renders that start together wait on the same run. The sentinel and the heartbeat still
 * run the check themselves every time: their job is to catch a fault the moment it appears.
 */
describe('sharedRun', () => {
  it('two renders inside the window run the check once', async () => {
    let runs = 0
    let t = 1_000_000
    const read = sharedRun(async () => ++runs, { now: () => t })
    expect(await read()).toBe(1)
    t += ADMIN_CHECKS_FRESH_MS - 1
    expect(await read()).toBe(1)
    expect(runs).toBe(1)
  })

  it('renders that start together share one run', async () => {
    let runs = 0
    const read = sharedRun(async () => {
      runs += 1
      await new Promise((r) => setTimeout(r, 5))
      return runs
    })
    const all = await Promise.all([read(), read(), read(), read()])
    expect(all).toEqual([1, 1, 1, 1])
    expect(runs).toBe(1)
  })

  it('a render after the window runs it again', async () => {
    let runs = 0
    let t = 0
    const read = sharedRun(async () => ++runs, { now: () => t })
    await read()
    t += ADMIN_CHECKS_FRESH_MS
    expect(await read()).toBe(2)
  })

  it('a failed run is never kept: the next render runs it again', async () => {
    let runs = 0
    const read = sharedRun(async () => {
      runs += 1
      if (runs === 1) throw new Error('the database did not answer')
      return runs
    })
    await expect(read()).rejects.toThrow('the database did not answer')
    expect(await read()).toBe(2)
  })
})

describe('the admin never runs the whole health check itself', () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const p = join(dir, name)
      return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(name) ? [p] : []
    })

  it("the founder dashboard on /admin/today never runs the battery: it reads the platform sentinel's newest stored run (P0, 20 November 2026)", () => {
    const dash = readFileSync(join(process.cwd(), 'src', 'lib', 'admin', 'founder-dashboard.ts'), 'utf8')
    expect(dash).not.toMatch(/runAllChecks(ForAdmin)?\(/)
    expect(dash).toMatch(/latestSentinelRun\(db, 'platform'\)/)
    const route = readFileSync(join(process.cwd(), 'src', 'app', 'api', 'cron', 'health-sentinel', 'route.ts'), 'utf8')
    // The sentinel keeps every run but a drill, before it answers.
    expect(route).toMatch(/if \(!drill\) \{[\s\S]*recordSentinelRun\(createAdminClient\(\), results, new Date\(\), dry, 'platform'\)/)
  })

  it('every admin surface reads runAllChecksForAdmin', () => {
    const faults = ['src/app/admin', 'src/lib/admin']
      .flatMap((r) => files(join(process.cwd(), r)))
      .filter((f) => /\brunAllChecks\(/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(process.cwd(), f).replace(/\\/g, '/'))
    expect(faults).toEqual([])
  })
})
