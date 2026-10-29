import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/*
 * A SHARED ORGANISER PAGE ALWAYS CARRIES A PICTURE (window 2's public site audit on production, 29 October 2026:
 * /organisers and /organisers/amcf answered with no og:image). A route's own openGraph block replaces the root's, so
 * a block with no images, or an empty list when the organiser has no logo, shares with no picture at all. Each falls
 * back to the platform's card, '/opengraph-image', as the other routes do.
 */
describe('the organiser pages name an image for a share', () => {
  it('an organiser with no logo shares the platform card, never an empty list', () => {
    const page = readFileSync('src/app/organisers/[handle]/page.tsx', 'utf8')
    expect(page).not.toMatch(/:\s*\[\],\s*\n\s*\},\s*\n\s*twitter/)
    expect(page).toMatch(/: \['\/opengraph-image'\],\s*\n\s*\},\s*\n\s*twitter/)
    expect(page).toMatch(/organisation\.logo_url \? \[organisation\.logo_url\] : \['\/opengraph-image'\]/)
  })

  it('the organiser landing names the platform card', () => {
    const page = readFileSync('src/app/organisers/page.tsx', 'utf8')
    const og = /openGraph: \{[\s\S]*?\n {2}\},/.exec(page)?.[0] ?? ''
    expect(og).toMatch(/images: \['\/opengraph-image'\]/)
  })
})
