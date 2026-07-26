import type { Guide, GuideCategoryId, GuideLiveValues, GuideShot } from './types'
import { GUIDE_CATEGORIES } from './categories'
import { creatingYourFirstEvent } from './content/creating-your-first-event'
import { buildingASeatingChart } from './content/building-a-seating-chart'
import { mappingTicketTiersToSeats } from './content/mapping-ticket-tiers-to-seats'
import { publishingAndSharingYourPromoKit } from './content/publishing-and-sharing-your-promo-kit'
import { trackingYourReach } from './content/tracking-your-reach'
import { gettingPaidAndPayoutTiming } from './content/getting-paid-and-payout-timing'
import { refundsAndTransfers } from './content/refunds-and-transfers'
import { runningTheDoorWithTheQrScanner } from './content/running-the-door-with-the-qr-scanner'

export * from './types'
export { GUIDE_CATEGORIES, getGuideCategory } from './categories'

/**
 * The organiser guide library.
 *
 * Order is the order of the work, not alphabetical: set up, seat the room,
 * sell it, get paid, run the door. The hub groups by category and the search
 * matches across title, summary, keywords and body text.
 */
export const GUIDES: Guide[] = [
  creatingYourFirstEvent,
  buildingASeatingChart,
  mappingTicketTiersToSeats,
  publishingAndSharingYourPromoKit,
  trackingYourReach,
  gettingPaidAndPayoutTiming,
  refundsAndTransfers,
  runningTheDoorWithTheQrScanner,
]

export function getGuide(slug: string): Guide | null {
  return GUIDES.find(g => g.slug === slug) ?? null
}

export function guidesInCategory(category: GuideCategoryId): Guide[] {
  return GUIDES.filter(g => g.category === category)
}

/** Categories that actually hold a guide, in taxonomy order. */
export function populatedCategories() {
  return GUIDE_CATEGORIES.map(category => ({
    category,
    guides: guidesInCategory(category.id),
  })).filter(entry => entry.guides.length > 0)
}

/** Every screenshot referenced by the library. Used by the capture gate. */
export function allGuideShots(): GuideShot[] {
  const shots: GuideShot[] = []
  for (const guide of GUIDES) {
    shots.push(guide.hero)
    for (const block of guide.blocks) {
      if (block.kind === 'shot') shots.push(block.shot)
    }
  }
  return shots
}

/**
 * Flattens a guide's prose into one lowercase haystack, so hub search finds a
 * guide by something written in its body and not only by its title.
 */
function guideHaystack(guide: Guide): string {
  const parts: string[] = [guide.title, guide.summary, ...guide.keywords]
  for (const block of guide.blocks) {
    switch (block.kind) {
      case 'para':
      case 'heading':
        parts.push(block.text)
        break
      case 'note':
      case 'pitfall':
        parts.push(block.title, block.text)
        break
      case 'list':
        parts.push(...block.items)
        break
      case 'steps':
        for (const item of block.items) parts.push(item.title, item.text)
        break
      case 'shot':
        parts.push(block.shot.caption)
        break
    }
  }
  return parts.join(' ').toLowerCase()
}

const HAYSTACKS = new Map(GUIDES.map(g => [g.slug, guideHaystack(g)]))

/**
 * Hub search. Every whitespace-separated term must appear somewhere in the
 * guide, so adding a word narrows rather than widens. Ranking puts a title
 * match first, then a keyword match, then a body match, so typing "refund"
 * surfaces the refunds guide above the payout guide that mentions refunds.
 */
export function searchGuides(query: string): Guide[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return GUIDES

  const scored: { guide: Guide; score: number }[] = []
  for (const guide of GUIDES) {
    const haystack = HAYSTACKS.get(guide.slug) ?? ''
    if (!terms.every(term => haystack.includes(term))) continue

    const title = guide.title.toLowerCase()
    const keywords = guide.keywords.join(' ').toLowerCase()
    let score = 0
    for (const term of terms) {
      if (title.includes(term)) score += 100
      else if (keywords.includes(term)) score += 10
      else score += 1
    }
    scored.push({ guide, score })
  }

  return scored
    .sort((a, b) => b.score - a.score || a.guide.title.localeCompare(b.guide.title))
    .map(entry => entry.guide)
}

/**
 * Substitutes the live platform tokens into guide prose.
 *
 * {{fee}} and {{payoutDays}} are resolved at request time from the one pricing
 * resolver, so a guide can never publish a stale fee or a stale payout window.
 * Unknown tokens are left untouched rather than blanked, so a typo is visible
 * in review instead of silently deleting a sentence.
 */
export function applyLiveValues(text: string, values: GuideLiveValues): string {
  return text
    .replace(/\{\{fee\}\}/g, values.fee)
    .replace(/\{\{payoutDays\}\}/g, String(values.payoutDays))
}
