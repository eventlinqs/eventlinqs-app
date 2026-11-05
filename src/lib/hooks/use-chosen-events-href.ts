'use client'

import { useEffect, useState } from 'react'
import { EL_CITY_UPDATED, chosenCitySlug, eventsHrefFor, readChosenCityCookie } from '@/lib/events/chosen-city'

/**
 * Where 'Browse Events' opens for this visitor: their chosen city's events, else every event (the CONTROLLER's 08:50
 * (7)). '/events' on the server and on the first paint, so the shared chrome hydrates identically; the chosen city after
 * mount, and again whenever el_city changes.
 */
export function useChosenEventsHref(): string {
  const [href, setHref] = useState('/events')
  useEffect(() => {
    const read = () => setHref(eventsHrefFor(chosenCitySlug(readChosenCityCookie())))
    read()
    window.addEventListener(EL_CITY_UPDATED, read)
    return () => window.removeEventListener(EL_CITY_UPDATED, read)
  }, [])
  return href
}
