import type { ReactNode } from 'react'

interface ProseProps {
  children: ReactNode
  className?: string
}

/**
 * Prose - typography wrapper for long-form text.
 *
 * Applies consistent styling to headings, paragraphs, lists, links,
 * code, and blockquotes - without @tailwindcss/typography or any plugin.
 * Every style is explicit Tailwind utility or CSS-var based.
 *
 * Usage:
 *   <Prose>
 *     <h2>Section Heading</h2>
 *     <p>Body text...</p>
 *   </Prose>
 *
 * The outer container is max-w-prose (~65ch) and sets base line-height.
 * Intended to be used inside <ContentSection width="prose">.
 */
export function Prose({ children, className = '' }: ProseProps) {
  return (
    <div
      className={[
        // Container
        'max-w-prose',
        // Base text
        'text-base leading-relaxed text-[var(--text-primary)]',

        // ── Headings ──────────────────────────────────────────────────────
        // h2
        '[&_h2]:mt-12 [&_h2]:mb-4',
        '[&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-bold',
        '[&_h2]:leading-tight [&_h2]:tracking-tight',
        '[&_h2]:text-[var(--text-primary)]',
        // h3
        '[&_h3]:mt-8 [&_h3]:mb-3',
        '[&_h3]:font-display [&_h3]:text-xl [&_h3]:font-semibold',
        '[&_h3]:leading-snug [&_h3]:text-[var(--text-primary)]',
        // h4
        '[&_h4]:mt-6 [&_h4]:mb-2',
        '[&_h4]:font-display [&_h4]:text-lg [&_h4]:font-semibold',
        '[&_h4]:text-[var(--text-primary)]',

        // ── Body text ─────────────────────────────────────────────────────
        '[&_p]:mb-5 [&_p]:leading-relaxed',

        // ── Lists ─────────────────────────────────────────────────────────
        '[&_ul]:mb-5 [&_ul]:pl-6 [&_ul]:list-disc',
        '[&_ol]:mb-5 [&_ol]:pl-6 [&_ol]:list-decimal',
        '[&_li]:mb-2 [&_li]:leading-relaxed',
        '[&_li>ul]:mt-2 [&_li>ol]:mt-2',

        // ── Links ─────────────────────────────────────────────────────────
        '[&_a]:text-[var(--brand-accent)] [&_a]:underline',
        '[&_a]:underline-offset-2 [&_a]:decoration-[var(--brand-accent)]',
        '[&_a:hover]:text-[var(--brand-accent-hover)]',
        '[&_a:hover]:decoration-[var(--brand-accent-hover)]',

        // ── Code ──────────────────────────────────────────────────────────
        '[&_code]:rounded [&_code]:bg-[var(--surface-2)]',
        '[&_code]:px-1.5 [&_code]:py-0.5',
        '[&_code]:font-mono [&_code]:text-sm [&_code]:text-[var(--text-primary)]',
        // Block code (pre > code)
        '[&_pre]:mb-5 [&_pre]:overflow-x-auto [&_pre]:rounded-lg',
        '[&_pre]:bg-[var(--surface-dark)] [&_pre]:p-4',
        '[&_pre_code]:bg-transparent [&_pre_code]:px-0 [&_pre_code]:py-0',
        '[&_pre_code]:text-[var(--text-on-dark)]',

        // ── Blockquote ────────────────────────────────────────────────────
        '[&_blockquote]:mb-5 [&_blockquote]:pl-4',
        '[&_blockquote]:border-l-4 [&_blockquote]:border-[var(--brand-accent)]',
        '[&_blockquote]:italic [&_blockquote]:text-[var(--text-secondary)]',

        // ── Strong / em ───────────────────────────────────────────────────
        '[&_strong]:font-semibold [&_strong]:text-[var(--text-primary)]',
        '[&_em]:italic',

        // ── HR ────────────────────────────────────────────────────────────
        '[&_hr]:my-10 [&_hr]:border-[var(--surface-2)]',

        className,
      ].filter(Boolean).join(' ')}
    >
      {children}
    </div>
  )
}
