import Link from 'next/link'

interface AccountUser {
  /** First initial + last initial for the avatar placeholder. Falls back to first
   *  two characters of the email if no name is available. Always 1-2 uppercase chars. */
  initials: string
  /** Display name for the aria-label (first name preferred, email as fallback). */
  displayName: string
}

interface Props {
  user: AccountUser
  /** Visual size: `header` is the 32px desktop/mobile header avatar.
   *  `drawer` is the 40px mobile drawer header avatar with adjacent name label. */
  size?: 'header' | 'drawer'
  className?: string
}

/**
 * SiteHeaderAccountButton (Batch 9.1.1) - 32px circular avatar shell.
 *
 * Renders a navy-fill circle with 1px gold border, white initials, soft hover
 * scale, and a focus-visible gold ring. Click routes to /account.
 *
 * Visual shell only; the dropdown menu (account, sign out, settings) ships in
 * 9.2 with the notification data layer. The link target is a real route so
 * keyboard users land on /account, not on a stub modal.
 *
 * `size="drawer"` renders a 40px variant with the user's display name beside
 * it, used in the mobile sheet header where horizontal space is plentiful.
 *
 * Reduced motion: the 1.05 hover scale is suppressed when prefers-reduced-
 * motion: reduce is set (handled in globals.css via .motion-reduce:transform-none).
 */
export function SiteHeaderAccountButton({ user, size = 'header', className = '' }: Props) {
  const isDrawer = size === 'drawer'
  return (
    <Link
      href="/account"
      prefetch={false}
      aria-label={`Account menu for ${user.displayName}`}
      className={[
        'inline-flex items-center gap-3 rounded-full',
        'transition-transform duration-200 motion-reduce:transition-none',
        'hover:scale-[1.05] motion-reduce:hover:scale-100',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-navy-950)]',
        className,
      ].join(' ')}
      style={{
        transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    >
      <span
        aria-hidden
        className={[
          'inline-flex shrink-0 items-center justify-center rounded-full',
          'font-display font-semibold uppercase tracking-tight text-white',
          isDrawer ? 'h-10 w-10 text-sm' : 'h-8 w-8 text-[11px]',
        ].join(' ')}
        style={{
          backgroundColor: 'var(--color-navy-950)',
          border: '1px solid var(--brand-accent)',
        }}
      >
        {user.initials}
      </span>
      {isDrawer ? (
        <span className="text-sm font-semibold text-ink-900">
          {user.displayName}
        </span>
      ) : null}
    </Link>
  )
}

/**
 * Derive the initials + displayName for the AccountButton from a Supabase
 * `User` row. Used by the SiteHeader server wrapper before passing the
 * minimal `AccountUser` object across the client boundary.
 *
 * Avoids leaking the full Supabase user (with email, app metadata, IDs)
 * into the client bundle - only the visual identity ships.
 */
export function deriveAccountUser(input: {
  email?: string | null
  user_metadata?: { full_name?: string | null; name?: string | null } | null
}): AccountUser {
  const fullName =
    input.user_metadata?.full_name?.trim() ||
    input.user_metadata?.name?.trim() ||
    ''
  if (fullName) {
    const parts = fullName.split(/\s+/).filter(Boolean)
    const first = parts[0] ?? ''
    const last  = parts.length > 1 ? parts[parts.length - 1] : ''
    const initials =
      (first.charAt(0) + (last.charAt(0) || (first.charAt(1) ?? ''))).toUpperCase()
    const displayName = first || fullName
    return { initials: initials || '??', displayName: displayName || (input.email ?? 'Account') }
  }
  const email = (input.email ?? '').trim()
  if (email) {
    const local = email.split('@')[0] ?? ''
    const initials = (local.slice(0, 2) || '??').toUpperCase()
    return { initials, displayName: local || email }
  }
  return { initials: '??', displayName: 'Account' }
}

export type { AccountUser }
