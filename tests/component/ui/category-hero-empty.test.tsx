import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { render } from '@testing-library/react'
import { Sparkles } from 'lucide-react'
import { CategoryHeroEmpty } from '@/components/ui/CategoryHeroEmpty'

/**
 * `HeroMedia` resolves a raster through the media library and is not what this
 * file is about, the same reason and the same shim as
 * tests/component/fee-sentence-spacing.test.tsx. What matters here is only
 * which of the two gold tiers each element is painted in, per surface.
 */
vi.mock('@/components/media/HeroMedia', () => ({
  HeroMedia: ({ alt }: { alt?: string }) => createElement('img', { alt: alt ?? '' }),
}))

/**
 * THE SHARED DESIGNED EMPTY STATE PAINTS ITS GOLD BY ITS SURFACE.
 *
 * This is the markup half of the pair. tests/unit/a11y/hero-empty-gold-tiers
 * holds the arithmetic that says WHICH tier each surface is entitled to,
 * computed from globals.css; this proves the component actually picks it.
 *
 * On 19 September 2026 it picked neither correctly: the trust-pillar icon was
 * gold-400 on both surfaces (1.59:1 on the light card) and the eyebrow was
 * gold-800 on both (2.70:1 on the photo hero). Five sibling colours in the same
 * component branched properly, which is what made the two stand out once the
 * surface flag was read rather than the file skimmed.
 *
 * NOTE ON REACH, recorded so nobody reads more into the photo case than is
 * there: as of this commit NO call site passes `coverImage`, so all eleven
 * render the light card and the photo branch is unreachable in the product.
 * The light assertions below are therefore the live ones. The photo assertions
 * hold a branch that is one prop away from being used and whose defect would
 * otherwise be invisible until the day somebody used it.
 */

const base = {
  headline: 'Nothing on here yet',
  subhead: 'The first one could be yours.',
  primaryAction: { label: 'List your event', href: '/organisers' },
  trustPillars: [{ icon: Sparkles, label: 'Free to list' }],
  eyebrow: 'MELBOURNE',
}

const GOLD_400 = 'text-[var(--brand-accent)]'
const GOLD_800 = 'text-[var(--brand-accent-strong)]'

function eyebrowEl(container: HTMLElement) {
  const el = container.querySelector('span.rounded-full')
  if (!el) throw new Error('the eyebrow pill did not render')
  return el
}
function iconEl(container: HTMLElement) {
  const el = container.querySelector('svg')
  if (!el) throw new Error('the trust-pillar icon did not render')
  return el
}

describe('CategoryHeroEmpty, the light canvas card (every live call site)', () => {
  it('paints the eyebrow in gold-800, the tier that clears 4.5:1 on a light surface', () => {
    const { container } = render(<CategoryHeroEmpty {...base} />)
    const cls = eyebrowEl(container).getAttribute('class') ?? ''
    expect(cls).toContain(GOLD_800)
    expect(cls).not.toContain(GOLD_400)
  })

  it('paints the trust-pillar icon in gold-800, not the 1.59:1 gold-400 it shipped', () => {
    const { container } = render(<CategoryHeroEmpty {...base} />)
    const cls = iconEl(container).getAttribute('class') ?? ''
    expect(cls).toContain(GOLD_800)
    expect(cls).not.toContain(GOLD_400)
  })

  it('renders the light card body rather than a navy fill', () => {
    const { container } = render(<CategoryHeroEmpty {...base} />)
    const root = container.firstElementChild
    expect(root?.getAttribute('class') ?? '').toContain('bg-[var(--surface-1)]')
  })

  it('takes the hero scale as a FLOOR, so its content cannot be clipped', () => {
    /*
     * Measured at 390 on 19 September 2026: 637px of content inside a 439px
     * `.hero-marketing` box with overflow-hidden, so the trust pillars and the
     * card's bottom padding were cut off on 38 live routes. The card has no
     * photograph to size to, so its height is its content's to decide.
     */
    const { container } = render(<CategoryHeroEmpty {...base} />)
    const cls = container.firstElementChild?.getAttribute('class') ?? ''
    expect(cls).toContain('hero-marketing-grow')
    expect(cls).not.toMatch(/(?:^|\s)hero-marketing(?:\s|$)/)
  })
})

describe('CategoryHeroEmpty, the photograph hero', () => {
  it('paints the eyebrow in gold-400, which the CLAUDE.md hero law names for a dark hero', () => {
    const { container } = render(<CategoryHeroEmpty {...base} coverImage="/x.avif" />)
    const cls = eyebrowEl(container).getAttribute('class') ?? ''
    expect(cls).toContain(GOLD_400)
    expect(cls).not.toContain(GOLD_800)
  })

  it('paints the trust-pillar icon in gold-400 against the navy scrim', () => {
    const { container } = render(<CategoryHeroEmpty {...base} coverImage="/x.avif" />)
    const cls = iconEl(container).getAttribute('class') ?? ''
    expect(cls).toContain(GOLD_400)
    expect(cls).not.toContain(GOLD_800)
  })

  it('renders the navy fill under the photograph rather than the light card', () => {
    const { container } = render(<CategoryHeroEmpty {...base} coverImage="/x.avif" />)
    const root = container.firstElementChild
    expect(root?.getAttribute('class') ?? '').toContain('bg-[var(--color-navy-950)]')
  })

  it('keeps the locked FIXED hero scale, because there the image owns the box', () => {
    const { container } = render(<CategoryHeroEmpty {...base} coverImage="/x.avif" />)
    const cls = container.firstElementChild?.getAttribute('class') ?? ''
    expect(cls).toMatch(/(?:^|\s)hero-marketing(?:\s|$)/)
    expect(cls).not.toContain('hero-marketing-grow')
  })
})

describe('the two surfaces disagree, which is the whole point', () => {
  it('gives the eyebrow and the icon a DIFFERENT tier on the photo hero than on the card', () => {
    const light = render(<CategoryHeroEmpty {...base} />)
    const dark = render(<CategoryHeroEmpty {...base} coverImage="/x.avif" />)
    expect(eyebrowEl(light.container).getAttribute('class')).not.toBe(
      eyebrowEl(dark.container).getAttribute('class'),
    )
    expect(iconEl(light.container).getAttribute('class')).not.toBe(
      iconEl(dark.container).getAttribute('class'),
    )
  })
})
