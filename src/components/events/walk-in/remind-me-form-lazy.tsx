'use client'

/**
 * REMIND ME, LOADED ONLY WHEN IT IS DRAWN (car 41c; why and how in src/components/features/events/event-media-lazy.tsx).
 * The form shows only on a walk in night and only while walk_in_remind_me is on, which production holds OFF until Lawal
 * approves the privacy version that names it, yet its code rode in every event page's first load through the walk in
 * panel and bottom bar. Imported from those Client Components, so the split is real.
 */
import dynamic from 'next/dynamic'
import type { ComponentProps } from 'react'
import type { RemindMeForm as Form } from './remind-me-form'

const RemindMeForm = dynamic(() => import('./remind-me-form').then((m) => m.RemindMeForm))

export function RemindMeFormLazy(props: ComponentProps<typeof Form>) {
  return <RemindMeForm {...props} />
}
