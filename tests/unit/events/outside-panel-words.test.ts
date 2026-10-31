import { describe, expect, it } from 'vitest'
import { outsidePanelWords } from '@/lib/events/outside-panel-words'

/*
 * THE OUTSIDE NIGHT's PANEL SAYS WHAT THE NIGHT IS (the CONTROLLER's 17:55 (6), event detail pages on live; looked at
 * 31 October 2026 at 390). The Bendigo food system workshop is free, with registration on bendigo.vic.gov.au; its hero
 * said so ('Register free on bendigo.vic.gov.au'), and its panel then said 'Tickets are sold elsewhere. This organiser
 * sells tickets for this event on bendigo.vic.gov.au.' Nothing is sold. Invent nothing: the panel says registration
 * where the night is a free registration, and tickets where tickets are sold.
 */
describe("the outside night's panel", () => {
  it('a free registration says registration, free, and where; never that tickets are sold', () => {
    const w = outsidePanelWords({ registration: true, bookingInHero: true, host: 'bendigo.vic.gov.au' })
    expect(w.heading).toBe('Registration is on another site')
    expect(w.body).toBe('Registration is free, on bendigo.vic.gov.au.')
    expect(`${w.heading} ${w.body}`).not.toMatch(/tickets|sells|sold/i)
  })

  it('a paid night sold elsewhere keeps its words', () => {
    const w = outsidePanelWords({ registration: false, bookingInHero: true, host: 'geelongartscentre.org.au' })
    expect(w.heading).toBe('Tickets are sold elsewhere')
    expect(w.body).toBe('This organiser sells tickets for this event on geelongartscentre.org.au.')
  })

  it('with the button below rather than in the hero, the body points to it', () => {
    expect(outsidePanelWords({ registration: true, bookingInHero: false, host: null }).body).toBe("Registration is free, on the organiser's site. The button below takes you there.")
    expect(outsidePanelWords({ registration: false, bookingInHero: false, host: null }).body).toBe(
      'This organiser sells tickets for this event on another site. The button below takes you straight there.',
    )
  })
})
