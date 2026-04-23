'use client'

import { useRef, type ReactNode } from 'react'
import { useDragScroll } from '@/hooks/use-drag-scroll'

interface Props {
  children: ReactNode
  className?: string
  ariaLabel?: string
  testId?: string
}

export function DragRail({ children, className = '', ariaLabel, testId }: Props) {
  const ref = useRef<HTMLUListElement>(null)
  useDragScroll(ref)
  return (
    <ul
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      data-testid={testId}
      onClickCapture={e => {
        const el = e.currentTarget as HTMLElement
        if (el.getAttribute('data-dragged') === 'true') {
          e.preventDefault()
          e.stopPropagation()
        }
      }}
      className={className}
    >
      {children}
    </ul>
  )
}
