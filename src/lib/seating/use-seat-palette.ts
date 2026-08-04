'use client'

/**
 * The chosen seat-colour set, shared by every seating surface on the
 * device (buyer map, room studio). Persisted to localStorage, synced
 * across mounted surfaces in the same tab via a custom event and across
 * tabs via the storage event, all through one external store so the
 * server render always starts on 'house' and hydration never mismatches.
 */

import { useCallback, useSyncExternalStore } from 'react'
import type { SeatPaletteSetId } from './palette'
import { SEAT_PALETTE_SETS } from './palette'

const STORAGE_KEY = 'el-seat-palette'
const SYNC_EVENT = 'el-seat-palette-change'

/** In-memory fallback when storage is unavailable (private mode). */
let memoryValue: SeatPaletteSetId | null = null

function isSetId(value: unknown): value is SeatPaletteSetId {
  return typeof value === 'string' && value in SEAT_PALETTE_SETS
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(SYNC_EVENT, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(SYNC_EVENT, onChange)
    window.removeEventListener('storage', onChange)
  }
}

function getSnapshot(): SeatPaletteSetId {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (isSetId(stored)) return stored
  } catch {
    // Storage unavailable: fall through to the in-memory choice.
  }
  return memoryValue ?? 'house'
}

function getServerSnapshot(): SeatPaletteSetId {
  return 'house'
}

export function useSeatPaletteSet(): [SeatPaletteSetId, (id: SeatPaletteSetId) => void] {
  const set = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const update = useCallback((id: SeatPaletteSetId) => {
    memoryValue = id
    try {
      window.localStorage.setItem(STORAGE_KEY, id)
    } catch {
      // Storage unavailable: the in-memory value still drives this tab.
    }
    window.dispatchEvent(new CustomEvent(SYNC_EVENT))
  }, [])

  return [set, update]
}
