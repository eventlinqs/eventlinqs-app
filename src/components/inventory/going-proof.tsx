import { resolveGoingCount, formatGoingLabel } from '@/lib/events/going'

interface Props {
  /** Genuine confirmed (paid) ticket sales for the event. */
  totalSold: number
}

/**
 * Honest "N people going" social proof, derived ONLY from real confirmed
 * sales (engine 4 of the demand engine). Renders nothing below the floor,
 * so an event never advertises a weak count. Pure presentational text: it
 * inherits the existing hero badge pill shape, gold dot, and tokens, so it
 * reads as native chrome next to the SocialProofBadge. Inline text, never a
 * tile, so it is exempt from the dead-end-tile law.
 */
export function GoingProof({ totalSold }: Props) {
  const count = resolveGoingCount(totalSold)
  if (count === null) return null

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-100 px-3 py-1 text-sm font-medium text-gold-700">
      <span className="h-2 w-2 rounded-full bg-gold-500" aria-hidden />
      {formatGoingLabel(count)}
    </span>
  )
}
