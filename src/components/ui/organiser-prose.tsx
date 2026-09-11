import { Fragment } from 'react'
import { parseProse, type ProseBlock, type ProseInline } from '@/lib/prose/markdown-subset'

/**
 * The ONE renderer for organiser and artist prose (close-out UX1.1).
 *
 * Every surface that shows a bio, an organiser story or an artist blurb uses
 * this. Every surface that needs the same text as PLAIN text uses
 * `stripMarkdown` from the same module. Between them there is no third way to
 * put organiser prose on a screen, which is the point: the first real outside
 * organiser's bio shipped to production reading `**MKL Studios**` because the
 * text was interpolated straight into JSX, and one shared component is the only
 * thing that stops that returning on the next surface somebody writes.
 *
 * SECURITY. This emits REACT NODES. There is no HTML string anywhere on the
 * path, so `dangerouslySetInnerHTML` is never reached and there is no
 * sanitiser to misconfigure. Link targets pass a scheme allowlist in
 * `safeHref`; a refused target keeps its words and loses its href.
 *
 * SEO. An organiser-supplied link is untrusted third-party content on an
 * indexable page, so it carries `nofollow` alongside `noreferrer`. The platform
 * ranks event pages organically (CLAUDE.md, the SEO compounding engine) and a
 * bio field is exactly where link spam lands first.
 */

function renderInline(nodes: ProseInline[], keyPrefix: string): React.ReactNode {
  return nodes.map((node, i) => {
    const key = `${keyPrefix}-${i}`
    switch (node.kind) {
      case 'text':
        return <Fragment key={key}>{node.value}</Fragment>
      case 'strong':
        return <strong key={key} className="font-semibold">{renderInline(node.children, key)}</strong>
      case 'em':
        return <em key={key}>{renderInline(node.children, key)}</em>
      case 'code':
        return (
          <code key={key} className="rounded bg-ink-100 px-1 py-0.5 text-[0.9em]">
            {node.value}
          </code>
        )
      case 'link': {
        const external = /^https?:/i.test(node.href)
        return (
          <a
            key={key}
            href={node.href}
            {...(external ? { target: '_blank', rel: 'noreferrer nofollow' } : {})}
            className="font-medium text-[var(--brand-accent-strong)] underline underline-offset-2 hover:text-ink-900"
          >
            {renderInline(node.children, key)}
          </a>
        )
      }
    }
  })
}

function renderBlock(block: ProseBlock, key: string): React.ReactNode {
  if (block.kind === 'paragraph') {
    // Soft line breaks inside a paragraph are the organiser's own line breaks
    // and are preserved, matching how the event description already reads.
    return (
      <p key={key} className="whitespace-pre-line">
        {renderInline(block.children, key)}
      </p>
    )
  }
  const List = block.ordered ? 'ol' : 'ul'
  return (
    <List
      key={key}
      className={block.ordered ? 'list-decimal space-y-1 pl-5' : 'list-disc space-y-1 pl-5'}
    >
      {block.items.map((item, i) => (
        <li key={`${key}-${i}`}>{renderInline(item, `${key}-${i}`)}</li>
      ))}
    </List>
  )
}

export interface OrganiserProseProps {
  /** The organiser's or artist's own text, exactly as they typed it. */
  text: string | null | undefined
  /** Spacing and type classes for the block flow. The caller owns these. */
  className?: string
}

/**
 * Render organiser prose. Returns null for empty text so a caller never has to
 * guard twice, and so an absent bio cannot leave an empty styled block behind.
 */
export function OrganiserProse({ text, className = 'space-y-4' }: OrganiserProseProps) {
  const blocks = parseProse(text)
  if (blocks.length === 0) return null
  return <div className={className}>{blocks.map((b, i) => renderBlock(b, `b${i}`))}</div>
}
