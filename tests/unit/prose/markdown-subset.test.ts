// Organiser prose: the syntax is never displayed (close-out UX1.1).
//
// The first real outside organiser published on production with a bio of
// `**MKL Studios**` and the page rendered the asterisks. This file drills the
// exact bio shape the close-out named - bold, italic, a link and a list - in
// BOTH directions, because the rendered tree and the plain-text strip come out
// of one parser and the whole safety of that choice rests on them agreeing.

import { describe, expect, test } from 'vitest'
import {
  hasMarkdownSyntax,
  parseProse,
  safeHref,
  stripMarkdown,
  type ProseInline,
} from '@/lib/prose/markdown-subset'

/** Flatten a parsed tree back to the text a reader would see. */
function seen(src: string): string {
  return stripMarkdown(src)
}

function kinds(nodes: ProseInline[]): string[] {
  return nodes.map(n => n.kind)
}

describe('the reported defect', () => {
  test('the MKL Studios bio no longer shows its asterisks', () => {
    const bio = '**MKL Studios**'
    expect(seen(bio)).toBe('MKL Studios')
    expect(seen(bio)).not.toContain('*')

    const blocks = parseProse(bio)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].kind).toBe('paragraph')
    if (blocks[0].kind !== 'paragraph') throw new Error('unreachable')
    expect(kinds(blocks[0].children)).toEqual(['strong'])
  })

  test('hasMarkdownSyntax sees it, and leaves plain prose alone', () => {
    expect(hasMarkdownSyntax('**MKL Studios**')).toBe(true)
    expect(hasMarkdownSyntax('MKL Studios run nights in West Melbourne.')).toBe(false)
    expect(hasMarkdownSyntax(null)).toBe(false)
  })
})

describe('the drilled bio: bold, italic, a link and a list', () => {
  const BIO = [
    '# About us',
    '',
    'We are **MKL Studios**, an _independent_ collective in West Melbourne.',
    '',
    'What we run:',
    '',
    '- Afro fusion showcases',
    '- Open decks for **new** DJs',
    '- Community fundraisers',
    '',
    'Find us at [our site](https://mklstudios.example.com).',
  ].join('\n')

  const blocks = parseProse(BIO)

  test('every marker is gone from the plain-text direction', () => {
    const text = seen(BIO)
    for (const marker of ['**', '__', '# ', '- ', '](', '](http']) {
      expect(text).not.toContain(marker)
    }
    expect(text).toContain('About us')
    expect(text).toContain('MKL Studios')
    expect(text).toContain('independent')
    expect(text).toContain('Afro fusion showcases')
    expect(text).toContain('our site')
    // The URL itself is not prose and must not leak into a meta description.
    expect(text).not.toContain('mklstudios.example.com')
  })

  test('the rendered direction keeps the structure the organiser wrote', () => {
    const paragraphs = blocks.filter(b => b.kind === 'paragraph')
    const lists = blocks.filter(b => b.kind === 'list')
    expect(lists).toHaveLength(1)
    expect(paragraphs.length).toBeGreaterThanOrEqual(3)

    const list = lists[0]
    if (list.kind !== 'list') throw new Error('unreachable')
    expect(list.ordered).toBe(false)
    expect(list.items).toHaveLength(3)
    // Bold inside a list item still parses.
    expect(kinds(list.items[1])).toContain('strong')
  })

  test('bold, italic and the link each parse to their own node', () => {
    const flat = blocks.flatMap(b => (b.kind === 'paragraph' ? b.children : b.items.flat()))
    expect(kinds(flat)).toContain('strong')
    expect(kinds(flat)).toContain('em')
    const link = flat.find(n => n.kind === 'link')
    expect(link).toBeDefined()
    if (link?.kind !== 'link') throw new Error('unreachable')
    expect(link.href).toBe('https://mklstudios.example.com')
  })

  test('an ordered list is ordered, and a mixed run splits', () => {
    const ordered = parseProse('1. first\n2. second')
    expect(ordered).toHaveLength(1)
    expect(ordered[0].kind === 'list' && ordered[0].ordered).toBe(true)

    const mixed = parseProse('- bullet\n1. numbered')
    expect(mixed.filter(b => b.kind === 'list')).toHaveLength(2)
  })
})

describe('link safety: the allowlist is the defence', () => {
  test.each([
    ['https://example.com/x', 'https://example.com/x'],
    ['http://example.com', 'http://example.com'],
    ['mailto:hello@example.com', 'mailto:hello@example.com'],
    ['/events/afro-fusion', '/events/afro-fusion'],
    ['https://example.com "Title"', 'https://example.com'],
  ])('accepts %s', (raw, expected) => {
    expect(safeHref(raw)).toBe(expected)
  })

  test.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:text/html;base64,PHNjcmlwdD4=',
    'vbscript:msgbox(1)',
    '//evil.example/phish',
    '   ',
  ])('refuses %s', raw => {
    expect(safeHref(raw)).toBeNull()
  })

  test('a refused link keeps its words and loses its href', () => {
    const blocks = parseProse('Read [the notice](javascript:alert(1)) before you come.')
    expect(blocks).toHaveLength(1)
    if (blocks[0].kind !== 'paragraph') throw new Error('unreachable')
    expect(kinds(blocks[0].children)).not.toContain('link')
    expect(seen('Read [the notice](javascript:alert(1)) before you come.')).toBe(
      'Read the notice before you come.',
    )
  })

  test('raw HTML in a bio is never a node, so it can never be an element', () => {
    const bio = 'We are <script>alert(1)</script> loud.'
    const blocks = parseProse(bio)
    if (blocks[0].kind !== 'paragraph') throw new Error('unreachable')
    // Every child is inert text; React escapes it on render.
    expect(kinds(blocks[0].children)).toEqual(['text'])
    expect(seen(bio)).toBe(bio)
  })
})

describe('prose that only looks like markdown', () => {
  test('arithmetic is not emphasis', () => {
    expect(seen('Doors 8 * 4 * 2 deep.')).toBe('Doors 8 * 4 * 2 deep.')
  })

  test('a snake_case word is not italic', () => {
    expect(seen('Ask for the venue_manager_key on arrival.')).toBe(
      'Ask for the venue_manager_key on arrival.',
    )
  })

  test('an escaped asterisk survives as an asterisk', () => {
    expect(seen('Tickets \\*do not\\* transfer.')).toBe('Tickets *do not* transfer.')
  })

  test('an unclosed delimiter is left alone', () => {
    expect(seen('Rated 5 ** out of ten')).toBe('Rated 5 ** out of ten')
  })

  test('a thematic break disappears rather than rendering as dashes', () => {
    expect(seen('One night.\n\n---\n\nEvery month.')).toBe('One night.\n\nEvery month.')
  })

  test('a block quote loses its marker', () => {
    expect(seen('> Come early.')).toBe('Come early.')
  })
})

describe('the two directions cannot drift', () => {
  // The whole reason stripMarkdown walks the parsed tree is that a second
  // implementation would eventually disagree with the renderer. This pins it:
  // whatever the renderer would show as words is exactly what strip returns.
  function wordsFromTree(src: string): string {
    const text = (nodes: ProseInline[]): string =>
      nodes
        .map(n =>
          n.kind === 'text' || n.kind === 'code' ? n.value : text(n.children),
        )
        .join('')
    return parseProse(src)
      .map(b => (b.kind === 'paragraph' ? text(b.children) : b.items.map(text).join('. ')))
      .join('\n\n')
      .replace(/[ \t]+\n/g, '\n')
      .trim()
  }

  test.each([
    '**MKL Studios**',
    '# Heading\n\nBody with _emphasis_ and `code`.',
    '- one\n- two **three**',
    'A [link](https://example.com) and a [refused](javascript:x) one.',
    '',
  ])('agree on %j', src => {
    expect(stripMarkdown(src)).toBe(wordsFromTree(src))
  })

  test('empty and null collapse to an empty string, never to "null"', () => {
    expect(stripMarkdown(null)).toBe('')
    expect(stripMarkdown(undefined)).toBe('')
    expect(stripMarkdown('   \n  ')).toBe('')
    expect(parseProse(null)).toEqual([])
  })
})
