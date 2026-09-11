import type { RecoveryProof } from '@/lib/fillrate/proof'

/**
 * WHAT WE WON BACK FOR YOU. Close-out D2: "This panel is the product. It is what
 * a future standalone Fillrate customer pays for."
 *
 * THE DESIGN DECISIONS, and each one is here because the alternative lies.
 *
 *   NO CHART. Four numbers are four numbers. A chart of four numbers is
 *   decoration that takes longer to read than the numbers.
 *
 *   THE MONEY IS THE LARGEST THING ON IT, because it is the only number on this
 *   panel an organiser has an opinion about. The counts explain it; they do not
 *   compete with it.
 *
 *   THE RATE IS CALLED RAW, out loud, wherever it appears. It is a post hoc
 *   attribution with no holdout, and a panel that printed "18% recovered" beside
 *   a number that has never been compared against a control group would be
 *   claiming an experiment nobody ran. The line under it says when that changes.
 *
 *   NOTHING RECORDED IS SAID AS ITSELF. A slot where nobody has abandoned yet
 *   has not "recovered $0", it has had nothing to recover, and the two read
 *   completely differently to somebody deciding whether this platform works.
 *
 *   NO JAVASCRIPT AND NO NEW COLOUR, for the same reasons the sales pace panel
 *   carries none: the Lighthouse mobile gate blocks on this page, and navy on
 *   canvas with gold-800 for the one accent is the platform's whole palette.
 */

type Props = {
  proof: RecoveryProof
  currency?: string
}

const money = (cents: number, currency = 'AUD') =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency, maximumFractionDigits: 0 }).format(cents / 100)

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0">
      <p className="text-2xl font-bold leading-none text-ink-900">{value}</p>
      <p className="mt-1 text-xs leading-snug text-ink-600">{label}</p>
    </div>
  )
}

export function RecoveryProofPanel({ proof, currency = 'AUD' }: Props) {
  const nothingHasHappenedYet = proof.abandoned === 0 && proof.emailed === 0 && proof.offered === 0

  return (
    <section
      className="rounded-xl border border-ink-100 bg-white"
      aria-labelledby="recovery-proof-heading"
      data-recovery-proof
    >
      <header className="border-b border-ink-100 px-5 py-4">
        <h2 id="recovery-proof-heading" className="text-base font-semibold text-ink-900">
          Sales we won back
        </h2>
        <p className="mt-1 text-xs leading-snug text-ink-600">
          Most people who start a checkout do not finish. When somebody leaves their email and then
          leaves, we write to them, and this is what came back.
        </p>
      </header>

      {nothingHasHappenedYet ? (
        <div className="px-5 py-6">
          <p className="text-sm leading-6 text-ink-800">
            Nobody has left a checkout part way through on this event yet, so there has been nothing to
            win back. This turns on by itself the first time somebody does.
          </p>
        </div>
      ) : (
        <>
          <div className="border-b border-ink-100 px-5 py-5">
            <p className="text-3xl font-bold leading-none text-gold-800" data-recovery-total>
              {money(proof.recoveredCents, currency)}
            </p>
            <p className="mt-1.5 text-xs leading-snug text-ink-600">
              recovered from {proof.returned} {proof.returned === 1 ? 'person who' : 'people who'} came
              back and bought after we wrote to them
            </p>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-5 px-5 py-5 sm:grid-cols-4">
            <Figure value={String(proof.abandoned)} label="left a checkout part way" />
            <Figure value={String(proof.peopleEmailed)} label="written to" />
            <Figure value={String(proof.returned)} label="came back and bought" />
            <Figure
              value={
                proof.peopleEmailed === 0
                  ? 'n/a'
                  : `${Math.round((proof.returned / proof.peopleEmailed) * 100)}%`
              }
              label="raw recovery rate"
            />
          </div>

          {proof.offered > 0 && (
            <div className="border-t border-ink-100 px-5 py-5">
              <p className="text-sm font-semibold text-ink-900">From the waiting list</p>
              <div className="mt-3 grid grid-cols-3 gap-x-4">
                <Figure value={String(proof.offered)} label="offered a freed place" />
                <Figure value={String(proof.claimed)} label="claimed it" />
                <Figure value={String(proof.lapsed)} label="passed to the next person" />
              </div>
            </div>
          )}

          <footer className="border-t border-ink-100 px-5 py-4">
            <p className="text-xs leading-relaxed text-ink-600">
              {proof.holdoutDue
                ? 'This is a raw rate. There are now enough abandoned checkouts across the platform to hold a group back and measure the difference properly, so that comparison starts from here.'
                : 'This is a raw rate, not a controlled one: it counts anybody who bought after we wrote to them, including people who would have come back anyway. Once the platform has seen 300 abandoned checkouts we hold a small group back and measure the real difference.'}
            </p>
          </footer>
        </>
      )}
    </section>
  )
}
