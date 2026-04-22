import type { TierInventory, EventInventory } from '@/lib/redis/inventory-cache'

type InventoryData = TierInventory | EventInventory

interface Props {
  inventory: InventoryData
  createdAt: string
  compact?: boolean
}

type BadgeVariant = 'sold_out' | 'only_x_left' | 'almost_sold_out' | 'selling_fast' | 'just_listed' | null

function getBadge(inventory: InventoryData, createdAt: string): BadgeVariant {
  const isTierInventory = 'sold' in inventory
  const sold = isTierInventory ? inventory.sold : inventory.total_sold
  const reserved = isTierInventory ? inventory.reserved : inventory.total_reserved
  const total = isTierInventory ? inventory.total : inventory.total_capacity
  const available = inventory.available
  const percentSold = inventory.percent_sold

  // Sold out: all sold or reserved
  if (sold + reserved >= total && total > 0) return 'sold_out'
  // Only X left: ≤10 available
  if (available <= 10 && available > 0) return 'only_x_left'
  // Almost sold out: ≥85% sold
  if (percentSold >= 85) return 'almost_sold_out'
  // Selling fast: ≥50% sold
  if (percentSold >= 50) return 'selling_fast'
  // Just listed: created within last 48 hours
  const ageHours = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60)
  if (ageHours < 48) return 'just_listed'

  return null
}

const BADGE_CONFIG = {
  sold_out: {
    label: 'Sold Out',
    className: 'bg-ink-100 text-ink-400',
    dot: 'bg-ink-400',
  },
  only_x_left: {
    label: null, // dynamic
    className: 'bg-gold-100 text-gold-700',
    dot: 'bg-gold-500',
  },
  almost_sold_out: {
    label: 'Almost Sold Out',
    className: 'bg-gold-100 text-gold-700',
    dot: 'bg-gold-500',
  },
  selling_fast: {
    label: 'Selling Fast',
    className: 'bg-coral-100 text-coral-600',
    dot: 'bg-coral-500',
  },
  just_listed: {
    label: 'Just Listed',
    className: 'bg-ink-100 text-ink-600',
    dot: 'bg-ink-400',
  },
}

export function SocialProofBadge({ inventory, createdAt, compact = false }: Props) {
  const badge = getBadge(inventory, createdAt)
  if (!badge) return null

  const config = BADGE_CONFIG[badge]

  let label = config.label
  if (badge === 'only_x_left') {
    label = `Only ${inventory.available} left`
  }

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${config.className}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
        {label}
      </span>
    )
  }

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${config.className}`}>
      <span className={`h-2 w-2 rounded-full ${config.dot}`} />
      {label}
    </span>
  )
}
