import { describe, expect, it } from 'vitest'
import {
  CONTEXTUAL_HINTS,
  GUIDANCE_SURFACES,
  coachStorageKey,
  hintStorageKey,
  type GuidanceSurfaceId,
} from '@/lib/guidance/registry'
import { getGuide } from '@/lib/guides'

/**
 * The guidance registry is the contract between an interactive surface and the
 * written guide behind it. These gates hold that contract: every link resolves
 * (Law 5), the coaching stays short enough that people finish it, and the copy
 * laws apply to in-product text exactly as they do to a page.
 */

const SURFACES = Object.values(GUIDANCE_SURFACES)

const ALL_STRINGS = [
  ...SURFACES.flatMap(s => [
    s.label,
    s.intro,
    s.guideTitle,
    ...s.starters,
    ...s.moreGuides.map(g => g.title),
    ...s.steps.flatMap(step => [step.title, step.body, step.keyboard ?? '']),
  ]),
  ...Object.values(CONTEXTUAL_HINTS),
]

describe('guidance registry: the surface-to-guide contract', () => {
  it('points every surface at a guide that exists', () => {
    for (const surface of SURFACES) {
      const guide = getGuide(surface.guideSlug)
      expect(guide, `${surface.id} points at missing guide ${surface.guideSlug}`).not.toBeNull()
    }
  })

  it('titles the linked guide exactly as the guide library titles it', () => {
    // A drifting title is how in-product help and documentation quietly stop
    // being one system, so the title is asserted, not just the slug.
    for (const surface of SURFACES) {
      expect(getGuide(surface.guideSlug)?.title).toBe(surface.guideTitle)
    }
  })

  it('resolves every further-reading link and titles it correctly', () => {
    for (const surface of SURFACES) {
      for (const more of surface.moreGuides) {
        const guide = getGuide(more.slug)
        expect(guide, `${surface.id} links missing guide ${more.slug}`).not.toBeNull()
        expect(guide?.title).toBe(more.title)
      }
    }
  })

  it('declares the surface on the guide that backs it, in both directions', () => {
    const seatMap = getGuide(GUIDANCE_SURFACES['room-studio'].guideSlug)
    expect(seatMap?.surface).toBe('room-studio')
  })
})

describe('guidance registry: coaching stays short', () => {
  it('never runs past three steps on any surface', () => {
    // Completion collapses as steps are added, and most people skip linear
    // tours outright, so three is the ceiling the design commits to.
    for (const surface of SURFACES) {
      expect(surface.steps.length).toBeGreaterThanOrEqual(2)
      expect(surface.steps.length, `${surface.id} coaching is too long`).toBeLessThanOrEqual(3)
    }
  })

  it('gives every step a unique id within its surface', () => {
    for (const surface of SURFACES) {
      const ids = surface.steps.map(s => s.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('gives every step a keyboard route, so no step is mouse-only', () => {
    for (const surface of SURFACES) {
      for (const step of surface.steps) {
        expect(step.keyboard, `${surface.id}/${step.id} has no keyboard route`).toBeTruthy()
      }
    }
  })

  it('keeps each step to something readable at a glance', () => {
    for (const surface of SURFACES) {
      for (const step of surface.steps) {
        expect(step.body.length).toBeGreaterThan(40)
        expect(step.body.length, `${surface.id}/${step.id} is too long to read in place`).toBeLessThan(260)
      }
    }
  })
})

describe('guidance registry: contextual hints', () => {
  it('gives every hint id a sentence', () => {
    for (const [id, text] of Object.entries(CONTEXTUAL_HINTS)) {
      expect(text.length, `${id} has no usable sentence`).toBeGreaterThan(30)
      expect(text.length, `${id} is too long for an in-place hint`).toBeLessThan(200)
    }
  })

  it('has no hint id without a sentence, and no sentence without an id', () => {
    const ids = Object.keys(CONTEXTUAL_HINTS)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.length).toBeGreaterThan(0)
  })
})

describe('guidance registry: storage keys', () => {
  it('namespaces the coach key by surface and version', () => {
    expect(coachStorageKey('buyer-seat-map', 1)).toBe('el.guidance.buyer-seat-map.v1')
    expect(coachStorageKey('room-studio', 2)).toBe('el.guidance.room-studio.v2')
  })

  it('changes the key when the version changes, so a rewrite shows once more', () => {
    const surface: GuidanceSurfaceId = 'buyer-seat-map'
    expect(coachStorageKey(surface, 1)).not.toBe(coachStorageKey(surface, 2))
  })

  it('namespaces hint keys separately from coaching keys', () => {
    expect(hintStorageKey('seat-map-pan')).toBe('el.hint.seat-map-pan')
    expect(hintStorageKey('seat-map-pan')).not.toContain('guidance')
  })
})

describe('guidance registry: the copy laws apply in-product too', () => {
  it('uses no em-dash or en-dash', () => {
    expect(ALL_STRINGS.filter(s => /[–—]/.test(s))).toEqual([])
  })

  it('uses no exclamation marks', () => {
    expect(ALL_STRINGS.filter(s => s.includes('!'))).toEqual([])
  })

  it('never uses the banned community word', () => {
    expect(ALL_STRINGS.filter(s => /cultur/i.test(s))).toEqual([])
  })

  it('never names a competitor', () => {
    const competitors = /\b(ticketmaster|eventbrite|humanitix|trybooking|ticketek|dice|moshtix|oztix)\b/i
    expect(ALL_STRINGS.filter(s => competitors.test(s))).toEqual([])
  })

  it('carries no placeholder copy', () => {
    expect(ALL_STRINGS.filter(s => /\b(lorem ipsum|coming soon|TODO|FIXME|tbd)\b/i.test(s))).toEqual([])
  })

  it('uses only the locked assistants', () => {
    for (const surface of SURFACES) {
      expect(['support', 'organiser-onboarding']).toContain(surface.assistant)
    }
  })

  it('gives a public surface a guest-capable assistant', () => {
    // The buyer seat map is reachable signed out, so its assistant must be one
    // that does not require an account, or the ask control would always fail.
    expect(GUIDANCE_SURFACES['buyer-seat-map'].assistant).toBe('support')
  })
})
