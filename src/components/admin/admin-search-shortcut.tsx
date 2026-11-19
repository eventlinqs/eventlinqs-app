'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ADMIN_SEARCH_INPUT_ID } from './admin-search-id'

/**
 * FIND ANYTHING FROM EVERY ADMIN PAGE (the CRM standard of 19 November 2026, section 2 item 6: 'one search across
 * organisers, contacts, events, messages and orders, from every admin page (Ctrl K)'; the PM's 22:14 item 2). Ctrl K, or
 * Cmd K on a Mac, focuses the top bar's search where it shows and opens /admin/search where it does not (the phone
 * width hides the top bar's box). A key pressed inside a text field that is not the search itself is left alone, so a
 * shortcut never eats typing. Renders nothing.
 */
/** Whether this key press asks for the search: Ctrl K or Cmd K, with no other modifier. Pure. */
export function asksForSearch(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>): boolean {
  return (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k'
}

export function AdminSearchShortcut() {
  const router = useRouter()
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!asksForSearch(e)) return
      e.preventDefault()
      const input = document.getElementById(ADMIN_SEARCH_INPUT_ID)
      if (input instanceof HTMLInputElement && input.offsetParent !== null) {
        input.focus()
        input.select()
        return
      }
      router.push('/admin/search')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [router])
  return null
}
