/**
 * THE FIRST COHORT (window 6, 30 October 2026; the project manager's ruling 5 of the growth blueprint: "The first 100
 * come from production's 151 organisers, ranked by score (Geelong 45%, Melbourne 35%, Ballarat and Bendigo 10% each, as
 * the starting hypothesis). Only contacts with a recorded lawful basis enter email; the rest go to inbound, partnership
 * or in-person routes.").
 *
 * Each city takes its share of the cohort, highest organiser score first (src/lib/outreach/organiser-score.ts), a tie
 * by id so the cohort never moves between runs. The shares are split by largest remainders, so the quotas always add
 * to the size. A city with fewer organisers than its share is SHORT and says by how many; its gap is never filled from
 * another city, because that would quietly change the hypothesis the pilot is testing. An organiser outside the four
 * cities, or with no city on record, is left out and counted.
 *
 * Picking is not writing: who is picked enters email only through an approved play, and the database still judges
 * every message (outreach_touch_is_lawful). Pure.
 */

export const COHORT_SIZE = 100
export const CITY_SHARES = { geelong: 0.45, melbourne: 0.35, ballarat: 0.1, bendigo: 0.1 } as const
export type PilotCity = keyof typeof CITY_SHARES
const CITIES = Object.keys(CITY_SHARES) as PilotCity[]

export type Candidate = { id: string; city: string | null; score: number; writableEmail: boolean }

export type Cohort<T extends Candidate> = {
  quota: Record<PilotCity, number>
  byCity: Record<PilotCity, T[]>
  short: Record<PilotCity, number>
  /** Picked, with a lawful-basis email contact: these may enter an approved play. */
  email: T[]
  /** Picked, with no email we may write to: inbound, partnership or in-person routes. */
  otherRoutes: T[]
  total: number
  /** Organisers left out for a city outside the four, or none on record. */
  outside: number
}

/** The four quotas for a cohort of `size`, by largest remainders; a tie in remainder goes to the earlier city. */
export function quotasOf(size: number): Record<PilotCity, number> {
  const exact = CITIES.map((city) => ({ city, n: size * CITY_SHARES[city] }))
  const quota = Object.fromEntries(exact.map((e) => [e.city, Math.floor(e.n + 1e-9)])) as Record<PilotCity, number>
  let left = size - CITIES.reduce((n, city) => n + quota[city], 0)
  const byRemainder = exact
    .map((e, i) => ({ ...e, i, rem: e.n - Math.floor(e.n + 1e-9) }))
    .sort((a, b) => b.rem - a.rem || a.i - b.i)
  for (const e of byRemainder) {
    if (left <= 0) break
    quota[e.city] += 1
    left -= 1
  }
  return quota
}

export function pickCohort<T extends Candidate>(candidates: readonly T[], size: number = COHORT_SIZE): Cohort<T> {
  const quota = quotasOf(size)
  const isPilot = (city: string | null): city is PilotCity => city !== null && (CITIES as string[]).includes(city)
  const ranked = [...candidates].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
  const byCity = Object.fromEntries(CITIES.map((city) => [city, [] as T[]])) as Record<PilotCity, T[]>
  let outside = 0
  for (const c of ranked) {
    if (!isPilot(c.city)) {
      outside += 1
      continue
    }
    if (byCity[c.city].length < quota[c.city]) byCity[c.city].push(c)
  }
  const picked = CITIES.flatMap((city) => byCity[city])
  return {
    quota,
    byCity,
    short: Object.fromEntries(CITIES.map((city) => [city, quota[city] - byCity[city].length])) as Record<PilotCity, number>,
    email: picked.filter((c) => c.writableEmail),
    otherRoutes: picked.filter((c) => !c.writableEmail),
    total: picked.length,
    outside,
  }
}

/** The city the cohort import wrote into an organiser's notes, as a slug; null when it says 'not stated' or nothing. */
export function statedCityOf(notes: string | null): string | null {
  const stated = /City: ([^.]+)\./.exec(notes ?? '')?.[1]?.trim()
  if (!stated || stated.toLowerCase() === 'not stated') return null
  return stated.toLowerCase().replace(/\s+/g, '-')
}
