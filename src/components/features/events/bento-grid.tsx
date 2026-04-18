import type { ReactNode } from 'react'

/**
 * BentoGrid — equal-weight featured grid: one hero + three identical
 * supporting tiles. Hero spans 2 cols × 3 rows on lg+; supporting tiles
 * are uniform 1 col × 1 row. Mobile: stacks vertically, tiles full-width.
 */

interface GridProps {
  children: ReactNode
  className?: string
}

export function BentoGrid({ children, className = '' }: GridProps) {
  return (
    <div
      className={`grid grid-cols-1 gap-4 lg:grid-cols-3 lg:auto-rows-[180px] ${className}`}
    >
      {children}
    </div>
  )
}

/**
 * BentoTile — wraps a single tile with the correct grid span classes based
 * on the `size` token. `hero` is the cinematic anchor; `supporting` tiles
 * are visually identical so no event looks "less than" another.
 *
 * Legacy sizes (`wide`, `standard`, `compact`, `tall`) retained for non-
 * homepage callers but are not used in the equal-weight homepage layout.
 */

export type BentoSize = 'hero' | 'supporting' | 'wide' | 'standard' | 'compact' | 'tall'

const SIZE_CLASSES: Record<BentoSize, string> = {
  hero:       'lg:col-span-2 lg:row-span-3',
  supporting: 'lg:col-span-1 lg:row-span-1',
  wide:       'lg:col-span-2 lg:row-span-1',
  standard:   'lg:col-span-1 lg:row-span-1',
  compact:    'lg:col-span-1 lg:row-span-1',
  tall:       'lg:col-span-1 lg:row-span-2',
}

interface TileProps {
  children: ReactNode
  size: BentoSize
  className?: string
}

export function BentoTile({ children, size, className = '' }: TileProps) {
  return (
    <div
      className={`relative min-h-[200px] overflow-hidden rounded-2xl ${SIZE_CLASSES[size]} ${className}`}
    >
      {children}
    </div>
  )
}
