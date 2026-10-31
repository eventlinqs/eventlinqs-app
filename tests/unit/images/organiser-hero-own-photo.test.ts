import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ORGANISER_HERO_PHOTOS } from '@/lib/images/organiser-hero-photo'

/**
 * AN ORGANISER PAGE LEADS WITH ITS OWN PHOTO (the controller's ruling of 31 October 2026, 13:18, on window 1's 13:04:
 * under A1 the subject is the organiser itself, and its own events' photos are its own media). Every organiser page drew
 * an initials circle (coverImage null). Each organiser here has a photo chosen BY EYE (law 5) from its own events'
 * photos, never the photo that leads its event page, credited as the organiser credits it. An organiser whose only
 * photo is a poster with text across it keeps its initials: text never sits under our hero's own words.
 */
describe("an organiser page leads with the organiser's own photo", () => {
  it('AMCF leads with its stage drummer, credited as AMCF credits it', () => {
    const amcf = ORGANISER_HERO_PHOTOS.amcf
    expect(amcf).toBeDefined()
    expect(amcf.src).toMatch(/\/event-images\/.+\/1792997333745-461a7f89\.jpg$/)
    expect(amcf.credit).toBe('Photo: AMCF, past festival')
    expect(amcf.alt.length).toBeGreaterThan(20)
  })

  it('every photo here is an event photo of our own storage, each organiser its own', () => {
    const srcs = Object.values(ORGANISER_HERO_PHOTOS).map((p) => p.src)
    for (const src of srcs) expect(src).toMatch(/^https:\/\/[a-z]+\.supabase\.co\/storage\/v1\/object\/public\/event-images\//)
    expect(new Set(srcs).size).toBe(srcs.length)
  })

  it('the organiser page reads the photo and its credit, and no longer hard-codes an empty cover', () => {
    const page = readFileSync(resolve(process.cwd(), 'src/app/organisers/[handle]/page.tsx'), 'utf8')
    expect(page).toMatch(/\bORGANISER_HERO_PHOTOS\b/)
    expect(page).not.toMatch(/coverImage=\{null\}/)
  })
})
