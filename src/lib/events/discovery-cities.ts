/**
 * The cities the discovery switcher offers (the brief of 1 November 2026, point 6): Victoria as the overview, then
 * Geelong and Melbourne first (plan v4), then Ballarat and Bendigo. A plain module, so the server page and the client
 * component read the same array (a value exported from a 'use client' file reaches the server as a reference only).
 */
export const DISCOVERY_CITIES = [
  { key: 'victoria', label: 'Victoria' },
  { key: 'geelong', label: 'Geelong' },
  { key: 'melbourne', label: 'Melbourne' },
  { key: 'ballarat', label: 'Ballarat' },
  { key: 'bendigo', label: 'Bendigo' },
] as const

export type DiscoveryVariant = 'a' | 'b' | 'c'
