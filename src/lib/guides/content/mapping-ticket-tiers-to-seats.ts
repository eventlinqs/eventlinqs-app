import type { Guide } from '../types'

/**
 * Verified against the running app 2026-07-26:
 * - The chart section carries `tier_name` (src/lib/seating/generate.ts).
 * - Materialisation binds a seat to a tier by CASE-INSENSITIVE NAME MATCH:
 *   supabase/migrations/20260710000001_seat_reassignment_and_live_sync.sql
 *   lines 171-178 (`LOWER(t.name) = LOWER(v_section->>'tier_name')`), and an
 *   unmatched name leaves ticket_tier_id NULL.
 * - The buyer map colours seats BY TICKET TYPE and falls back to the event
 *   default price when a seat has no tier (src/components/checkout/seat-selector.tsx).
 */
export const mappingTicketTiersToSeats: Guide = {
  slug: 'mapping-ticket-tiers-to-seats',
  title: 'Mapping ticket tiers to seats',
  summary:
    'How a section on your chart becomes a price on a seat, why the match is by name, and how to catch the one mistake that quietly sells your best seats cheap.',
  category: 'seating',
  minutes: 6,
  updated: '2026-07-26',
  keywords: [
    'ticket tiers',
    'ticket types',
    'map tiers to seats',
    'seat pricing',
    'sections',
    'premium',
    'general admission',
    'price bands',
    'seat colours',
  ],
  hero: {
    src: '/guides/mapping-ticket-tiers-to-seats-1.png',
    alt: 'The room studio inspector showing a selected rows block with its section name and ticket type field.',
    caption: 'Each block carries a section name and a ticket type. That ticket type is what prices every seat in it.',
    viewport: 1440,
  },
  related: ['building-a-seating-chart', 'creating-your-first-event', 'getting-paid-and-payout-timing'],
  blocks: [
    {
      kind: 'para',
      text: 'A seat has no price of its own. It takes its price from the ticket type its section is mapped to. Get that mapping right and the buyer map colours itself, the price bands work, and every seat sells at what you intended. Get it wrong and the room still sells, just not at your prices.',
    },
    { kind: 'heading', text: 'How the mapping works' },
    {
      kind: 'steps',
      items: [
        {
          title: 'Create the ticket types on the event first',
          text: 'On the event, in the Tickets step, create the types you want to sell: Premium, A Reserve, General, whatever your room calls them. Each has its own price and quantity. Do this before you map, because the chart matches against names that already exist.',
        },
        {
          title: 'Name the section on the chart',
          text: 'Select a block in the room studio. In the inspector, give it a section name. The section name is what the buyer sees on the plan and on their ticket, so use the name the venue and the door actually use.',
        },
        {
          title: 'Set the ticket type on the section',
          text: 'Still in the inspector, set the ticket type for that section. Type it to match your event ticket type exactly. Every seat generated from that block will be bound to that ticket type and will sell at its price.',
        },
        {
          title: 'Apply the chart to the event',
          text: 'From the event Seats page, apply or sync the chart. That is the moment sections become real seats in the database, each carrying its ticket type. Come back to this page any time you change the chart.',
        },
      ],
    },
    {
      kind: 'pitfall',
      title: 'The match is by name, and only by name',
      text: 'A section is joined to a ticket type by matching the text you typed against your event ticket type names, ignoring capitals. "premium" matches "Premium". "Premium " with a trailing space, "Premium Seating", or "Primium" match nothing at all. When nothing matches, the seats are still created and still sell, but with no ticket type attached, which means they fall back to the event default price. This is the single most expensive mistake on the whole surface: your front rows quietly go out at the base price and nothing looks broken. Copy the ticket type name from the event rather than typing it from memory.',
    },
    {
      kind: 'shot',
      shot: {
        src: '/guides/mapping-ticket-tiers-to-seats-2.png',
        alt: 'The event Seats page listing the seats generated from the applied chart with their sections.',
        caption: 'The event Seats page. Apply the chart here, then check the sections and counts before you sell.',
        viewport: 1440,
      },
    },
    { kind: 'heading', text: 'Check the mapping before you sell a single seat' },
    {
      kind: 'para',
      text: 'Open your own event page and look at the buyer map as a buyer. Seats are coloured by ticket type, and the rail beside the plan lists every ticket type on the chart with its price and how many are open. That list is your proof. If a ticket type you expected is missing from the rail, no seat is bound to it. If the open counts do not add up to your room, some seats are unmapped.',
    },
    {
      kind: 'list',
      items: [
        'Every ticket type you priced appears in the rail beside the plan.',
        'The open counts across the ticket types add up to the seats you drew.',
        'Tapping a seat in your premium section shows the premium price, not the base price.',
        'Selecting a ticket type in the rail dims everything else, so you can see that section is the shape you expect.',
      ],
    },
    {
      kind: 'note',
      title: 'Group ticket types',
      text: 'If a ticket type has a minimum of more than one per order, the buyer map treats it as a group: choosing one seat takes the whole block of adjacent seats together, and removing any one of them releases the group. Use it for a table of four or a family pass. The chart does not need any special setup; the ticket type carries the rule.',
    },
    {
      kind: 'note',
      title: 'Standing areas are different on purpose',
      text: 'A standing area sells through its ticket type capacity, not as individual seats. It appears on the plan so buyers understand the room, but nobody picks a spot in it. If you want people choosing a place, it needs to be seats.',
    },
    {
      kind: 'para',
      text: 'Once the mapping is right, it stays right. Re-applying the chart later updates free seats and leaves sold ones alone, so you can keep refining the room while it sells.',
    },
  ],
}
