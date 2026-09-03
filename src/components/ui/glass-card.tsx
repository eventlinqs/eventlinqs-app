import type { ReactNode } from 'react'

/**
 * GlassCard - overlay card used for chips and ribbon cards that sit on imagery.
 *
 * THE NAME IS NOW A MISNOMER AND IS KEPT ONLY TO AVOID AN UNRELATED RENAME.
 * There is no glass here and there must never be again. CLAUDE.md, Design
 * system, "Light and airy": "Surfaces are solid and opaque. No glassmorphism
 * anywhere: no backdrop-filter / backdrop-blur chrome." Motion repeats it in
 * its forbidden list. Both competitors use solid headers, filter bars and
 * badges, and so do we.
 *
 * This component carried `backdrop-blur-2xl` on the dark variant and
 * `backdrop-blur-md` on a light variant until 2026-09-02. The same law had
 * already been applied to the site header, whose own comment records the
 * frosted treatment being removed for legibility, so this was the last
 * backdrop-filter left in `src`.
 *
 * Translucency WITHOUT a backdrop-filter is explicitly allowed by that same
 * clause ("a /95 badge is not glassmorphism"), which is why the navy stays at
 * 92 percent rather than being forced fully opaque.
 *
 * Variants:
 *   - 'dark'          : near-opaque navy for chips and pills on dark imagery
 *   - 'light-on-dark' : solid cream card with a gold frame for ribbon cards
 *                       that sit on dark imagery and need readable ink text
 *
 * A third variant, 'light', was removed in the same pass. It was the only
 * caller-visible thing carrying `backdrop-blur-md`, and nothing in the
 * codebase ever used it, so it was a law violation with no user.
 */

interface Props {
  children: ReactNode
  className?: string
  variant?: 'dark' | 'light-on-dark'
  as?: 'div' | 'aside' | 'section'
}

export function GlassCard({
  children,
  className = '',
  variant = 'dark',
  as: Tag = 'div',
}: Props) {
  const base =
    variant === 'light-on-dark'
      ? 'bg-canvas border-2 border-gold-500 text-ink-900 shadow-[0_24px_48px_rgba(0,0,0,0.5),_0_0_0_1px_rgba(212,160,23,0.2)]'
      : 'bg-ink-900/[0.92] border border-gold-500/50 shadow-[0_0_0_1px_rgba(212,160,23,0.15),0_24px_48px_rgba(0,0,0,0.5),0_0_80px_rgba(212,160,23,0.10)]'
  return <Tag className={`${base} ${className}`}>{children}</Tag>
}
