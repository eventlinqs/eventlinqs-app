import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Button } from '@/components/ui/Button'

/*
 * A LABEL THAT WRAPS STAYS INSIDE ITS BUTTON, CENTRED (LAUNCH-READINESS row 17, /pricing read on production at 768 on
 * 7 November 2026). In the three-card row at 768 the Paid card's 'Start selling tickets' wrapped to two lines inside a
 * box fixed at 44px, set flush left against its top edge, beside 'Contact us' centred on one line. Every Button was
 * fixed height (h-11, h-12), so any label that wraps on a narrow card did the same. The height is now a floor: a one
 * line button is still 44px (48px large), the touch-target law; a wrapped label grows the button and stays centred.
 */
describe('the shared Button', () => {
  for (const size of ['sm', 'md', 'lg'] as const) {
    it(`${size}: a floor, never a fixed height, and its label centred when it wraps`, () => {
      render(
        <Button href="/signup" size={size}>
          Start selling tickets {size}
        </Button>,
      )
      const cls = screen.getByRole('link', { name: `Start selling tickets ${size}` }).className.split(/\s+/)
      expect(cls).toContain(size === 'lg' ? 'min-h-12' : 'min-h-11')
      expect(cls).not.toContain('h-11')
      expect(cls).not.toContain('h-12')
      expect(cls).toContain('text-center')
      expect(cls.some((c) => /^py-/.test(c))).toBe(true)
    })
  }
})
