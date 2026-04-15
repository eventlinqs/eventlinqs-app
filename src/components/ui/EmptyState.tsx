import type { ComponentType } from 'react'
import { Button } from './Button'

interface ActionDef {
  label: string
  href?: string
  onClick?: () => void
}

interface EmptyStateProps {
  /** A Lucide icon component, e.g. `FileQuestion` from lucide-react */
  icon?: ComponentType<{ className?: string }>
  title: string
  description?: string
  primaryAction?: ActionDef
  secondaryAction?: ActionDef
}

/**
 * EmptyState — shown when a page or list has no data.
 *
 * Follows the brand voice: warm and directive, never dismissive.
 * Always tells the user what to do next via primaryAction.
 *
 * Usage:
 *   <EmptyState
 *     icon={FileQuestion}
 *     title="No articles yet"
 *     description="We're still building the help centre. Check back soon."
 *     primaryAction={{ label: 'Back to Help Centre', href: '/help' }}
 *     secondaryAction={{ label: 'Contact support', href: '/contact' }}
 *   />
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  primaryAction,
  secondaryAction,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center px-4">

      {/* Icon */}
      {Icon && (
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--surface-2)]">
          <Icon className="h-8 w-8 text-[var(--text-muted)]" />
        </div>
      )}

      {/* Title */}
      <h2 className="text-xl font-semibold text-[var(--text-primary)]">
        {title}
      </h2>

      {/* Description */}
      {description && (
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-[var(--text-secondary)]">
          {description}
        </p>
      )}

      {/* Actions */}
      {(primaryAction || secondaryAction) && (
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          {primaryAction && (
            <Button
              variant="primary"
              size="md"
              href={primaryAction.href}
              onClick={primaryAction.href ? undefined : primaryAction.onClick}
            >
              {primaryAction.label}
            </Button>
          )}
          {secondaryAction && (
            <Button
              variant="secondary"
              size="md"
              href={secondaryAction.href}
              onClick={secondaryAction.href ? undefined : secondaryAction.onClick}
            >
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
