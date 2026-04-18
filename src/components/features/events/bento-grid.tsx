import type { ReactNode } from 'react'

/**
 * BentoGrid — editorial 12-column CSS grid wrapper for the homepage row 1
 * bento layout. Children decide their own grid-column / grid-row spans via
 * the BentoTile helper below.
 *
 * Desktop: 12 cols × auto rows (min 140px).
 * Mobile:  stacks vertically, tiles full-width.
 */

interface GridProps {
  children: ReactNode
  className?: string
}

export function BentoGrid({ children, className = '' }: GridProps) {
  return (
    <div
      className={`grid grid-cols-1 gap-4 md:grid-cols-12 md:auto-rows-[140px] ${className}`}
    >
      {children}
    </div>
  )
}

/**
 * BentoTile — wraps a single tile with the correct grid span classes based
 * on the `size` token. Sizes map to the manifest's tile grid (A.1.3).
 */

export type BentoSize = 'hero' | 'wide' | 'standard' | 'compact' | 'tall'

const SIZE_CLASSES: Record<BentoSize, string> = {
  hero:     'md:col-span-7 md:row-span-4',
  wide:     'md:col-span-5 md:row-span-2',
  standard: 'md:col-span-3 md:row-span-2',
  compact:  'md:col-span-2 md:row-span-2',
  tall:     'md:col-span-3 md:row-span-3',
}

interface TileProps {
  children: ReactNode
  size: BentoSize
  className?: string
}

export function BentoTile({ children, size, className = '' }: TileProps) {
  return (
    <div
      className={`relative min-h-[280px] overflow-hidden rounded-2xl ${SIZE_CLASSES[size]} ${className}`}
    >
      {children}
    </div>
  )
}
