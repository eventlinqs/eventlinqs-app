import { GUIDES, GUIDE_CATEGORIES, type GuideCategoryId } from '@/lib/guides'

/**
 * The compact search index handed to the hub browser.
 *
 * The full guide library carries the entire body of every guide, which has no
 * business in a browser bundle. This flattens each guide to what the hub needs
 * to render a tile plus one lowercase `text` haystack for instant full-text
 * search, so typing a phrase written in a guide body still finds it without a
 * round trip.
 */
export type GuideIndexEntry = {
  slug: string
  title: string
  summary: string
  category: GuideCategoryId
  categoryTitle: string
  minutes: number
  heroSrc: string
  heroAlt: string
  /** Lowercased title, summary, keywords and body prose, for matching. */
  text: string
}

function bodyText(slug: string): string {
  const guide = GUIDES.find(g => g.slug === slug)
  if (!guide) return ''
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

export function buildGuideIndex(): GuideIndexEntry[] {
  return GUIDES.map(guide => ({
    slug: guide.slug,
    title: guide.title,
    summary: guide.summary,
    category: guide.category,
    categoryTitle: GUIDE_CATEGORIES.find(c => c.id === guide.category)?.title ?? '',
    minutes: guide.minutes,
    heroSrc: guide.hero.src,
    heroAlt: guide.hero.alt,
    text: bodyText(guide.slug),
  }))
}

/**
 * The same ranking the server library uses: every term must appear, a title
 * match outranks a keyword match, which outranks a body mention.
 */
export function filterGuideIndex(index: GuideIndexEntry[], query: string): GuideIndexEntry[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return index

  const scored: { entry: GuideIndexEntry; score: number }[] = []
  for (const entry of index) {
    if (!terms.every(term => entry.text.includes(term))) continue
    const title = entry.title.toLowerCase()
    const summary = entry.summary.toLowerCase()
    let score = 0
    for (const term of terms) {
      if (title.includes(term)) score += 100
      else if (summary.includes(term)) score += 10
      else score += 1
    }
    scored.push({ entry, score })
  }
  return scored
    .sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title))
    .map(s => s.entry)
}
