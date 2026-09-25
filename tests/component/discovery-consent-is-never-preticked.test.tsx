/**
 * AQ1 ACCEPTANCE 1 AND THE RENDERED HALF OF ACCEPTANCE 2.
 *
 *   "a test proving the checkbox is unticked by default"
 *   "a test proving the exact wording shown is the wording stored"
 *
 * Both are asserted by RENDERING the surfaces and reading the DOM a buyer gets,
 * rather than by grepping the source for `useState(false)`. The difference
 * matters: a controlled input whose initial state is false still renders ticked
 * if something sets `defaultChecked`, and a source assertion would pass while
 * the buyer saw a ticked box.
 *
 * The stored half of acceptance 2 is asserted in
 * tests/unit/growth/consent-to-discover.test.ts, against the recorder. Together
 * they close the loop: what is on screen comes from the wording record, and
 * what is written comes from the same record.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/events/lane-b-aq1',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/app/actions/checkout', () => ({ createReservation: vi.fn() }))
vi.mock('@/app/actions/discovery-consent', () => ({ carryDiscoveryConsent: vi.fn() }))

import { MarketingConsent } from '@/components/checkout/marketing-consent'
import { TicketPageDiscoveryConsent } from '@/components/checkout/ticket-page-discovery-consent'
import { DISCOVERY_CONSENT_ATTRIBUTE } from '@/components/checkout/discovery-consent-attribute'

/**
 * A wording record as the database hands it over. Deliberately NOT the sentence
 * the platform ships: if a component ever printed its own copy instead of the
 * record, these strings would not appear and the test would fail.
 */
const WORDING = {
  label: 'Hear about other events like this one',
  body:
    'EventLinqs will email you about events run by other organisers who sell tickets on EventLinqs. ' +
    'You can stop it at any time from any message.',
  version: 'lane-b-aq1-v9',
}

afterEach(cleanup)

describe('AQ1: the discovery question is never pre ticked, at the payment step', () => {
  function mountCheckoutPanel() {
    return render(
      <MarketingConsent
        organiserName="Lane B Test Organiser"
        organiserConsent={false}
        platformConsent={false}
        onOrganiserChange={() => {}}
        onPlatformChange={() => {}}
        platformWording={WORDING}
      />,
    )
  }

  it('renders the discovery box unchecked', () => {
    mountCheckoutPanel()
    const box = document.querySelector<HTMLInputElement>('#platform-marketing-consent')
    expect(box, 'the discovery box is rendered').not.toBeNull()
    expect(box!.checked).toBe(false)
  })

  it('carries no checked or defaultChecked attribute in the markup at all', () => {
    mountCheckoutPanel()
    const box = document.querySelector<HTMLInputElement>('#platform-marketing-consent')!
    expect(box.hasAttribute('checked')).toBe(false)
    expect(box.getAttribute('defaultchecked')).toBeNull()
  })

  it('renders the organiser box unchecked too, which is a different consent', () => {
    mountCheckoutPanel()
    const box = document.querySelector<HTMLInputElement>('#organiser-marketing-consent')!
    expect(box.checked).toBe(false)
  })

  it('is not bundled with anything: each box is its own label and its own input', () => {
    mountCheckoutPanel()
    const boxes = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))
    expect(boxes).toHaveLength(2)
    for (const box of boxes) {
      const label = box.closest('label')
      expect(label, 'every box sits in its own label').not.toBeNull()
      expect(label!.querySelectorAll('input[type="checkbox"]')).toHaveLength(1)
    }
  })

  it('shows the words the record supplied, verbatim, and prints none of its own', () => {
    mountCheckoutPanel()
    expect(screen.getByText(WORDING.label)).toBeTruthy()
    const body = document.querySelector(`[data-consent-wording-version="${WORDING.version}"]`)
    expect(body, 'the body is rendered and stamped with its version').not.toBeNull()
    expect(body!.textContent).toBe(WORDING.body)
  })

  it('says the purchase does not depend on it, before it asks anything', () => {
    mountCheckoutPanel()
    expect(screen.getByText('Optional. Your tickets and receipt arrive either way.')).toBeTruthy()
  })
})

describe('AQ1: the discovery question is never pre ticked, on the ticket page either', () => {
  it('renders unchecked, with no checked attribute and no state to set one', () => {
    render(<TicketPageDiscoveryConsent wording={WORDING} />)
    const box = document.querySelector<HTMLInputElement>(`input[${DISCOVERY_CONSENT_ATTRIBUTE}]`)
    expect(box, 'the box carries the attribute the selector finds it by').not.toBeNull()
    expect(box!.checked).toBe(false)
    expect(box!.hasAttribute('checked')).toBe(false)
  })

  it('shows the record’s words and none of its own', () => {
    render(<TicketPageDiscoveryConsent wording={WORDING} />)
    expect(screen.getByText(WORDING.label)).toBeTruthy()
    const body = document.querySelector(`[data-consent-wording-version="${WORDING.version}"]`)
    expect(body!.textContent).toBe(WORDING.body)
  })

  it('offers a touch target a finger can hit, which is the same 44px every other control keeps', () => {
    render(<TicketPageDiscoveryConsent wording={WORDING} />)
    const label = document.querySelector('label')!
    expect(label.className).toContain('min-h-[44px]')
  })

  it('says plainly that it changes neither the tickets nor the total', () => {
    render(<TicketPageDiscoveryConsent wording={WORDING} />)
    expect(screen.getByText('Optional. It does not change your tickets or your total.')).toBeTruthy()
  })
})
