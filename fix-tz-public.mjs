// Pin the EVENT's own zone on the public surfaces that render an event date.
//
// Each of these had no timeZone at all, so the date came out of the runtime:
// UTC on the server, the reader's zone in the browser. For an event within a
// few hours of midnight that is a different DAY on a page a buyer is using to
// decide when to turn up.
import fs from 'node:fs'

const EDITS = [
  {
    file: 'src/app/city/[slug]/page.tsx',
    // the query must carry the zone before anything can format in it
    from: "'id, slug, title, cover_image_url, thumbnail_url, start_date, end_date,",
    to: "'id, slug, title, cover_image_url, thumbnail_url, start_date, end_date, timezone,",
  },
  {
    file: 'src/app/city/[slug]/page.tsx',
    from:
      "      const dateStr = new Date(r.start_date).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })",
    to:
      "      // The EVENT's zone, never the reader's: a 9pm Perth event reads as\n" +
      "      // the next day in Sydney.\n" +
      '      const dateStr = formatEventDateShort(r.start_date, r.timezone)',
  },
]

for (const { file, from, to } of EDITS) {
  const s = fs.readFileSync(file, 'utf8')
  if (!s.includes(from)) {
    console.log(`SKIP (anchor not found)  ${file}\n   ${from.slice(0, 70)}`)
    continue
  }
  fs.writeFileSync(file, s.replace(from, to))
  console.log(`ok  ${file}`)
}

// Add the import where it is now used.
for (const file of ['src/app/city/[slug]/page.tsx']) {
  let s = fs.readFileSync(file, 'utf8')
  if (s.includes("from '@/lib/dates/event-time'")) continue
  const m = s.match(/^import .*\n/m)
  s = s.slice(0, m.index + m[0].length) + "import { formatEventDateShort } from '@/lib/dates/event-time'\n" + s.slice(m.index + m[0].length)
  fs.writeFileSync(file, s)
  console.log(`import added  ${file}`)
}
