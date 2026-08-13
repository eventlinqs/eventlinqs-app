/**
 * Decode the ACTUAL text drawn in a PDF, through the embedded fonts' ToUnicode
 * maps.
 *
 * WHY BOTHER. The poster embeds Archivo and Hanken Grotesk as SUBSETS, so the
 * bytes in the content stream are glyph ids, not characters: reading the stream
 * shows `<0001000200030004>` where a person sees an address. Claiming the poster
 * prints the right host without decoding that is inference, not verification,
 * and the whole point of this pass is that a rendered artefact is unproven until
 * somebody has actually read what it says.
 *
 * Usage: node scripts/verify/pdf-text-decode.mjs <file.pdf>
 */
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'

const file = process.argv[2]
if (!file) {
  console.error('usage: node scripts/verify/pdf-text-decode.mjs <file.pdf>')
  process.exit(1)
}

const bytes = readFileSync(file)
const hay = bytes.toString('latin1')

/** Every inflatable stream, kept separately so CMaps and content are both seen. */
const streams = []
let at = 0
for (;;) {
  const open = hay.indexOf('stream', at)
  if (open === -1) break
  let start = open + 'stream'.length
  if (hay[start] === '\r') start += 1
  if (hay[start] === '\n') start += 1
  const end = hay.indexOf('endstream', start)
  if (end === -1) break
  try {
    streams.push(inflateSync(bytes.subarray(start, end)).toString('latin1'))
  } catch {
    /* a raw font file or an image */
  }
  at = end + 'endstream'.length
}

/**
 * One glyph-id map PER EMBEDDED FONT, kept separate.
 *
 * Merging them was the first attempt and it was wrong: the poster embeds Archivo
 * and Hanken Grotesk as independent subsets, so glyph id 0x0007 means different
 * characters in each. Merged, the headline decoded cleanly (Archivo won the
 * collisions) and the gold ticket line came out as noise, which reads exactly
 * like a corrupt artefact when in fact only the reader was wrong. Each line is
 * therefore decoded under EVERY map and the most legible answer is taken, which
 * is a real read of the file rather than an assumption about which font drew it.
 */
const maps = []
for (const s of streams) {
  if (!/beginbfchar|beginbfrange/.test(s)) continue
  const map = new Map()
  // The two section types are parsed SEPARATELY. Running one regex over the
  // whole CMap was the previous bug: a bfchar pair followed by the next pair
  // looks like a bfrange triple, so the pairs were read as ranges and every
  // decode came out as control characters.
  for (const section of s.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const m of section[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      const lo = parseInt(m[1], 16)
      const hi = parseInt(m[2], 16)
      const base = parseInt(m[3].slice(0, 4), 16)
      for (let i = lo; i <= hi && i - lo < 512; i += 1) map.set(i, String.fromCharCode(base + (i - lo)))
    }
  }
  for (const section of s.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const m of section[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      map.set(parseInt(m[1], 16), String.fromCharCode(parseInt(m[2].slice(0, 4), 16)))
    }
  }
  if (map.size) maps.push(map)
}

const decodeWith = (hex, map) => {
  let out = ''
  for (let i = 0; i + 4 <= hex.length; i += 4) {
    out += map.get(parseInt(hex.slice(i, i + 4), 16)) ?? '▯'
  }
  return out
}

/** How much of a decode reads as real words, punctuation and web characters. */
const legibility = (s) => {
  if (!s.length) return 0
  const good = (s.match(/[A-Za-z0-9 .,:/$'·-]/g) || []).length
  return good / s.length
}

const best = (hex) => {
  let winner = ''
  let score = -1
  for (const map of maps) {
    const text = decodeWith(hex, map)
    const s = legibility(text)
    if (s > score) {
      score = s
      winner = text
    }
  }
  return winner
}

console.log(`${file}`)
console.log(`  embedded ToUnicode maps: ${maps.length}`)
console.log('  --- drawn text, in draw order, best decode per line ---')
for (const s of streams) {
  if (!/\bTj\b/.test(s)) continue
  for (const m of s.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) {
    const text = best(m[1]).trim()
    if (text) console.log(`  ${text}`)
  }
}
