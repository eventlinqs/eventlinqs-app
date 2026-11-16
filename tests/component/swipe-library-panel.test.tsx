import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SwipeLibraryPanel } from '@/components/admin/swipe-library-panel'
import { OURS, REFERENCES } from '@/lib/social/swipe/library'

/* EL-M2 (the PM's 01:30 of 16 November 2026): the swipe library shown read only on /admin/automation. */
describe('the swipe library panel', () => {
  it('shows our locked 22 and every reference, each reference a link out with its day and what we take', () => {
    const { container } = render(<SwipeLibraryPanel />)
    expect(container.querySelectorAll('[data-ours]')).toHaveLength(22)
    expect(container.querySelectorAll('[data-reference]')).toHaveLength(REFERENCES.length)
    for (const r of REFERENCES) {
      const a = screen.getByRole('link', { name: `${r.leader}: ${r.title}` })
      expect(a.getAttribute('href')).toBe(r.link)
      expect(a.getAttribute('rel')).toBe('noopener noreferrer')
    }
    expect(screen.getAllByText(/^What we take:/)).toHaveLength(REFERENCES.length)
    expect(screen.getByText(`${OURS[7].n}. ${OURS[7].family}, ${OURS[7].where}`)).toBeTruthy()
    expect(container.querySelectorAll('button, input, form')).toHaveLength(0)
  })
})
