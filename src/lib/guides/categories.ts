import type { GuideCategory } from './types'

/**
 * The guide taxonomy: the organiser's own timeline, in the order the work
 * actually happens. Set it up, seat the room, sell it, get paid, run the door.
 * Categories are stable slugs so a guide can move between them without the
 * hub route changing.
 */
export const GUIDE_CATEGORIES: GuideCategory[] = [
  {
    id: 'set-up',
    title: 'Set up your event',
    blurb: 'From an empty dashboard to a page that is ready to publish.',
  },
  {
    id: 'seating',
    title: 'Seating and rooms',
    blurb: 'Draw the room once, then sell every seat in it with confidence.',
  },
  {
    id: 'promote',
    title: 'Promote and sell',
    blurb: 'Share the event, then watch which channels actually bring people.',
  },
  {
    id: 'money',
    title: 'Money and payouts',
    blurb: 'What you are charged, when you are paid, and how to fix an order.',
  },
  {
    id: 'event-day',
    title: 'Event day',
    blurb: 'Running the door so the queue keeps moving.',
  },
]

export function getGuideCategory(id: string): GuideCategory | null {
  return GUIDE_CATEGORIES.find(c => c.id === id) ?? null
}
