'use client'

import { useMemo, useState } from 'react'
import { TicketSelector } from '@/components/checkout/ticket-selector'
import { AccessCodeInput } from '@/components/features/events/access-code-input'
import { SocialProofBadge } from '@/components/inventory/social-proof-badge'
import type { TicketTier, EventAddon } from '@/types/database'
import type { TierInventory } from '@/lib/redis/inventory-cache'

// Why a client wrapper: the page used to call `getUnlockedTierIds()` on the
// server (cookie read), which disqualified `/events/[slug]` from static
// generation. With ISR enabled, server render must be cookies-free, so the
// access-code unlock state lives client-side here. AccessCodeInput's
// `onUnlocked` callback updates local state; revealed tiers re-render
// without a router refresh hitting the static HTML.

export type EnrichedTier = TicketTier & {
  display_price_cents: number
  sale_pending: boolean
}

interface Props {
  eventId: string
  eventCreatedAt: string
  allTiers: EnrichedTier[]
  addons: EventAddon[]
  isTicketingSuspended: boolean
  defaultCurrency: string
  waitlistEnabled: boolean
  squadBookingEnabled: boolean
  tierInventory: Record<string, TierInventory | null>
}

function isTierVisible(tier: EnrichedTier, now: Date, unlockedIds: string[]): boolean {
  if (!tier.is_visible || !tier.is_active) return false
  if (tier.sale_end && new Date(tier.sale_end) <= now) return false
  if (tier.hidden_until && new Date(tier.hidden_until) > now) return false
  if (tier.requires_access_code && !unlockedIds.includes(tier.id)) return false
  return true
}

function hasLocked(tiers: EnrichedTier[], now: Date, unlockedIds: string[]): boolean {
  return tiers.some(t => {
    if (!t.is_active) return false
    if (t.requires_access_code && !unlockedIds.includes(t.id)) return true
    if (t.hidden_until) {
      const reveal = new Date(t.hidden_until)
      if (reveal > now && reveal.getTime() - now.getTime() < 24 * 60 * 60 * 1000) return true
    }
    return false
  })
}

export function TicketPanelClient(props: Props) {
  const [unlockedIds, setUnlockedIds] = useState<string[]>([])

  const { visibleTiers, showAccessCodeInput } = useMemo(() => {
    const now = new Date()
    return {
      visibleTiers: props.allTiers.filter(t => isTierVisible(t, now, unlockedIds)),
      showAccessCodeInput: hasLocked(props.allTiers, now, unlockedIds),
    }
  }, [props.allTiers, unlockedIds])

  return (
    <>
      {visibleTiers.length > 0 && (
        <div className="mb-3 space-y-1.5">
          {visibleTiers.map(tier => {
            const inv = props.tierInventory[tier.id]
            if (!inv) return null
            return (
              <div key={tier.id} className="flex items-center justify-between text-xs text-ink-400">
                <span className="truncate">{tier.name}</span>
                <SocialProofBadge inventory={inv} createdAt={props.eventCreatedAt} compact />
              </div>
            )
          })}
        </div>
      )}

      <TicketSelector
        eventId={props.eventId}
        tiers={visibleTiers}
        addons={props.addons.filter(a => a.is_active)}
        isTicketingSuspended={props.isTicketingSuspended}
        currency={visibleTiers[0]?.currency ?? props.defaultCurrency}
        waitlistEnabled={props.waitlistEnabled}
        squadBookingEnabled={props.squadBookingEnabled}
      />

      {showAccessCodeInput && (
        <AccessCodeInput
          eventId={props.eventId}
          onUnlocked={ids =>
            setUnlockedIds(prev => Array.from(new Set([...prev, ...ids])))
          }
        />
      )}
    </>
  )
}
