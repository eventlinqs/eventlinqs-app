// M6+: add in-app curated image library for organisers. Until then, branded
// placeholder is the only fallback — no stock imagery in tile contexts.

/**
 * BrandedPlaceholder — dark-gradient EventLinqs-wordmark tile shown in place
 * of organiser photography when none exists. Matches the pattern Eventbrite
 * and Luma use for coverless events — brand-trust over generic stock.
 *
 * Renders absolutely positioned — parent must be `relative`.
 */

interface Props {
  category?: string | null
  className?: string
}

export function BrandedPlaceholder({ category, className = '' }: Props) {
  return (
    <div
      className={`absolute inset-0 flex flex-col items-center justify-center overflow-hidden ${className}`}
      aria-hidden
    >
      <div className="absolute inset-0 bg-gradient-to-br from-ink-900 via-ink-800 to-navy-950" />
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            'radial-gradient(circle at 30% 20%, rgba(212,160,23,0.18) 0%, transparent 40%), radial-gradient(circle at 70% 80%, rgba(212,160,23,0.12) 0%, transparent 40%)',
        }}
      />
      <div className="relative z-10 text-center px-4">
        <div className="font-display text-white/50 text-xs font-bold tracking-[0.3em] uppercase mb-2">
          EventLinqs<span className="text-gold-400">.</span>
        </div>
        {category ? (
          <div className="font-display text-gold-400/90 text-[10px] font-bold tracking-[0.22em] uppercase">
            {category}
          </div>
        ) : null}
      </div>
    </div>
  )
}
