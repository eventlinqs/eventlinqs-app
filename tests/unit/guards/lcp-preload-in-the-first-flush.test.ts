import { describe, expect, test } from 'vitest'
import {
  LCP_FIRST_FLUSH_ROUTES,
  defaultExportBody,
  heroSuspenseDepth,
  judgeRoute,
  scan,
  stripComments,
} from '../../../scripts/guards/lcp-preload-in-the-first-flush.mjs'

/**
 * THE LCP PRELOAD LEAVES IN THE FIRST CHUNK (close-out C8B.3).
 *
 * The homepage's LCP element is a photograph the query chooses, so its preload
 * cannot precede the query. Putting the page body behind a streaming boundary
 * therefore buys a first byte and pays for it twice in discovery: measured,
 * median of 5 at matched machine speed, it moved the hero's resource load delay
 * from 20 ms to 527 ms and cost 597 ms of LCP. The guard refuses that shape.
 */

const ENTRY = {
  file: 'src/app/example/page.tsx',
  hero: 'ExampleHero',
  heroFile: 'src/components/example-hero.tsx',
  why: 'a measured route whose LCP image comes from the database',
}

const GOOD = `
import { Suspense } from 'react'

export default async function ExamplePage() {
  const rows = await load()
  return (
    <main>
      <ExampleHero events={rows} />
      <Suspense fallback={<RailSkeleton />}>
        <BelowTheFold rows={rows} />
      </Suspense>
    </main>
  )
}
`

describe('stripComments', () => {
  test('a JSX comment quoting the forbidden shape is not read as code', () => {
    const source = `
export default async function ExamplePage() {
  return (
    <main>
      {/* This used to read <Suspense fallback={null}><ExampleHero /></Suspense>
          and it cost 597 ms of LCP. */}
      <ExampleHero />
    </main>
  )
}
`
    expect(judgeRoute(ENTRY, source)).toEqual([])
  })

  test('a block comment is stripped and a protocol-relative URL survives', () => {
    expect(stripComments('/* <Suspense><ExampleHero /></Suspense> */')).not.toContain('Suspense')
    expect(stripComments("const u = 'https://example.com/a'")).toContain('https://example.com/a')
  })
})

describe('heroSuspenseDepth', () => {
  test('a hero ahead of every boundary is at depth 0', () => {
    expect(heroSuspenseDepth(defaultExportBody(GOOD)!, 'ExampleHero')).toBe(0)
  })

  test('boundaries BELOW the hero are not counted', () => {
    /*
     * The homepage renders two legitimate <Suspense> boundaries below its hero.
     * A clause that merely asked whether the body contains <Suspense would fail
     * a correct page and teach somebody to delete the boundaries that are right.
     */
    const body = defaultExportBody(GOOD)!
    expect(body).toContain('<Suspense')
    expect(heroSuspenseDepth(body, 'ExampleHero')).toBe(0)
  })

  test('a hero inside a boundary carries its depth', () => {
    const wrapped = GOOD.replace(
      '<ExampleHero events={rows} />',
      '<Suspense fallback={null}><ExampleHero events={rows} /></Suspense>',
    )
    expect(heroSuspenseDepth(defaultExportBody(wrapped)!, 'ExampleHero')).toBe(1)
    expect(judgeRoute(ENTRY, wrapped).join(' ')).toContain('1 <Suspense> boundary')
  })

  test('a hero that is not rendered in the body at all is null, not zero', () => {
    expect(heroSuspenseDepth('{ return <main><Other /></main> }', 'ExampleHero')).toBeNull()
  })

  test('a self-closing hero and one with children are both found', () => {
    expect(heroSuspenseDepth('{ <ExampleHero /> }', 'ExampleHero')).toBe(0)
    expect(heroSuspenseDepth('{ <ExampleHero>child</ExampleHero> }', 'ExampleHero')).toBe(0)
    // a component whose name merely starts the same must not match
    expect(heroSuspenseDepth('{ <ExampleHeroSkeleton /> }', 'ExampleHero')).toBeNull()
  })
})

describe('judgeRoute', () => {
  test('a page that renders its hero ahead of its boundaries passes', () => {
    expect(judgeRoute(ENTRY, GOOD)).toEqual([])
  })

  test('the measured-and-reverted shape fails: the hero moved into a streamed child', () => {
    const streamed = `
import { Suspense } from 'react'

export default function ExamplePage() {
  return (
    <Suspense fallback={null}>
      <ExampleDocument />
    </Suspense>
  )
}

async function ExampleDocument() {
  const rows = await load()
  return <main><ExampleHero events={rows} /></main>
}
`
    expect(judgeRoute(ENTRY, streamed).join(' ')).toContain('does not render <ExampleHero>')
  })

  test('a file with no default export is reported rather than passed', () => {
    expect(judgeRoute(ENTRY, 'export function NotDefault() { return <ExampleHero /> }').join(' ')).toContain(
      'no default export could be read',
    )
  })
})

describe('the registry', () => {
  test('every reviewed route names a page, a hero and a reason', () => {
    expect(LCP_FIRST_FLUSH_ROUTES.length).toBeGreaterThan(0)
    for (const entry of LCP_FIRST_FLUSH_ROUTES) {
      expect(entry.file).toMatch(/^src\/app\/.*page\.tsx$/)
      expect(entry.heroFile).toMatch(/^src\/.*\.tsx$/)
      expect(entry.hero.length).toBeGreaterThan(0)
      expect(entry.why.length).toBeGreaterThan(20)
    }
  })

  test('a registry entry naming a file that is not on disk fails rather than passing', () => {
    const faults = scan([
      {
        file: 'src/app/gone/page.tsx',
        hero: 'ExampleHero',
        heroFile: 'src/components/gone.tsx',
        why: 'a route that was moved away',
      },
    ])
    expect(faults.join(' ')).toContain('not on disk')
  })

  test('the real tree is green', () => {
    expect(scan()).toEqual([])
  })
})
