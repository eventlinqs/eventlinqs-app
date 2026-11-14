/**
 * THE PM'S PRE-READ OF 15 NOVEMBER 2026, 01:42, ON THE SUCCESS SCREEN.
 * S8: the six channels appeared twice back to back ("Send it everywhere", then the post pack's chips). One card now:
 *     the chip chooses the channel and the open card carries that channel's share button with its tracked link.
 * S9: the reach empty state keeps its names and markers; each explanation is behind one "What each number means"
 *     disclosure; its buttons show only where the screen has no other way to them (the full Reach page).
 */
import type { ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: ReactNode; href: string } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

import { PostPack } from '@/components/launch-kit/post-pack'
import { ReachEmptyState } from '@/components/broadcast/reach-empty-state'
import type { Caption } from '@/lib/broadcast/captions'

const caption = (platform: Caption['platform'], label: string): Caption => ({
  platform,
  label,
  register: '',
  text: `${label} words`,
  characters: 10,
  limit: null,
  linkNote: '',
})
const CAPTIONS = [caption('instagram', 'Instagram'), caption('facebook', 'Facebook'), caption('whatsapp', 'WhatsApp')]
const LEAD = { instagram: 'story', facebook: 'feed', whatsapp: 'story', x: 'feed', linkedin: 'square', email: 'feed' } as const
const LINKS = {
  instagram: 'https://evl.ink/i',
  facebook: 'https://evl.ink/f',
  whatsapp: 'https://evl.ink/w',
  copy: 'https://evl.ink/c',
}

beforeEach(() => {
  cleanup()
  try {
    window.localStorage.clear()
  } catch {
    // storage may be blocked
  }
})

describe('the open channel card (S8)', () => {
  it('carries that channel\'s share button with its own tracked link, and no row of every channel', () => {
    render(<PostPack eventId="ev" captions={CAPTIONS} leadFormat={LEAD} tracked shareLinks={LINKS} shareText="Night" />)
    fireEvent.click(screen.getByRole('button', { name: /Facebook/ }))
    // Its name is the words it shows (WCAG 2.5.3, label in name).
    const share = screen.getByRole('link', { name: 'Share on Facebook' })
    expect(share.textContent).toContain('Share on Facebook')
    expect(share.getAttribute('href')).toContain(encodeURIComponent('https://evl.ink/f'))
    expect(screen.queryByRole('link', { name: /WhatsApp/ })).toBeNull()
    expect(screen.queryByText('Copy link')).toBeNull()
  })

  it('names a link it can only copy (Instagram has no web share)', () => {
    render(<PostPack eventId="ev" captions={CAPTIONS} leadFormat={LEAD} tracked shareLinks={LINKS} shareText="Night" />)
    expect(screen.getByRole('button', { name: /Copy Instagram link/ })).toBeInTheDocument()
  })
})

describe('the reach empty state (S9)', () => {
  it('on the launch kit: names and markers, one disclosure, no buttons of its own', () => {
    const { container } = render(<ReachEmptyState />)
    expect(container.textContent).toContain('Link clicks')
    expect(container.querySelector('details summary')?.textContent).toBe('What each number means')
    expect(container.querySelector('a')).toBeNull()
  })

  it('on the full Reach page: the two actions stay', () => {
    const { container } = render(<ReachEmptyState shareHref="/r#share-kit" posterHref="/poster" />)
    expect(container.querySelectorAll('a')).toHaveLength(2)
  })
})
