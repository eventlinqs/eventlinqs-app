'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { FOLLOWED_THIS_SESSION, chosenCitySlug, eventsHrefFor, followsChosenCity, readChosenCityCookie } from '@/lib/events/chosen-city'

/**
 * A BARE /events FOLLOWS THE CITY THE VISITOR CHOSE (the CONTROLLER's 08:50 (7)), in the browser, so the page stays edge
 * cached and reads no cookie on the server. Once a session: a visitor who then clears the city is never sent back to it.
 * Where the browser keeps no session storage, nothing is followed rather than risk sending them round again.
 */
export function FollowChosenCity() {
  const router = useRouter()
  useEffect(() => {
    try {
      if (!followsChosenCity(window.location.search)) return
      if (window.sessionStorage.getItem(FOLLOWED_THIS_SESSION)) return
      const slug = chosenCitySlug(readChosenCityCookie())
      if (!slug) return
      window.sessionStorage.setItem(FOLLOWED_THIS_SESSION, '1')
      router.replace(eventsHrefFor(slug))
    } catch {
      // no session storage: stay on every event
    }
  }, [router])
  return null
}
