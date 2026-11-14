/**
 * THE POST PACK SHOWS ONE CHANNEL AT A TIME (the PM's score of 15 November 2026, S1, S3, S4). Six cards stacked open
 * made the success screen about eleven phone screens long at 390. A row of channel chips chooses one card, Instagram
 * first; the research notes under each card are gone; "Copy caption" is outlined, so the one gold button on the
 * screen is "Open your live page".
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { PostPack } from '@/components/launch-kit/post-pack'
import type { Caption } from '@/lib/broadcast/captions'

const caption = (platform: Caption['platform'], label: string, text: string): Caption => ({
  platform,
  label,
  register: `REGISTER NOTE FOR ${label}`,
  text,
  characters: text.length,
  limit: null,
  linkNote: `LINK NOTE FOR ${label}`,
})

const CAPTIONS: Caption[] = [
  caption('facebook', 'Facebook', 'Facebook words https://evl.ink/f'),
  caption('instagram', 'Instagram', 'Instagram words https://evl.ink/i'),
  caption('email', 'Email', 'Email words https://evl.ink/e'),
]
const LEAD = { instagram: 'story', facebook: 'feed', whatsapp: 'story', x: 'feed', linkedin: 'square', email: 'feed' } as const

beforeEach(() => {
  cleanup()
  try {
    window.localStorage.clear()
  } catch {
    // storage may be blocked; the chip works without it
  }
})

describe('the post pack', () => {
  it('opens Instagram first and draws one card', () => {
    const { container } = render(<PostPack eventId="ev-1" captions={CAPTIONS} leadFormat={LEAD} tracked />)
    expect(container.querySelectorAll('article')).toHaveLength(1)
    expect(screen.getByRole('article', { name: 'Instagram post' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Instagram/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /Facebook/ })).toHaveAttribute('aria-pressed', 'false')
  })

  it('a chip opens its own card and is remembered on this device', () => {
    render(<PostPack eventId="ev-1" captions={CAPTIONS} leadFormat={LEAD} tracked />)
    fireEvent.click(screen.getByRole('button', { name: /Facebook/ }))
    expect(screen.getByRole('article', { name: 'Facebook post' })).toBeInTheDocument()
    expect(screen.getByText('Facebook words https://evl.ink/f')).toBeInTheDocument()
    expect(screen.queryByText('Instagram words https://evl.ink/i')).toBeNull()
    expect(window.localStorage.getItem('el-post-pack-channel')).toBe('facebook')
  })

  it('carries no research notes and an outlined Copy caption', () => {
    const { container } = render(<PostPack eventId="ev-1" captions={CAPTIONS} leadFormat={LEAD} tracked />)
    expect(container.textContent).not.toContain('REGISTER NOTE')
    expect(container.textContent).not.toContain('LINK NOTE')
    const copy = screen.getByRole('button', { name: 'Copy caption' })
    expect(copy.className).not.toContain('bg-gold-500')
    expect(copy.className).toContain('border')
  })
})
