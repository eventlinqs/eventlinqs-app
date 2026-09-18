import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
// CODE, NEVER PROSE. The first version of this sweep matched `useConsent` in
// measurement-stack.tsx's own doc comment, which explains that the hook has
// three consumers, and then failed because a doc comment exports no component.
// scripts/guards/lib/source.mjs has a whole heading about that failure mode.
import { stripNonCode } from '../../../scripts/guards/lib/source.mjs'
import { importsBareSpecifier } from '../../../scripts/guards/lib/bare-import.mjs'

/**
 * THE MEASUREMENT TREE IS DEFERRED, AND THESE ARE THE THINGS THAT KEEP IT SAFE
 * TO DEFER.
 *
 * On 18 September 2026 the six components the root layout mounted for AN1 and
 * GA3 were moved out of `src/app/layout.tsx` into
 * `components/analytics/measurement-stack.tsx` and fetched lazily through
 * `measurement-boot.tsx`. The initial-bundle ratchet had measured what they
 * cost inline and reported the same figure 133 times: +3938 bytes gzip, on
 * every route, including every route that measures nothing and shows no
 * consent banner.
 *
 * Deferring a CONTEXT PROVIDER is only safe while every consumer of that
 * context is inside the deferred tree. It was, exactly: `useConsent` had three
 * consumers and all three are rendered by `measurement-stack.tsx`. A fourth
 * consumer added anywhere else would render with no provider above it and take
 * the context default, which is the kind of failure that shows up as analytics
 * quietly not firing rather than as a crash.
 *
 * So this is the gate on the assumption rather than a restatement of it.
 */

const SEP = String.fromCharCode(92)
const norm = (p: string) => p.replaceAll(SEP, '/')

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(entry)) out.push(norm(p))
  }
  return out
}

const STACK = 'src/components/analytics/measurement-stack.tsx'
const PROVIDER = 'src/components/analytics/consent-provider.tsx'
const LAYOUT = 'src/app/layout.tsx'
const BOOT = 'src/components/analytics/measurement-boot.tsx'

describe('the deferred measurement tree', () => {
  it('every_useConsent_consumer_is_rendered_inside_the_deferred_stack', () => {
    const stack = readFileSync(STACK, 'utf8')
    const consumers = walk('src')
      .filter((f) => f !== PROVIDER && f !== STACK)
      .filter((f) => /\buseConsent\b/.test(stripNonCode(readFileSync(f, 'utf8'))))

    // A sweep that finds nothing proves nothing. The three known consumers are
    // gated-analytics, funnel-landed and consent-banner.
    expect(consumers.length).toBeGreaterThanOrEqual(3)

    for (const file of consumers) {
      // The component's exported name is taken from the file rather than
      // typed, so a rename cannot make this assertion pass by describing
      // nothing.
      const src = readFileSync(file, 'utf8')
      const named = [...src.matchAll(/export function ([A-Z]\w+)/g)].map((m) => m[1])
      expect(named.length, file + ' reads the consent context but exports no component').toBeGreaterThan(0)
      const rendered = named.some(
        (n) => stack.includes('<' + n + ' ') || stack.includes('<' + n + '/>') || stack.includes('<' + n + '>'),
      )
      expect(
        rendered,
        file +
          ' reads the consent context but is not rendered by ' +
          STACK +
          '. Deferring the provider is only safe while every consumer sits inside the deferred ' +
          'tree: either mount it there, or stop deferring the provider.',
      ).toBe(true)
    }
  })

  it('the_root_layout_mounts_the_boundary_and_not_its_members_directly', () => {
    const layout = readFileSync(LAYOUT, 'utf8')
    expect(layout).toContain('MeasurementBoot')
    // The boundary, not the members. Importing any member back into the layout
    // puts its bytes into the first load of every route again, which is the
    // whole defect this arrangement exists to hold shut.
    for (const member of [
      'consent-provider',
      'consent-banner',
      'gated-analytics',
      'funnel-landed',
      'referral-capture',
      'arrival-capture',
      'click-identifier-relay',
    ]) {
      expect(
        layout.includes(member),
        LAYOUT +
          ' imports ' +
          member +
          ' directly again, which returns its bytes to the first load of every route. Mount it ' +
          'inside ' +
          STACK +
          ' instead.',
      ).toBe(false)
    }
  })

  it('the_boot_boundary_is_a_client_component_because_a_server_one_cannot_split', () => {
    // A Server Component cannot split a Client Component out of itself:
    // next@16 lazy-loading guide, "When a Server Component dynamically imports
    // a Client Component, automatic code splitting is currently not supported".
    // The root layout is a Server Component, so without this one-line client
    // boundary the deferral produces no split at all and the file would claim a
    // saving it never made.
    //
    // THE BOUNDARY DEFERS WITH A BARE import() AND NOT WITH next/dynamic, and
    // that is a measurement rather than a style: dynamic() put its loadable
    // runtime into the shared shell, which is the first load of all 141 routes,
    // for 1426 bytes gzip and one extra chunk. See measurement-boot.tsx and
    // scripts/guards/no-loadable-in-the-root-shell.mjs, which blocks the build
    // if it comes back.
    const boot = readFileSync(BOOT, 'utf8')
    expect(boot.startsWith("'use client'")).toBe(true)
    expect(boot).toMatch(/import\('\.\/measurement-stack'\)/)
    // Through the matcher rather than a substring, for the reason at the top of
    // this file: that comment block NAMES next/dynamic in order to explain why
    // it is not used, and a substring test would read the explanation as the
    // defect it warns about.
    expect(importsBareSpecifier(boot, 'next/dynamic')).toBe(false)
  })
})
