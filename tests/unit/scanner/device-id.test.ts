import { describe, expect, test } from 'vitest'
import { getDeviceId, shortDevice, DOOR_DEVICE_KEY } from '@/lib/scanner/device-id'

function fakeStorage(seed: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(seed))
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size
    },
  }
}

describe('getDeviceId', () => {
  test('mints a uuid once and returns the same one after', () => {
    const storage = fakeStorage()
    const first = getDeviceId(storage)
    expect(first).toMatch(/^[0-9a-f-]{36}$/)
    expect(getDeviceId(storage)).toBe(first)
    expect(storage.getItem(DOOR_DEVICE_KEY)).toBe(first)
  })
  test('replaces a value too short to identify anything', () => {
    const storage = fakeStorage({ [DOOR_DEVICE_KEY]: 'abc' })
    expect(getDeviceId(storage)).not.toBe('abc')
  })
  test('without storage, the session id is stable for the process', () => {
    expect(getDeviceId(null)).toBe(getDeviceId(null))
  })
})

describe('shortDevice', () => {
  test('is the first four characters, said out loud', () => {
    expect(shortDevice('3f2a9c11-0000-4000-8000-000000000000')).toBe('Door 3F2A')
    expect(shortDevice(null)).toBe('an unknown door')
    expect(shortDevice('')).toBe('an unknown door')
  })
})
