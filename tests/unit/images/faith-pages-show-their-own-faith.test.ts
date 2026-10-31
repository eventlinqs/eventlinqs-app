import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FAITH_SLUGS } from '@/lib/faiths/data'
import { FAITH_PHOTOS } from '@/lib/images/faith-photo'

/**
 * ONE PHOTO, ONE SUBJECT (Lawal's standing directive of 31 October 2026; the photo system's A1), AND NO HERO DRAWN
 * EMPTY (the controller's 11:18). Each faith page used to borrow a community's photo (another subject), then car 20
 * drew all five navy. Each now has a photograph of its own faith in Australia, chosen by eye from Wikimedia Commons,
 * free to use with its credit, and shows that credit under the hero linked to the file's page.
 */
describe('each faith page shows a photograph of its own faith, credited', () => {
  it.each(FAITH_SLUGS)('%s has its own photograph with author, licence and file page', (slug) => {
    const photo = FAITH_PHOTOS[slug]
    expect(photo, slug).toBeDefined()
    expect(photo.src).toMatch(/^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/thumb\/.+\/1920px-/)
    expect(photo.filePage).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/)
    expect(photo.author.length).toBeGreaterThan(0)
    expect(photo.licence).toMatch(/^(CC0|CC BY(-SA)? [0-9.]+)$/)
    expect(photo.alt.length).toBeGreaterThan(20)
  })

  it('no two faiths share a photograph', () => {
    const srcs = FAITH_SLUGS.map((s) => FAITH_PHOTOS[s]?.src)
    expect(new Set(srcs).size).toBe(srcs.length)
  })

  it('the faith page shows its own photograph and its credit, and borrows no community photo', () => {
    const page = readFileSync(resolve(process.cwd(), 'src/app/faith/[faith]/page.tsx'), 'utf8')
    expect(page).toMatch(/\bFAITH_PHOTOS\b/)
    expect(page).not.toMatch(/const heroImage = null/)
    expect(page).toMatch(/Photo: /)
    expect(page).not.toMatch(/\bgetCommunityHeroPhoto\b/)
  })
})
