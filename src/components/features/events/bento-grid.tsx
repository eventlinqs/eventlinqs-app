import type { ReactNode } from 'react'

/**
 * BentoGrid - 12-column split featuring one cinematic hero tile and a
 * right-hand column of three equal-height supporting tiles.
 *
 * Hero occupies lg:col-span-7 and is a minimum 640px tall so the three
 * supporting tiles (each 200-220px + gaps) balance visually against it.
 * On mobile the whole layout collapses to a single-column stack.
 */

interface GridProps {
  children: ReactNode
  className?: string
}

export function BentoGrid({ children, className = '' }: GridProps) {
  return (
    <div className={`grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6 ${className}`}>
      {children}
    </div>
  )
}

/**
 * BentoSupportingColumn - stacks three supporting tiles vertically in
 * the right 5 columns of the grid. Each child is a supporting BentoTile.
 */

export function BentoSupportingColumn({ children, className = '' }: GridProps) {
  return (
    <div className={`flex flex-col gap-4 lg:col-span-5 ${className}`}>
      {children}
    </div>
  )
}

/**
 * BentoTile - wraps a single tile with the correct sizing based on
 * the `size` token. `hero` is the cinematic anchor (tall, wide);
 * `supporting` tiles are uniform and stack in BentoSupportingColumn.
 *
 * Legacy sizes (`wide`, `standard`, `compact`, `tall`) retained for non-
 * homepage callers.
 */

export type BentoSize = 'hero' | 'supporting' | 'wide' | 'standard' | 'compact' | 'tall'

const SIZE_CLASSES: Record<BentoSize, string> = {
  hero:       'lg:col-span-7 min-h-[360px] lg:min-h-[640px]',
  supporting: 'min-h-[200px] lg:max-h-[220px] flex-1',
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
      className={`relative overflow-hidden rounded-xl ${SIZE_CLASSES[size]} ${className}`}
    >
      {children}
    </div>
  )
}
