import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * EVERY SHARED ROUTE CARRIES A PICTURE (window 6's document walk and gap list, 30 October 2026: /venues/aunty-jacks
 * answered with no og:image, the same class window 2 closed for the organiser pages in 7b89c5dd). A route's own
 * openGraph or twitter block replaces the root's, so an empty images list shares a link with no picture at all. When a
 * route has no image of its own it falls back to the platform's card, '/opengraph-image', as the other routes do.
 */

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return pages(path)
    return name === 'page.tsx' || name === 'layout.tsx' ? [path] : []
  })
}

describe('a shared route never names an empty image list', () => {
  it('no page or layout falls back to [] for its images', () => {
    const offenders = pages('src/app').filter((file) => {
      const text = readFileSync(file, 'utf8')
      return /images:[^\n]*\?[^\n]*:\s*\[\]/.test(text) || /images:\s*\[\]/.test(text) || /images:[^\n]*\n[^\n]*\?[^\n]*\n\s*:\s*\[\],/.test(text)
    })
    expect(offenders).toEqual([])
  })

  it('a venue with no image of its own shares the platform card', () => {
    const page = readFileSync('src/app/venues/[handle]/page.tsx', 'utf8')
    const og = /openGraph: \{[\s\S]*?\n {4}\},/.exec(page)?.[0] ?? ''
    const twitter = /twitter: \{[\s\S]*?\n {4}\},/.exec(page)?.[0] ?? ''
    expect(og).toMatch(/'\/opengraph-image'/)
    expect(twitter).toMatch(/venue\.imageUrl \? \[venue\.imageUrl\] : \['\/opengraph-image'\]/)
  })
})
