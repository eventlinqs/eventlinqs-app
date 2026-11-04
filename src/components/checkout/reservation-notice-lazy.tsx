'use client'

/**
 * THE RESERVATION NOTICE, LOADED ONLY WHEN IT IS RENDERED (car 41c; why and how in
 * src/components/features/events/event-media-lazy.tsx). It answers a checkout that could not finish, which is nearly
 * never (the page's own comment: 'with no notice, which is nearly always'), so its code leaves the event page's first
 * load; the page still renders it inside its Suspense boundary exactly as before.
 */
import dynamic from 'next/dynamic'
import type { ComponentProps } from 'react'
import type { ReservationNotice as Notice } from './reservation-notice'

const ReservationNotice = dynamic(() => import('./reservation-notice').then((m) => m.ReservationNotice))

export function ReservationNoticeLazy(props: ComponentProps<typeof Notice>) {
  return <ReservationNotice {...props} />
}
