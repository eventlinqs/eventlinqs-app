/**
 * The one rule for organiser and artist prose: THE SYNTAX IS NEVER DISPLAYED.
 *
 * WHY THIS FILE EXISTS. On 9 September 2026 the first real outside organiser
 * published an event on production and their bio rendered as
 *
 *     **MKL Studios**
 *
 * asterisks and all, because `organisations.description` was interpolated
 * straight into JSX. People write markdown by reflex and a plain textarea does
 * not stop them. Close-out UX1.1 asked for ONE rule applied everywhere an
 * organiser or an artist writes prose: render the markdown, or strip it, but
 * never show the syntax.
 *
 * THE RULE, DECIDED HERE. Prose surfaces RENDER a restricted subset.
 * Plain-text surfaces (meta descriptions, JSON-LD, og:description, clamped card
 * teasers, email) STRIP it. Both directions come out of the ONE parser below,
 * so a construct that renders in one place cannot survive as raw syntax in the
 * other. That is why `stripMarkdown` walks the same tree the renderer walks
 * instead of running its own regexes: two implementations would drift, and the
 * drift would stay invisible until an organiser hit it.
 *
 * WHY A PARSER AND NOT A LIBRARY. The renderer emits REACT NODES, never an HTML
 * string, so there is no `dangerouslySetInnerHTML` on this path and no
 * sanitiser to get wrong. That matches the posture the event description
 * already takes (src/app/events/[slug]/page.tsx: "never via
 * dangerouslySetInnerHTML, so an organiser cannot inject stored XSS into the
 * public event page"). It also adds no dependency, which CLAUDE.md Tooling
 * reserves for founder approval.
 *
 * THE SUBSET, deliberately small: paragraphs, soft line breaks, bullet and
 * numbered lists, bold, italic, inline code and links. Headings, block quotes
 * and thematic breaks are ACCEPTED and their markers removed, because a `#`
 * left on screen is the very defect this file exists to stop. Everything else
 * is text.
 */

export type ProseInline =
  | { kind: 'text'; value: string }
  | { kind: 'strong'; children: ProseInline[] }
  | { kind: 'em'; children: ProseInline[] }
  | { kind: 'code'; value: string }
  | { kind: 'link'; href: string; children: ProseInline[] }

export type ProseBlock =
  | { kind: 'paragraph'; children: ProseInline[] }
  | { kind: 'list'; ordered: boolean; items: ProseInline[][] }

/** Characters a backslash may escape, so an escaped asterisk renders literally. */
const ESCAPABLE = new Set(['\\', '`', '*', '_', '[', ']', '(', ')', '#', '-', '+', '.', '>'])

const BULLET_LINE = /^[ \t]{0,3}[-*+][ \t]+(.*)$/
const ORDERED_LINE = /^[ \t]{0,3}\d{1,9}[.)][ \t]+(.*)$/
const HEADING_LINE = /^[ \t]{0,3}#{1,6}[ \t]+(.*)$/
const QUOTE_LINE = /^[ \t]{0,3}>[ \t]?(.*)$/
/** A line of only dashes, underscores or asterisks is a rule, never content. */
const RULE_LINE = /^[ \t]{0,3}([-_*])(?:[ \t]*\1){2,}[ \t]*$/

/**
 * Resolve a link target, or refuse it.
 *
 * Only http, https, mailto and site-relative paths are allowed. `javascript:`,
 * `data:` and `vbscript:` are the reason this function exists: an organiser bio
 * is attacker-controlled text on a public page, and a scheme allowlist is the
 * only defence that does not depend on getting an escaping rule right. A
 * refused link keeps its TEXT and loses its href, so the reader still sees
 * words rather than syntax.
 */
export function safeHref(raw: string): string | null {
  const url = raw.trim()
  if (!url) return null
  // Drop a markdown title: [text](https://example.com "Title")
  const bare = url.replace(/\s+["'(].*$/, '').trim()
  if (!bare) return null
  if (/^https?:\/\/\S+$/i.test(bare)) return bare
  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(bare)) return bare
  // Site-relative only. A protocol-relative "//evil.example" is NOT relative.
  if (/^\/(?!\/)\S*$/.test(bare)) return bare
  return null
}

/** Match a link at `start`, or return null. */
function matchLink(src: string, start: number): { text: string; href: string; next: number } | null {
  let depth = 0
  let close = -1
  for (let i = start; i < src.length; i++) {
    const c = src[i]
    if (c === '\\') { i++; continue }
    if (c === '[') depth++
    else if (c === ']') {
      depth--
      if (depth === 0) { close = i; break }
    }
  }
  if (close === -1 || src[close + 1] !== '(') return null

  let paren = 0
  let end = -1
  for (let i = close + 1; i < src.length; i++) {
    const c = src[i]
    if (c === '\\') { i++; continue }
    if (c === '(') paren++
    else if (c === ')') {
      paren--
      if (paren === 0) { end = i; break }
    }
  }
  if (end === -1) return null

  return { text: src.slice(start + 1, close), href: src.slice(close + 2, end), next: end + 1 }
}

/** Letters and digits, for the intraword underscore rule below. */
const WORD_CHAR = /[\p{L}\p{N}]/u

/**
 * Find the closing run for an emphasis delimiter opened at `from`.
 *
 * Follows the two parts of the CommonMark flanking rule that matter here.
 *
 * 1. A run may not close on whitespace, so "3 * 4 * 5" stays arithmetic
 *    instead of turning the 4 italic.
 * 2. An UNDERSCORE may not open or close inside a word. Without this,
 *    `venue_manager_key` renders as `venuemanagerkey`, silently eating the
 *    organiser's text. An asterisk deliberately keeps intraword behaviour,
 *    which is also what CommonMark does.
 */
function findClosing(src: string, from: number, delim: string, intraword: boolean): number {
  for (let i = from; i <= src.length - delim.length; i++) {
    if (src[i] === '\\') { i++; continue }
    if (!src.startsWith(delim, i)) continue
    // A single-character delimiter must not match half of a double run.
    if (delim.length === 1 && (src[i + 1] === delim || src[i - 1] === delim)) continue
    if (i === from) continue // an empty span is not emphasis
    if (/\s/.test(src[i - 1])) continue // a closing run may not follow whitespace
    // An underscore run may not close with a word character on its far side.
    if (!intraword && WORD_CHAR.test(src[i + delim.length] ?? '')) continue
    return i
  }
  return -1
}

/** Parse the inline constructs of one logical block of text. */
export function parseInline(src: string): ProseInline[] {
  const out: ProseInline[] = []
  let buf = ''
  const flush = () => {
    if (buf) { out.push({ kind: 'text', value: buf }); buf = '' }
  }

  let i = 0
  while (i < src.length) {
    const ch = src[i]

    if (ch === '\\' && i + 1 < src.length && ESCAPABLE.has(src[i + 1])) {
      buf += src[i + 1]
      i += 2
      continue
    }

    if (ch === '`') {
      const end = src.indexOf('`', i + 1)
      if (end > i + 1) {
        flush()
        out.push({ kind: 'code', value: src.slice(i + 1, end) })
        i = end + 1
        continue
      }
    }

    if (ch === '[') {
      const m = matchLink(src, i)
      if (m) {
        const href = safeHref(m.href)
        flush()
        const children = parseInline(m.text)
        // A refused scheme keeps the words and drops the link. Never the syntax.
        if (href) out.push({ kind: 'link', href, children })
        else out.push(...children)
        i = m.next
        continue
      }
    }

    if ((ch === '*' || ch === '_') && !/\s/.test(src[i + 1] ?? ' ')) {
      const double = src[i + 1] === ch
      const delim = double ? ch + ch : ch
      // An underscore run may not OPEN with a word character behind it, so
      // `venue_manager_key` never starts an emphasis span in the first place.
      const intraword = ch === '*'
      const mayOpen = intraword || !WORD_CHAR.test(src[i - 1] ?? '')
      if (mayOpen && !(double && /\s/.test(src[i + 2] ?? ' '))) {
        const end = findClosing(src, i + delim.length, delim, intraword)
        if (end !== -1) {
          flush()
          const children = parseInline(src.slice(i + delim.length, end))
          out.push(double ? { kind: 'strong', children } : { kind: 'em', children })
          i = end + delim.length
          continue
        }
      }
    }

    buf += ch
    i++
  }

  flush()
  return out
}

/**
 * Parse organiser prose into blocks.
 *
 * A blank line separates paragraphs. Consecutive list lines of the same kind
 * form one list. A heading or quote marker is removed and its text joins the
 * flow, because the marker must never reach the screen.
 */
export function parseProse(src: string | null | undefined): ProseBlock[] {
  if (!src) return []
  const lines = src.replace(/\r\n?/g, '\n').split('\n')
  const blocks: ProseBlock[] = []
  let para: string[] = []
  let list: { ordered: boolean; items: string[] } | null = null

  const closeParagraph = () => {
    if (para.length === 0) return
    const children = parseInline(para.join('\n'))
    if (children.length > 0) blocks.push({ kind: 'paragraph', children })
    para = []
  }
  const closeList = () => {
    if (!list) return
    const items = list.items.map(t => parseInline(t)).filter(c => c.length > 0)
    if (items.length > 0) blocks.push({ kind: 'list', ordered: list.ordered, items })
    list = null
  }

  for (const raw of lines) {
    if (raw.trim() === '' || RULE_LINE.test(raw)) {
      closeParagraph()
      closeList()
      continue
    }

    const bullet = raw.match(BULLET_LINE)
    const ordered = raw.match(ORDERED_LINE)
    if (bullet || ordered) {
      closeParagraph()
      const isOrdered = Boolean(ordered)
      const text = (bullet ?? ordered)![1]
      if (list && list.ordered !== isOrdered) closeList()
      if (!list) list = { ordered: isOrdered, items: [] }
      list.items.push(text)
      continue
    }
    closeList()

    const heading = raw.match(HEADING_LINE)
    if (heading) {
      closeParagraph()
      para.push(heading[1])
      closeParagraph()
      continue
    }

    const quote = raw.match(QUOTE_LINE)
    para.push(quote ? quote[1] : raw)
  }

  closeParagraph()
  closeList()
  return blocks
}

function inlineText(nodes: ProseInline[]): string {
  return nodes
    .map(n => {
      switch (n.kind) {
        case 'text':
          return n.value
        case 'code':
          return n.value
        case 'strong':
        case 'em':
        case 'link':
          return inlineText(n.children)
      }
    })
    .join('')
}

/**
 * The plain-text direction, for meta descriptions, JSON-LD, og:description,
 * clamped teasers and email. Walks the SAME tree the renderer walks, so a
 * construct cannot render in one place and survive as raw syntax in the other.
 */
export function stripMarkdown(src: string | null | undefined): string {
  return parseProse(src)
    .map(block =>
      block.kind === 'paragraph'
        ? inlineText(block.children)
        : block.items.map(item => inlineText(item)).join('. '),
    )
    .join('\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

/** True when the text carries markdown a reader must never see raw. */
export function hasMarkdownSyntax(src: string | null | undefined): boolean {
  if (!src) return false
  return stripMarkdown(src) !== src.replace(/\r\n?/g, '\n').trim()
}
