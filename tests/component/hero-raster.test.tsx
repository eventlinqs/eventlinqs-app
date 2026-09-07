import { afterEach, describe, expect, it } from 'vitest'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { HeroRaster } from '@/components/media/hero-raster'

/**
 * THE HERO RASTER OWNS ITS FAILURE (close-out C17.2, 7 September 2026).
 *
 * A hero must never show the browser's broken-image glyph. HeroRaster renders
 * the same priority image HeroMedia always rendered, and on failure swaps in
 * the branded navy and gold treatment. Two failure paths exist: an error
 * event after hydration, and an image that had already failed before React
 * attached its listener (complete, with no natural width). jsdom never loads
 * images, so `complete` and `naturalWidth` are set explicitly per test.
 */
const props = {
  src: '/images/hero/homepage-rooftop.jpg',
  alt: 'A rooftop gathering at golden hour',
  priority: true,
  sizes: '100vw',
  quality: 75,
  objectPosition: '50% 30%',
}

function defineImageState(complete: boolean, naturalWidth: number) {
  Object.defineProperty(HTMLImageElement.prototype, 'complete', { configurable: true, get: () => complete })
  Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', { configurable: true, get: () => naturalWidth })
}

afterEach(() => {
  delete (HTMLImageElement.prototype as unknown as Record<string, unknown>).complete
  delete (HTMLImageElement.prototype as unknown as Record<string, unknown>).naturalWidth
})

describe('HeroRaster', () => {
  it('renders the priority raster while it is loading', () => {
    defineImageState(false, 0)
    const { container } = render(<HeroRaster {...props} />)
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img?.getAttribute('alt')).toBe(props.alt)
    expect(img?.getAttribute('fetchpriority')).toBe('high')
    expect(img?.getAttribute('loading')).toBe('eager')
    expect(container.querySelector('[aria-hidden]')).toBeNull()
  })

  it('swaps to the branded treatment when the raster errors after hydration', () => {
    defineImageState(false, 0)
    const { container } = render(<HeroRaster {...props} />)
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    fireEvent.error(img as HTMLImageElement)
    expect(container.querySelector('img')).toBeNull()
    const treatment = container.querySelector('[aria-hidden]')
    expect(treatment).not.toBeNull()
    expect(treatment?.className).toContain('absolute inset-0')
  })

  it('catches a raster that failed before React listened: complete with no natural width', async () => {
    defineImageState(true, 0)
    const { container } = render(<HeroRaster {...props} />)
    await waitFor(() => expect(container.querySelector('img')).toBeNull())
    expect(container.querySelector('[aria-hidden]')).not.toBeNull()
  })

  it('leaves a raster that completed with pixels alone', async () => {
    defineImageState(true, 1600)
    const { container } = render(<HeroRaster {...props} />)
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)))
    expect(container.querySelector('img')).not.toBeNull()
    expect(container.querySelector('[aria-hidden]')).toBeNull()
  })
})
