'use client'

/**
 * The chosen seat-colour set, shared by every seating surface on the
 * device (buyer map, room studio). Persisted to localStorage and kept in
 * sync across mounted surfaces in the same tab via a custom event, and
 * across tabs via the storage event. Server render always starts on
 * 'house' so hydration never mismatches; the stored choice applies on
 * mount.
 */

import { useCallback, useEffect, useState } from 'react'
import type { SeatPaletteSetId } from './palette'
import { SEAT_PALETTE_SETS } from './palette'

const STORAGE_KEY = 'el-seat-palette'
const SYNC_EVENT = 'el-seat-palette-change'

function isSetId(value: unknown): value is SeatPaletteSetId {
  return typeof value === 'string' && value in SEAT_PALETTE_SETS
}

export function useSeatPaletteSet(): [SeatPaletteSetId, (id: SeatPaletteSetId) => void] {
  const [set, setSet] = useState<SeatPaletteSetId>('house')

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (isSetId(stored)) setSet(stored)
    } catch {
      // Storage unavailable (private mode): the session keeps 'house'.
    }
    function onSync(e: Event) {
      const detail = (e as CustomEvent).detail
      if (isSetId(detail)) setSet(detail)
    }
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY && isSetId(e.newValue)) setSet(e.newValue)
    }
    window.addEventListener(SYNC_EVENT, onSync)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(SYNC_EVENT, onSync)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  const update = useCallback((id: SeatPaletteSetId) => {
    setSet(id)
    try {
      window.localStorage.setItem(STORAGE_KEY, id)
    } catch {
      // Storage unavailable: the choice still applies for this mount.
    }
    window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: id }))
  }, [])

  return [set, update]
}
