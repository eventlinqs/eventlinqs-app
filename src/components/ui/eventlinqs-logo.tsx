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
  sm: 'text-[16px] leading-none',
  md: 'text-[20px] leading-none',
  lg: 'text-[30px] leading-none',
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
  // Accessibility flags this on `/culture/african/sydney`). Wrapping the
  // inverted wordmark in a small navy chip with alpha 0.95 (axe-opaque
  // threshold) provides a guaranteed-dark background for the contrast
  // computation while keeping the State A look-and-feel subtle. The
  // default variant has dark text on light surface so the chip is not
  // applied. */
  const invertedChipStyle =
    variant === 'inverted'
      ? {
          backgroundColor: 'rgba(10, 22, 40, 0.95)',
          padding: '0.125rem 0.375rem',
          borderRadius: '0.375rem',
        }
      : undefined

  const content = (
    <span
      style={invertedChipStyle}
      className={[
        'inline-flex items-baseline font-display font-extrabold tracking-tight',
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
        className="inline-flex items-baseline transition-colors hover:text-gold-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2 rounded-sm"
      >
        {content}
      </Link>
    )
  }

  return content
}
