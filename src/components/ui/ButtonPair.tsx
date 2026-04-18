'use client'

import {
  cloneElement,
  isValidElement,
  useState,
  type ReactNode,
  type ReactElement,
} from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost'

interface ButtonPairProps {
  /** The primary action button. Normally rendered as gold (primary variant). */
  primary: ReactNode
  /** The secondary action button. Becomes gold when hovered; primary softens to ghost. */
  secondary: ReactNode
  /** Gap between buttons. Default 'md'. */
  gap?: 'sm' | 'md' | 'lg'
}

const gapMap = { sm: 'gap-3', md: 'gap-4', lg: 'gap-6' } as const

/**
 * Overrides the variant prop on a Button ReactElement.
 * Safe by contract: call sites pass Button components as children.
 */
function withVariant(node: ReactNode, variant: ButtonVariant): ReactNode {
  if (!isValidElement(node)) return node
  return cloneElement(node as ReactElement<{ variant?: ButtonVariant }>, { variant })
}

/**
 * ButtonPair — coupled-hover pair of buttons.
 *
 * Default state:
 *   primary  = gold (primary variant)
 *   secondary = grey (secondary variant)
 *
 * When secondary is hovered:
 *   secondary = gold (primary variant)
 *   primary   = ghost
 *
 * Transition is inherited from Button's existing transition-all duration-150.
 *
 * Usage:
 *   <ButtonPair
 *     primary={<Button variant="primary" href="/organisers/signup">Start selling</Button>}
 *     secondary={<Button variant="secondary" href="/pricing">View pricing</Button>}
 *   />
 */
export function ButtonPair({ primary, secondary, gap = 'md' }: ButtonPairProps) {
  const [secondaryHovered, setSecondaryHovered] = useState(false)

  const primaryEl  = secondaryHovered ? withVariant(primary,  'ghost')   : primary
  const secondaryEl = secondaryHovered ? withVariant(secondary, 'primary') : secondary

  return (
    <div className={`flex flex-col ${gapMap[gap]} sm:flex-row`}>
      {primaryEl}
      <div
        onMouseEnter={() => setSecondaryHovered(true)}
        onMouseLeave={() => setSecondaryHovered(false)}
      >
        {secondaryEl}
      </div>
    </div>
  )
}
