import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * A ROUTE THAT SAYS NOINDEX IS SERVED NOINDEX (found driving /kit on a build, 29 October 2026: the route set
 * 'noindex, nofollow' and the response read 'index, follow'). next.config.ts sets X-Robots-Tag on '/:path*', and
 * Next 16.3.0's own docs say "If two headers match the same path and set the same header key, the last header key will
 * override the first" (node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/headers.md), so
 * a route handler's own header never reached the client. An image has no other signal: no meta tag can carry it.
 *
 * So, for every route handler under src/app that sets X-Robots-Tag to a noindex value, the LAST rule of the real
 * config's headers() that matches its path and names X-Robots-Tag must say noindex too.
 */
const ROOT = join(__dirname, '..', '..', '..')
const APP = join(ROOT, 'src', 'app')

function routes(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const full = join(dir, e)
    return statSync(full).isDirectory() ? routes(full) : e === 'route.ts' ? [full] : []
  })
}

/** The path a route file answers, every dynamic segment filled, route groups dropped. */
function samplePath(file: string): string {
  const parts = relative(APP, file).split(sep).slice(0, -1).filter((s) => !/^\(.*\)$/.test(s))
  return '/' + parts.map((s) => (/^\[.*\]$/.test(s) ? 'sample' : s)).join('/')
}

/** Whether a Next header source ('/kit/:path*', '/events/:slug') matches a path. */
function matches(source: string, path: string): boolean {
  const pattern = source
    .split('/')
    .map((s) => (/^:\w+\*$/.test(s) ? '.*' : /^:\w+$/.test(s) ? '[^/]+' : s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('/')
    .replace(/\/\.\*$/, '(?:/.*)?')
  return new RegExp(`^${pattern}$`).test(path)
}

const saysNoindex = routes(APP)
  .map((file) => ({ file: relative(ROOT, file).split(sep).join('/'), text: readFileSync(file, 'utf8') }))
  .filter(({ text }) => /x-robots-tag['"]?\s*[:,]\s*['"][^'"]*noindex/i.test(text))

describe('a route handler that says noindex is served noindex', () => {
  it('finds the route handlers that say noindex, so a pass is not an empty sweep', () => {
    expect(saysNoindex.map((r) => r.file)).toContain('src/app/kit/[pieceId]/[n]/route.ts')
  })

  it('the last config rule naming X-Robots-Tag for each such path says noindex too', async () => {
    const mod = await import('../../../next.config')
    const config = mod.default as unknown as { headers: () => Promise<{ source: string; headers: { key: string; value: string }[] }[]> }
    const rules = await config.headers()
    const faults: string[] = []
    for (const { file } of saysNoindex) {
      const path = samplePath(join(ROOT, file))
      const last = rules.filter((r) => matches(r.source, path) && r.headers.some((h) => h.key.toLowerCase() === 'x-robots-tag')).pop()
      const value = last?.headers.find((h) => h.key.toLowerCase() === 'x-robots-tag')?.value ?? '(none)'
      if (!/noindex/i.test(value)) faults.push(`${file} (${path}) says noindex, but the config's last rule for it, '${last?.source}', serves '${value}'`)
    }
    expect(faults).toEqual([])
  })
})
