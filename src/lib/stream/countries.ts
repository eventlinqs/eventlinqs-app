/**
 * THE COUNTRIES A LIVESTREAM CAN BE RESTRICTED TO (Scope v5, 3.11).
 *
 * Codes are ISO 3166-1 alpha-2, upper case, which is exactly what Vercel puts
 * in the x-vercel-ip-country request header
 * (https://vercel.com/docs/headers/request-headers, fetched 2026-09-03), so
 * the value the organiser picks and the value the request carries compare
 * without translation.
 *
 * This is a CURATED checklist rather than all 249 codes, because a 249-row
 * control is a wall of text nobody scrolls (Law 1). Australia and New Zealand
 * lead. The rest are the countries an Australian organiser actually streams to:
 * the largest overseas-born groups in Australia (ABS, cited in CLAUDE.md Law 3:
 * India, China, New Zealand, the Philippines, Nepal, and the fast-growing
 * communities behind the platform's community layer), the Pacific neighbours,
 * and the English-speaking countries families are spread across. Any code
 * outside this list is
 * still accepted by the schema (^[A-Z]{2}$), so a future organiser who needs a
 * country not shown here is one row away, never a migration away.
 *
 * Names are plain Australian English and match the names used elsewhere in the
 * product (src/lib/geo/detect.ts).
 */
export type StreamCountry = { code: string; name: string }

export const STREAM_COUNTRIES: readonly StreamCountry[] = [
  { code: 'AU', name: 'Australia' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'AR', name: 'Argentina' },
  { code: 'BD', name: 'Bangladesh' },
  { code: 'BR', name: 'Brazil' },
  { code: 'CA', name: 'Canada' },
  { code: 'CL', name: 'Chile' },
  { code: 'CN', name: 'China' },
  { code: 'EG', name: 'Egypt' },
  { code: 'ET', name: 'Ethiopia' },
  { code: 'FJ', name: 'Fiji' },
  { code: 'FR', name: 'France' },
  { code: 'DE', name: 'Germany' },
  { code: 'GH', name: 'Ghana' },
  { code: 'GR', name: 'Greece' },
  { code: 'HK', name: 'Hong Kong' },
  { code: 'IN', name: 'India' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'IE', name: 'Ireland' },
  { code: 'IL', name: 'Israel' },
  { code: 'IT', name: 'Italy' },
  { code: 'JP', name: 'Japan' },
  { code: 'KE', name: 'Kenya' },
  { code: 'KR', name: 'South Korea' },
  { code: 'LB', name: 'Lebanon' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'NP', name: 'Nepal' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'NG', name: 'Nigeria' },
  { code: 'PK', name: 'Pakistan' },
  { code: 'PG', name: 'Papua New Guinea' },
  { code: 'PH', name: 'Philippines' },
  { code: 'PL', name: 'Poland' },
  { code: 'WS', name: 'Samoa' },
  { code: 'SA', name: 'Saudi Arabia' },
  { code: 'SG', name: 'Singapore' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'LK', name: 'Sri Lanka' },
  { code: 'TW', name: 'Taiwan' },
  { code: 'TH', name: 'Thailand' },
  { code: 'TO', name: 'Tonga' },
  { code: 'TR', name: 'Turkey' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'US', name: 'United States' },
  { code: 'VN', name: 'Vietnam' },
  { code: 'ZW', name: 'Zimbabwe' },
]

/** Quick picks for the organiser: a region is a named set of the codes above. */
export const STREAM_REGIONS: readonly { name: string; codes: readonly string[] }[] = [
  { name: 'Australia and New Zealand', codes: ['AU', 'NZ'] },
  { name: 'Pacific', codes: ['AU', 'NZ', 'FJ', 'PG', 'WS', 'TO'] },
  { name: 'Asia', codes: ['BD', 'CN', 'HK', 'IN', 'ID', 'JP', 'KR', 'LK', 'MY', 'NP', 'PH', 'PK', 'SG', 'TH', 'TW', 'VN'] },
  { name: 'Africa', codes: ['EG', 'ET', 'GH', 'KE', 'NG', 'ZA', 'ZW'] },
  { name: 'Europe', codes: ['DE', 'FR', 'GB', 'GR', 'IE', 'IT', 'NL', 'PL', 'TR'] },
  { name: 'Middle East', codes: ['AE', 'IL', 'LB', 'SA'] },
  { name: 'Americas', codes: ['AR', 'BR', 'CA', 'CL', 'US'] },
]

const NAME_BY_CODE = new Map(STREAM_COUNTRIES.map((c) => [c.code, c.name]))

/** Upper-case, two letters, deduplicated, sorted with Australia and New Zealand first. */
export function normaliseCountryCodes(input: readonly string[] | null | undefined): string[] {
  const set = new Set<string>()
  for (const raw of input ?? []) {
    const code = String(raw ?? '').trim().toUpperCase()
    if (/^[A-Z]{2}$/.test(code)) set.add(code)
  }
  const lead = ['AU', 'NZ'].filter((c) => set.has(c))
  const rest = [...set].filter((c) => c !== 'AU' && c !== 'NZ').sort()
  return [...lead, ...rest]
}

/** "Australia" or "Australia and New Zealand" or "Australia, New Zealand and 3 more". */
export function describeCountries(codes: readonly string[] | null | undefined): string {
  const list = normaliseCountryCodes(codes)
  if (list.length === 0) return 'anywhere'
  const names = list.map((c) => NAME_BY_CODE.get(c) ?? c)
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`
}

export function countryName(code: string): string {
  return NAME_BY_CODE.get(String(code ?? '').toUpperCase()) ?? code
}
