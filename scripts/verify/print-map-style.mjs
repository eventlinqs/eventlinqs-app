/**
 * Print the EventLinqs map style as the JSON Google Cloud console imports.
 *
 * WHY THIS EXISTS. Every map is now built with a Map ID so that
 * AdvancedMarkerElement works, and a Map ID disables the inline `styles`
 * option (Google, MapOptions.styles: "This feature is not available when using
 * a map ID"). The 20-rule brand style therefore has to be recreated ONCE as a
 * cloud style on the Map ID, or every map on the platform reverts to default
 * Google colours: bright parks, POI pins and full road labels.
 *
 * This prints exactly what to paste, read from the same TypeScript array the
 * code has always used, so the cloud style cannot drift from a hand-copy.
 *
 *   node scripts/verify/print-map-style.mjs
 */
import { readFileSync } from 'node:fs'

const src = readFileSync('src/lib/maps/google-maps-style.ts', 'utf8')

// The file is TypeScript with a type annotation, so it is not importable as
// ESM without a compile step. Slice the array literal out and parse it as JSON5
// -ish by quoting the bare keys. Deliberately strict: if the shape ever stops
// matching, this throws rather than printing something half-right.
// Anchor on `= [`, not the first `[`: the declaration is
// `EVENTLINQS_MAP_STYLE: google.maps.MapTypeStyle[] = [`, so the first bracket
// after the name belongs to the TYPE annotation, not the value.
const assign = src.indexOf('= [', src.indexOf('EVENTLINQS_MAP_STYLE'))
const start = assign < 0 ? -1 : assign + 2
const end = src.lastIndexOf(']')
if (start < 0 || end < 0 || end <= start) {
  throw new Error('Could not locate the EVENTLINQS_MAP_STYLE array literal.')
}
const literal = src
  .slice(start, end + 1)
  // quote bare object keys
  .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":')
  // single to double quotes
  .replace(/'/g, '"')
  // drop trailing commas
  .replace(/,(\s*[}\]])/g, '$1')

const parsed = JSON.parse(literal)
if (!Array.isArray(parsed) || parsed.length === 0) {
  throw new Error('Parsed style is not a non-empty array.')
}

console.log(JSON.stringify(parsed, null, 2))
console.error(`\n[ok] ${parsed.length} style rules. Paste the JSON above into:`)
console.error('     Google Cloud console > Google Maps Platform > Map Styles')
console.error('     > Create/Edit style > Import JSON, then associate it with')
console.error('     Map ID 8a97afecec3a7c6d7a3d4e35 and Save.')
