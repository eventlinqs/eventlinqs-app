/**
 * WHICH PHONE IS THIS DOOR. A random id minted once per browser and kept in
 * localStorage, sent with every offline scan so the organiser's review list can
 * say "Door 3F2A admitted it first, Door 9C11 admitted it again". It is not a
 * credential and identifies nothing about the person holding the phone.
 */
export const DOOR_DEVICE_KEY = 'eventlinqs-door-device'

let sessionFallback: string | null = null

export function getDeviceId(storage: Storage | null = readStorage()): string {
  if (storage) {
    const existing = storage.getItem(DOOR_DEVICE_KEY)
    if (existing && existing.length >= 8) return existing
    const minted = crypto.randomUUID()
    storage.setItem(DOOR_DEVICE_KEY, minted)
    return minted
  }
  if (!sessionFallback) sessionFallback = crypto.randomUUID()
  return sessionFallback
}

function readStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch (error) {
    // Private mode on some browsers throws on touching localStorage. The door
    // still works for the session; the id just does not survive a close.
    console.warn('[door] localStorage unavailable, using a session device id', error instanceof Error ? error.message : error)
    return null
  }
}

/** "Door 3F2A": the first four characters, the way staff will say it out loud. */
export function shortDevice(id: string | null | undefined): string {
  const head = (id ?? '').replace(/-/g, '').slice(0, 4).toUpperCase()
  return head ? `Door ${head}` : 'an unknown door'
}
