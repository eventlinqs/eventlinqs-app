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
 * EventlinqsLogo — canonical wordmark.
 *
 * Concept A, Option 2 spacing (0.05em margin-left on the gold dot).
 * Use everywhere the EventLinqs brand appears in the UI chrome.
 */
export function EventlinqsLogo({
  size = 'md',
  variant = 'default',
  asLink = false,
  className,
  'aria-label': ariaLabel = 'EventLinqs — home',
}: Props) {
  const wordmarkColour = variant === 'inverted' ? 'text-white' : 'text-ink-900'

  const content = (
    <span
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
