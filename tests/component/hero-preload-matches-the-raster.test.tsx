import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * THE PRELOAD AND THE RASTER MUST BE ONE REQUEST, NOT TWO.
 *
 * `/events/[slug]` is the only public route on this platform behind a route
 * level `loading.tsx`, so its head closes with the SKELETON and the preload
 * next/image emits when the hero renders landed at byte 85,041 of a 205,060
 * byte document. The route's layout now registers that raster from ABOVE the
 * boundary, in the shell, and the link comes out at byte 221.
 *
 * THE RISK THAT CREATES, and the only reason this file exists: a preload whose
 * arguments differ from the element's by one character does not save a request,
 * it ADDS one, on the LCP path, on the slowest page on the platform. That is
 * strictly worse than the defect being fixed, and it is invisible in every
 * screenshot. It also actually happened during the build of this change: a
 * `<link rel="preload" href=...>` element reached the head and did NOT dedupe
 * with next/image's registration, and the document came back carrying two.
 *
 * WHAT THE CONTRACT IS. React keys an image preload on
 * `imageSrcSet + "\n" + imageSizes` (react-dom-server, the `preload`
 * implementation), and next/image passes the element's own `srcSet` and `sizes`
 * into exactly those two options. So this test renders `HeroMedia` - the real
 * hero, through `HeroRaster` and `next/image` - reads the attributes off the
 * `<img>` it produced, and requires the preload to register those same strings.
 * Neither side is a copy of the other's arguments.
 *
 * DRILLED BEFORE IT WAS TRUSTED. Changing the hint `heroPreloadLink` passes
 * from `MEDIA_SIZES.fullBleed` to `MEDIA_SIZES.railEventCard` turns 3 of the 5
 * cases red with the two srcsets printed side by side. The QUALITY tier cannot
 * be drilled the same way in this environment, for the reason in the next
 * paragraph, which is why it is asserted structurally instead.
 *
 * WHAT THIS ENVIRONMENT CANNOT SEE, stated so nobody reads more into a pass
 * than is there. Under vitest there is no `next build`, so `next/image` falls
 * back to its DEFAULT config: the device ladder is the default one and
 * `images.qualities` admits only 75, so the `q=` in these srcsets is 75 whatever
 * tier is asked for. That makes an absolute assertion about the URL meaningless
 * here, and it does not weaken the equality above: both sides are built by the
 * same `getImgProps` under the same config, so an input that drifts still
 * produces two different strings. The tier and the hint are asserted
 * STRUCTURALLY instead, against the constants `HeroMedia` itself defaults to.
 */

const preloadSpy = vi.fn()
vi.mock('react-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom')>()
  const patched = { ...actual, preload: preloadSpy }
  return { ...patched, default: { ...(actual as unknown as { default?: object }).default, ...patched } }
})

const { render } = await import('@testing-library/react')
const { HeroMedia } = await import('@/components/media/HeroMedia')
const { HeroPreloadLink } = await import('@/components/media/hero-preload-link')
const { heroPreloadLink } = await import('@/lib/images/hero-preload')
const { MEDIA_SIZES } = await import('@/components/media/sizes')
const { MEDIA_QUALITY } = await import('@/components/media/quality')

/** Two real shapes: a bundled raster and an optimiser-routed remote cover. */
const IMAGES = [
  '/images/hero/electronic-dance.jpg',
  'https://images.pexels.com/photos/30497160/pexels-photo-30497160.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1067&w=1600',
]

/**
 * jsdom hands back `src` already resolved against the document's base URL while
 * the preload carries the raw path, so both sides are reduced to the part that
 * names the resource. Without this the two differ by `http://localhost:3000`
 * and the test fails on the harness rather than on the product.
 */
const sameResource = (url: string | null | undefined) =>
  url == null ? url : new URL(url, 'http://localhost:3000').href

/** What the hero's own `<img>` asks the browser for. */
function theElementAsksFor(image: string) {
  const { container } = render(<HeroMedia image={image} alt="A hero" />)
  const img = container.querySelector('img')
  if (!img) throw new Error('HeroMedia rendered no <img>, so this test is measuring nothing')
  return {
    src: img.getAttribute('src'),
    srcSet: img.getAttribute('srcset'),
    sizes: img.getAttribute('sizes'),
  }
}

/** What the preload registers with React. */
function thePreloadAsksFor(element: React.ReactElement) {
  preloadSpy.mockClear()
  render(element)
  expect(preloadSpy, 'the preload registered nothing').toHaveBeenCalledTimes(1)
  const [href, opts] = preloadSpy.mock.calls[0] as [string, Record<string, unknown>]
  return { src: href, srcSet: opts.imageSrcSet, sizes: opts.imageSizes, as: opts.as, fetchPriority: opts.fetchPriority }
}

beforeEach(() => {
  preloadSpy.mockClear()
})

describe('the hero preload and the hero raster are one request', () => {
  for (const image of IMAGES) {
    it(`asks for exactly what the <img> asks for: ${image.startsWith('/') ? 'a bundled raster' : 'a remote cover'}`, () => {
      const element = theElementAsksFor(image)
      const link = heroPreloadLink(image)
      expect(link, 'heroPreloadLink refused a src HeroMedia rendered').not.toBeNull()

      const preload = thePreloadAsksFor(link!)

      expect(preload.srcSet).toBe(element.srcSet)
      expect(preload.sizes).toBe(element.sizes)
      expect(sameResource(preload.src)).toBe(sameResource(element.src))
      expect(preload.as).toBe('image')
      expect(preload.fetchPriority).toBe('high')
    })
  }

  it('asks with the hint and the tier HeroMedia itself defaults to', () => {
    // The hint is checked against the element rather than only against the
    // constant, so renaming the constant without changing HeroMedia's default
    // cannot pass.
    expect(theElementAsksFor(IMAGES[0]).sizes).toBe(MEDIA_SIZES.fullBleed)

    const link = heroPreloadLink(IMAGES[0])
    const props = (link as unknown as { props: { sizes: string; quality: number } }).props
    expect(props.sizes).toBe(MEDIA_SIZES.fullBleed)
    expect(props.quality).toBe(MEDIA_QUALITY.hero)
  })

  it('a different hint really does produce a different key, so the equality above is not vacuous', () => {
    const asHero = thePreloadAsksFor(
      <HeroPreloadLink src={IMAGES[0]} sizes={MEDIA_SIZES.fullBleed} quality={MEDIA_QUALITY.hero} />,
    )
    const asCard = thePreloadAsksFor(
      <HeroPreloadLink src={IMAGES[0]} sizes={MEDIA_SIZES.railEventCard} quality={MEDIA_QUALITY.hero} />,
    )
    expect(asCard.sizes).not.toBe(asHero.sizes)
  })

  it('preloads nothing for a src HeroMedia would refuse, because that image never paints', () => {
    expect(heroPreloadLink(null)).toBeNull()
    expect(heroPreloadLink('')).toBeNull()
    expect(heroPreloadLink('https://not-an-allowed-host.example/x.jpg')).toBeNull()
    expect(preloadSpy).not.toHaveBeenCalled()
  })
})
