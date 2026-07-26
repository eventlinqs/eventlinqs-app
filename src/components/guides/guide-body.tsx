import { AlertTriangle, Info } from 'lucide-react'
import { GuideShotImage } from '@/components/media'
import { applyLiveValues } from '@/lib/guides'
import type { GuideBlock, GuideLiveValues } from '@/lib/guides/types'

/**
 * The guide body renderer.
 *
 * Guides are structured data, never markdown or raw HTML, so the design system
 * lives here and no guide can paint its own styles or inject markup. Live
 * platform tokens ({{fee}}, {{payoutDays}}) are substituted at this boundary
 * from the one pricing resolver, so a published guide can never carry a stale
 * fee or a stale payout window.
 */
export function GuideBody({
  blocks,
  live,
}: {
  blocks: GuideBlock[]
  live: GuideLiveValues
}) {
  const t = (text: string) => applyLiveValues(text, live)

  return (
    <div className="space-y-7">
      {blocks.map((block, i) => {
        switch (block.kind) {
          case 'heading':
            return (
              <h2
                key={i}
                className="pt-3 font-display text-xl font-bold text-[var(--text-primary)] sm:text-2xl"
              >
                {t(block.text)}
              </h2>
            )

          case 'para':
            return (
              <p key={i} className="text-base leading-[1.75] text-[var(--text-secondary)]">
                {t(block.text)}
              </p>
            )

          case 'list':
            return (
              <ul key={i} className="space-y-3">
                {block.items.map((item, j) => (
                  <li key={j} className="flex gap-3 text-base leading-[1.7] text-[var(--text-secondary)]">
                    <span
                      aria-hidden="true"
                      className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--brand-accent)]"
                    />
                    <span>{t(item)}</span>
                  </li>
                ))}
              </ul>
            )

          case 'steps':
            return (
              <ol key={i} className="space-y-5">
                {block.items.map((item, j) => (
                  <li key={j} className="flex gap-4">
                    <span
                      aria-hidden="true"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-900 font-display text-sm font-bold text-white"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {j + 1}
                    </span>
                    <div className="min-w-0 pt-0.5">
                      <p className="font-display text-base font-bold text-[var(--text-primary)]">
                        {t(item.title)}
                      </p>
                      <p className="mt-1.5 text-base leading-[1.7] text-[var(--text-secondary)]">
                        {t(item.text)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )

          case 'shot':
            return (
              <figure key={i} className="overflow-hidden rounded-2xl border border-[var(--surface-2)] bg-[var(--surface-0)] shadow-md">
                <div className="relative aspect-[16/10] w-full bg-[var(--surface-1)]">
                  <GuideShotImage src={block.shot.src} alt={block.shot.alt} />
                </div>
                <figcaption className="border-t-2 border-gold-500 px-5 py-3">
                  <span className="block text-sm leading-relaxed text-[var(--text-secondary)]">
                    {t(block.shot.caption)}
                  </span>
                  <span className="mt-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                    Captured from the live platform
                    {block.shot.viewport ? ` at ${block.shot.viewport}px` : ''}
                  </span>
                </figcaption>
              </figure>
            )

          case 'note':
            return (
              <aside
                key={i}
                className="rounded-2xl border border-[var(--surface-2)] bg-[var(--surface-1)] p-5"
              >
                <p className="flex items-center gap-2 font-display text-sm font-bold text-[var(--text-primary)]">
                  <Info className="h-4 w-4 shrink-0 text-[var(--brand-accent-strong)]" aria-hidden="true" />
                  {t(block.title)}
                </p>
                <p className="mt-2 text-sm leading-[1.7] text-[var(--text-secondary)]">
                  {t(block.text)}
                </p>
              </aside>
            )

          case 'pitfall':
            return (
              <aside key={i} className="rounded-2xl border border-gold-500/40 bg-gold-500/10 p-5">
                <p className="flex items-center gap-2 font-display text-sm font-bold text-ink-900">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-gold-800" aria-hidden="true" />
                  {t(block.title)}
                </p>
                <p className="mt-2 text-sm leading-[1.7] text-ink-900/85">{t(block.text)}</p>
              </aside>
            )
        }
      })}
    </div>
  )
}
