import Link from 'next/link'

type Size = 'sm' | 'md' | 'lg'
type Variant = 'default' | 'inverted'

type Props = {
  size?: Size
  variant?: Variant
  asLink?: boolean
  className?: string
  'aria-label'?: string
}

const SIZE_CLASS: Record<Size, string> = {
  sm: 'text-base leading-none',
  md: 'text-lg leading-none',
  lg: 'text-3xl leading-none',
}

/**
 * EventlinqsLogo - canonical wordmark.
 *
 * Concept A, Option 2 spacing (0.05em margin-left on the gold dot).
 * Use everywhere the EventLinqs brand appears in the UI chrome.
 */
export function EventlinqsLogo({
  size = 'md',
  variant = 'default',
  asLink = false,
  className,
  'aria-label': ariaLabel = 'EventLinqs home',
}: Props) {
  const wordmarkColour = variant === 'inverted' ? 'text-white' : 'text-ink-900'
  // When the wordmark is white (`variant="inverted"`) it sits over a
  // transparent SiteHeader in State A above whatever hero is behind. In
  // production the photo provides ample contrast, but axe-core's
  // color-contrast rule walks past transparent backgrounds to canvas
  // (#fafaf7) and reports white-on-canvas at 1.04:1 (Lighthouse
  // Accessibility flags this on `/community/african/sydney`). Wrapping the
  // inverted wordmark in a small navy chip with alpha 0.95 (axe-opaque
  // threshold) provides a guaranteed-dark background for the contrast
  // computation while keeping the State A look-and-feel subtle. The
  // default variant has dark text on light surface so the chip is not
  // applied. */
  const invertedChipStyle =
    variant === 'inverted'
      ? { backgroundColor: 'rgba(10, 22, 40, 0.95)' }
      : undefined

  const content = (
    <span
      style={invertedChipStyle}
      className={[
        'inline-flex items-baseline font-display font-extrabold tracking-tight',
        // The chip's padding and radius are utilities on the scale: 2px 6px as
        // before, and rounded-lg (the control radius) where an inline 6px
        // radius used to be the one of its kind on the page.
        variant === 'inverted' ? 'rounded-lg px-1.5 py-0.5' : '',
        SIZE_CLASS[size],
        wordmarkColour,
        className ?? '',
      ].filter(Boolean).join(' ')}
    >
      <span>EVENTLINQS</span>
      <span aria-hidden="true" className="text-gold-500" style={{ marginLeft: '0.05em' }}>.</span>
    </span>
  )

  if (asLink) {
    return (
      <Link
        href="/"
        aria-label={ariaLabel}
        className="inline-flex min-h-11 items-center transition-colors hover:text-gold-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2 rounded-lg"
      >
        {content}
      </Link>
    )
  }

  return content
}
