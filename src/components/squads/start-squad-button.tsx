'use client'

import { useState } from 'react'
import { StartSquadModal } from './start-squad-modal'

interface StartSquadButtonProps {
  eventId: string
  tierId: string
  tierName: string
  totalSpots: number
  pricePerSpotCents: number
  currency: string
}

export function StartSquadButton({
  eventId,
  tierId,
  tierName,
  totalSpots,
  pricePerSpotCents,
  currency,
}: StartSquadButtonProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="
          w-full h-12 rounded-xl border-2 border-[#4A90D9] text-[#4A90D9]
          font-semibold text-sm flex items-center justify-center gap-2
          hover:bg-[#4A90D9] hover:text-white transition-colors
          focus-visible:outline-2 focus-visible:outline-[#4A90D9] focus-visible:outline-offset-2
        "
        aria-label={`Start a squad — ${totalSpots} spots`}
      >
        <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
        Start a Squad
      </button>

      <StartSquadModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        eventId={eventId}
        tierId={tierId}
        tierName={tierName}
        totalSpots={totalSpots}
        pricePerSpotCents={pricePerSpotCents}
        currency={currency}
      />
    </>
  )
}
