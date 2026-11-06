import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * THE SECURITY FLOORS (6 November 2026; the CONTROLLER's 18:30 (3)). npm audit on the build machine read 2 critical and 10
 * high, and production ran inside them. Each floor is the first version that clears every advisory npm named for the
 * package, read from GitHub's advisory database through npm audit's links; the version is read from the INSTALLED package
 * on disk (CLAUDE.md: 'a lockfile entry is an intention, the installed tree is the fact').
 *   next 16.4.5: GHSA-2xp9-vwfh-vxw4 (RCE in image optimisation with AVIF, CVSS 9.5), GHSA-2464-fhr4-w9xw (with SVG),
 *     GHSA-vcvr-r3jv-pc5j (next/og), GHSA-673q-mjm6-r5xr ('use cache'), GHSA-cjq9-62q9-8jv4 (SSRF), GHSA-p3m5-59mp-jv5r (DoS);
 *     npm audit's fix for all of them is 16.4.5.
 *   @sentry/nextjs 10.75.2: GHSA-mchm-gjx6-7h55 (middleware bypass with a tunnel route).
 *   sharp 0.35.5: GHSA-rgj7-g3m4-5g8c (libheif, below 0.35.4) and GHSA-wq5f-xc86-pv6w (librsvg, below 0.35.5).
 * A floor moves only up.
 */
const root = join(__dirname, '..', '..', '..')
const installed = (name: string) => JSON.parse(readFileSync(join(root, 'node_modules', name, 'package.json'), 'utf8')).version as string
const atLeast = (have: string, floor: string) => {
  const a = have.split(/[.-]/).slice(0, 3).map(Number)
  const b = floor.split('.').map(Number)
  for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] > b[i]
  return true
}
const FLOORS: Record<string, string> = { next: '16.4.5', '@sentry/nextjs': '10.75.2', sharp: '0.35.5' }

describe('no installed package sits below the version that clears its known advisories', () => {
  for (const [name, floor] of Object.entries(FLOORS)) {
    it(`${name} is ${floor} or later`, () => {
      const have = installed(name)
      expect(atLeast(have, floor), `${name} ${have} is below ${floor}`).toBe(true)
    })
  }
})
