import type { ReactNode } from 'react'

interface AuthCardProps {
  title: string
  subtitle?: string
  children: ReactNode
  /** Footer slot - typically a "Don't have an account? Sign up" link */
  footer?: ReactNode
}

/**
 * AuthCard - the centered card used by /auth/signin and /auth/signup.
 *
 * The outer section uses surface="alt" so the card is visually lifted.
 * The card itself sits on surface="base" (white) with a generous shadow.
 *
 * Usage:
 *   <AuthCard title="Sign in" subtitle="Welcome back" footer={<>...</>}>
 *     <FormField ... />
 *     <Button type="submit">Sign in</Button>
 *   </AuthCard>
 */
export function AuthCard({ title, subtitle, children, footer }: AuthCardProps) {
  return (
    <section
      className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-[var(--surface-1)] px-4 py-16"
      aria-labelledby="auth-card-heading"
    >
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="rounded-2xl bg-[var(--surface-0)] p-8 shadow-lg md:p-10">
          {/* Heading */}
          <div className="mb-8">
            <h1
              id="auth-card-heading"
              className="font-display text-2xl font-bold tracking-tight text-[var(--text-primary)]"
            >
              {title}
            </h1>
            {subtitle && (
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                {subtitle}
              </p>
            )}
          </div>

          {/* Form content */}
          <div className="space-y-5">
            {children}
          </div>
        </div>

        {/* Footer slot - lives outside the card */}
        {footer && (
          <div className="mt-6 text-center text-sm text-[var(--text-secondary)]">
            {footer}
          </div>
        )}
      </div>
    </section>
  )
}
