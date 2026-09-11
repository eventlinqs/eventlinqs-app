import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RecoveryProofPanel } from '@/components/dashboard/recovery-proof-panel'
import type { RecoveryProof } from '@/lib/fillrate/proof'

/**
 * "SALES WE WON BACK" IS THE PRODUCT, so it must not overclaim by a word.
 * Close-out D2: "This panel is the product. It is what a future standalone
 * Fillrate customer pays for."
 *
 * Two failure modes are worth a test each, and the platform has already been
 * caught by the first one once: on 10 September 2026 the sales pace panel showed
 * three zeros beside 28 real sales, because nothing recorded was rendered as
 * nothing happened. A slot where nobody has abandoned a checkout has not
 * recovered nothing; there was nothing there to recover, and an organiser reads
 * those two completely differently.
 *
 * The second is the rate. It is post hoc with no holdout, so it counts somebody
 * who was going to buy anyway. Printing it as a bare percentage would claim an
 * experiment nobody ran, so the word raw appears wherever the number does.
 */
const proof = (over: Partial<RecoveryProof> = {}): RecoveryProof => ({
  abandoned: 0,
  emailed: 0,
  peopleEmailed: 0,
  returned: 0,
  recoveredCents: 0,
  offered: 0,
  claimed: 0,
  lapsed: 0,
  holdoutDue: false,
  cumulativeAbandonments: 0,
  ...over,
})

describe('a slot where nothing has happened yet', () => {
  it('says there has been nothing to win back, never that it recovered nothing', () => {
    render(<RecoveryProofPanel proof={proof()} />)
    expect(screen.getByText(/nothing to win back/i)).toBeTruthy()
    expect(screen.queryByText('$0')).toBeNull()
  })

  it('says the feature turns itself on rather than leaving an organiser to wonder', () => {
    render(<RecoveryProofPanel proof={proof()} />)
    expect(screen.getByText(/turns on by itself/i)).toBeTruthy()
  })
})

describe('a slot with real numbers on it', () => {
  const real = proof({
    abandoned: 12,
    emailed: 18,
    peopleEmailed: 10,
    returned: 3,
    recoveredCents: 5400,
    cumulativeAbandonments: 12,
  })

  it('leads with the money, because that is the number an organiser has an opinion about', () => {
    render(<RecoveryProofPanel proof={real} />)
    expect(screen.getByText('$54')).toBeTruthy()
  })

  it('counts people written to, not messages sent, under the rate', () => {
    render(<RecoveryProofPanel proof={real} />)
    expect(screen.getByText('10')).toBeTruthy()
    expect(screen.getByText('30%')).toBeTruthy()
  })

  it('calls the rate raw, in the same place it prints it', () => {
    render(<RecoveryProofPanel proof={real} />)
    expect(screen.getByText(/raw recovery rate/i)).toBeTruthy()
    expect(screen.getByText(/not a controlled one/i)).toBeTruthy()
  })

  it('says when the holdout starts, so the raw rate is not the permanent answer', () => {
    render(<RecoveryProofPanel proof={real} />)
    expect(screen.getByText(/300 abandoned checkouts/i)).toBeTruthy()
  })

  it('changes what it says once there is enough history for a holdout to mean something', () => {
    render(<RecoveryProofPanel proof={proof({ ...real, holdoutDue: true, cumulativeAbandonments: 412 })} />)
    expect(screen.getByText(/hold a group back and measure the difference properly/i)).toBeTruthy()
  })

  it('reads one person as a person, not as people', () => {
    render(<RecoveryProofPanel proof={proof({ ...real, returned: 1 })} />)
    expect(screen.getByText(/1 person who/i)).toBeTruthy()
  })

  it('shows no rate at all rather than dividing by nobody', () => {
    render(<RecoveryProofPanel proof={proof({ abandoned: 4, peopleEmailed: 0, emailed: 0, offered: 1 })} />)
    expect(screen.getByText('n/a')).toBeTruthy()
  })
})

describe('the waiting list half', () => {
  it('stays off the panel entirely when nothing was ever offered', () => {
    render(<RecoveryProofPanel proof={proof({ abandoned: 3, emailed: 3, peopleEmailed: 3 })} />)
    expect(screen.queryByText(/from the waiting list/i)).toBeNull()
  })

  it('tells a claimed offer apart from one that passed to the next person', () => {
    render(<RecoveryProofPanel proof={proof({ abandoned: 3, offered: 5, claimed: 2, lapsed: 3 })} />)
    expect(screen.getByText(/from the waiting list/i)).toBeTruthy()
    expect(screen.getByText(/claimed it/i)).toBeTruthy()
    expect(screen.getByText(/passed to the next person/i)).toBeTruthy()
  })
})
