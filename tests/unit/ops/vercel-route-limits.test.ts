import { describe, expect, it } from 'vitest'
import { VERCEL_ROUTE_LIMITS, routeLimitFaults } from '../../../scripts/guards/lib/vercel-route-limits.mjs'

/*
 * VERCEL'S LIMITS ON A PROJECT'S ROUTES (https://openapi.vercel.sh/vercel.json, read 21 November 2026). Train AV's
 * /events city redirect carried 26 'missing' conditions; next build accepted it and Vercel refused the preview, quoted:
 * 'Builder returned invalid routes: should NOT have more than 16 items'. The judge refuses that shape and its kin.
 */
const conds = (n: number) => Array.from({ length: n }, (_, i) => ({ type: 'query', key: `k${i}` }))

describe("Vercel's route limits", () => {
  it("tonight's rule, 26 conditions, is refused; 16 pass", () => {
    expect(routeLimitFaults({ redirects: [{ source: '/events', destination: '/city/:city', missing: conds(26) }] }).join(' ')).toContain('more than the 16 Vercel allows')
    expect(routeLimitFaults({ redirects: [{ source: '/events', destination: '/city/:city', missing: conds(16), has: conds(16) }] })).toEqual([])
  })
  it('a header rule and a rewrite are judged the same, in either form of rewrites', () => {
    expect(routeLimitFaults({ headers: [{ source: '/x', has: conds(17), headers: [] }] })).toHaveLength(1)
    expect(routeLimitFaults({ rewrites: { beforeFiles: [{ source: '/a', destination: '/b', missing: conds(17) }], afterFiles: [], fallback: [] } })).toHaveLength(1)
  })
  it('lengths and counts', () => {
    const long = '/' + 'a'.repeat(VERCEL_ROUTE_LIMITS.sourceLength)
    expect(routeLimitFaults({ redirects: [{ source: long, destination: '/b' }] }).join(' ')).toContain('a source of')
    expect(routeLimitFaults({ headers: [{ source: '/x', headers: [{ key: 'X', value: 'v'.repeat(VERCEL_ROUTE_LIMITS.headerValueLength + 1) }] }] }).join(' ')).toContain('a header value of')
    expect(routeLimitFaults({ redirects: Array.from({ length: VERCEL_ROUTE_LIMITS.itemsPerKind + 1 }, (_, i) => ({ source: `/r${i}`, destination: '/' })) }).join(' ')).toContain('2049 items')
  })
})
