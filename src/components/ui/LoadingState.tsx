interface LoadingStateProps {
  /** Number of skeleton lines to render. Default 3. */
  lines?: number
}

/**
 * LoadingState - skeleton pulse loader.
 *
 * Renders staggered-width skeleton bars to visually approximate
 * a loading text block. Uses the standard Tailwind `animate-pulse`.
 *
 * Width pattern: 100% → 75% → 90% → 60% → 85%, cycling.
 * This mimics natural paragraph text and avoids uniform robotic rows.
 *
 * Usage:
 *   <LoadingState lines={5} />
 *
 * Respects prefers-reduced-motion via globals.css (animation-duration
 * collapsed to 0.01ms when reduced-motion is set).
 */
export function LoadingState({ lines = 3 }: LoadingStateProps) {
  // Cycle through natural-feeling widths
  const widths = ['100%', '75%', '90%', '60%', '85%']

  return (
    <div className="animate-pulse space-y-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className="h-4 rounded bg-[var(--surface-2)]"
          style={{ width: widths[i % widths.length] }}
        />
      ))}
    </div>
  )
}
