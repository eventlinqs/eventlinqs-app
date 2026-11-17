import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * THE ADMIN'S LINKS NEVER PREFETCH (the PM's 20:50 of 17 November 2026, item 1; law 4, the class). At 20:37 to 20:41 that
 * night Lawal's admin session made 229 requests, 220 of them .rsc prefetches of admin pages, and the database answered
 * with 76 statement timeouts at 20:38 to 20:39: every admin page and the public guides stalled, and /admin/social read
 * as 'not working, no button working' (production's request and runtime logs, read with vercel logs). Next.js prefetches
 * a link as it enters the viewport, and for a dynamic route 'the partial route down to the nearest segment with a
 * loading.js boundary'; the admin has none, so each prefetch rendered a whole admin page with its reads
 * (node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md, Next 16.4.5). With prefetch={false},
 * 'Prefetching will never happen both on entering the viewport and on hover'. Every <Link> in the admin carries it.
 */
const ROOTS = ['src/app/admin', 'src/components/admin']
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? files(p) : /\.(tsx|jsx)$/.test(name) ? [p] : []
  })

describe("the admin's links", () => {
  const all = ROOTS.flatMap((r) => files(join(process.cwd(), r)))

  it('there are admin files with links to judge', () => {
    expect(all.filter((f) => /<Link[\s>]/.test(readFileSync(f, 'utf8'))).length).toBeGreaterThan(5)
  })

  it('every <Link> in the admin carries prefetch={false}', () => {
    const faults: string[] = []
    for (const f of all) {
      const text = readFileSync(f, 'utf8')
      for (const m of text.matchAll(/<Link(?=[\s>])/g)) {
        // The opening tag runs to its first '>' that is not inside a {...} expression.
        let depth = 0
        let end = m.index! + 5
        for (; end < text.length; end += 1) {
          const ch = text[end]
          if (ch === '{') depth += 1
          else if (ch === '}') depth -= 1
          else if (ch === '>' && depth === 0) break
        }
        const tag = text.slice(m.index!, end + 1)
        if (!/\bprefetch=\{false\}/.test(tag)) {
          const line = text.slice(0, m.index!).split('\n').length
          faults.push(`${relative(process.cwd(), f).replace(/\\/g, '/')}:${line}`)
        }
      }
    }
    expect(faults, 'admin links that would prefetch a whole admin page').toEqual([])
  })
})
