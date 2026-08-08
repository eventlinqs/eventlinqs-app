'use client'

import { useEffect, useState } from 'react'

/**
 * True once this component has hydrated on the client.
 *
 * WHY THIS EXISTS. Every auth form is `<form onSubmit={handler}>` with
 * `e.preventDefault()` inside the handler and NO `action` attribute. That is
 * correct once React is live, and dangerous before it: the markup is painted
 * and the inputs are usable while the JavaScript is still arriving, and a
 * submit in that window is a NATIVE submit. A native submit with no action is
 * a GET to the current URL with every field in the query string.
 *
 * Observed on the deployed preview, from a real submit on /login:
 *
 *   /login?email=broadcast.gate.organiser%40eventlinqs.com&password=ArtistGate2026%21Drive
 *
 * The password is now in the URL: browser history, any URL logging, and the
 * Referer header on the next request. The person also sees their form cleared
 * with no message, because the page navigated and the React error state went
 * with it, which is exactly what "I typed my password and nothing happened"
 * looks like.
 *
 * Gating the submit control on hydration closes the window completely. These
 * forms are entirely client-driven (they call the Supabase browser client), so
 * they never functioned without JavaScript and nothing is lost by refusing to
 * submit before it is ready.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    setHydrated(true)
  }, [])
  return hydrated
}
