/**
 * The printed plan: the one SVG path kept from the retired renderer's
 * world. Emits a static, full-LOD sheet (stage geometry, chairs as
 * furniture, row letters on both flanks, section names) for printing and
 * PDF export. Pure string building, no DOM.
 */

import { SEAT_STATE_COLORS } from '../palette'
import { displayRowLabel } from './labels'
import { CHAIR_PART_PATHS, CHAIR_STROKE, GLYPH_BOX } from './glyphs'
import type { Scene } from './scene'

const C = SEAT_STATE_COLORS

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function sceneToPrintSvg(scene: Scene, title: string): string {
  const pad = 48
  const b = scene.bounds
  const w = b.maxX - b.minX + pad * 2
  const h = b.maxY - b.minY + pad * 2 + 40
  const ox = -b.minX + pad
  const oy = -b.minY + pad + 32

  const parts: string[] = []
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w.toFixed(0)} ${h.toFixed(0)}" font-family="Manrope, sans-serif">`,
  )
  parts.push(`<rect width="100%" height="100%" fill="${C.white}" />`)
  parts.push(
    `<rect x="8" y="8" width="${(w - 16).toFixed(0)}" height="${(h - 16).toFixed(0)}" fill="none" stroke="${C.night}" stroke-width="1.25" />`,
  )
  parts.push(
    `<rect x="14" y="14" width="${(w - 28).toFixed(0)}" height="${(h - 28).toFixed(0)}" fill="none" stroke="${C.night}" stroke-opacity="0.35" stroke-width="0.75" />`,
  )
  if (title.trim().length > 0) {
    parts.push(
      `<text x="${(w / 2).toFixed(0)}" y="30" text-anchor="middle" font-size="14" font-weight="700" letter-spacing="2" fill="${C.night}">${esc(title.toUpperCase())}</text>`,
    )
  }

  // Stage geometry: flat paper fill, matched to the plan's flat stage.
  if (scene.stage) {
    const pts = scene.stage.outline.map(p => `${(p.x + ox).toFixed(1)},${(p.y + oy).toFixed(1)}`).join(' ')
    if (scene.stage.ellipse) {
      const e = scene.stage.ellipse
      parts.push(
        `<ellipse cx="${(e.cx + ox).toFixed(1)}" cy="${(e.cy + oy).toFixed(1)}" rx="${e.rx.toFixed(1)}" ry="${e.ry.toFixed(1)}" fill="${C.veil}" stroke="${C.night}" stroke-width="1.5"/>`,
      )
    } else {
      parts.push(`<polygon points="${pts}" fill="${C.veil}" stroke="${C.night}" stroke-width="1.5"/>`)
    }
    const apron = scene.stage.apron
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${(p.x + ox).toFixed(1)} ${(p.y + oy).toFixed(1)}`)
      .join(' ')
    parts.push(`<path d="${apron}" fill="none" stroke="${C.night}" stroke-width="2.5"/>`)
    parts.push(
      `<text x="${(scene.stage.labelAt.x + ox).toFixed(1)}" y="${(scene.stage.labelAt.y + oy).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="600" letter-spacing="3" fill="${C.dusk}">STAGE</text>`,
    )
  }

  // Areas.
  for (const area of scene.areas) {
    parts.push(
      `<rect x="${(area.x + ox).toFixed(1)}" y="${(area.y + oy).toFixed(1)}" width="${area.width}" height="${area.height}" rx="10" fill="${area.color}" fill-opacity="0.13" stroke="${area.color}" stroke-dasharray="6 4" stroke-width="1.5"/>`,
    )
    parts.push(
      `<text x="${(area.x + area.width / 2 + ox).toFixed(1)}" y="${(area.y + area.height / 2 + oy).toFixed(1)}" text-anchor="middle" font-size="12" font-weight="700" fill="${C.night}">${esc(area.label)}</text>`,
    )
  }

  // Chairs at full anatomy: available prints as the outline chair over
  // paper (the benchmark's breathing room), everything taken as the
  // plan's solid dark sold state.
  // ONE glyph, uniformly scaled, its stroke scaling with it: the printed
  // plan and the canvas painter draw the identical silhouette.
  const k = scene.chairW / GLYPH_BOX
  const half = GLYPH_BOX / 2
  for (let i = 0; i < scene.seats.length; i++) {
    const s = scene.seats[i]
    const taken = s.status !== 'available'
    const hue = scene.seatColor[i]
    const tx = s.x + ox - half * k
    const ty = s.y + oy - half * k
    parts.push(`<g transform="translate(${tx.toFixed(1)} ${ty.toFixed(1)}) scale(${k.toFixed(4)})">`)
    for (const d of CHAIR_PART_PATHS) {
      parts.push(
        taken
          ? `<path d="${d}" fill="${C.dusk}"/>`
          : `<path d="${d}" fill="${C.white}" stroke="${hue}" stroke-width="${CHAIR_STROKE}"/>`,
      )
    }
    parts.push('</g>')
  }

  // Row letters on both flanks.
  for (const row of scene.rowLabels) {
    for (const side of [row.left, row.right]) {
      parts.push(
        `<text x="${(side.x + ox).toFixed(1)}" y="${(side.y + oy + 3.5).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="600" fill="${C.stoneText}">${esc(displayRowLabel(row.label))}</text>`,
      )
    }
  }

  // Section names.
  for (const poly of scene.polygons) {
    parts.push(
      `<text x="${(poly.centroid.x + ox).toFixed(1)}" y="${(poly.centroid.y + oy).toFixed(1)}" text-anchor="middle" font-size="12" font-weight="700" letter-spacing="1" fill="${C.night}" fill-opacity="0.55" font-family="Archivo, sans-serif">${esc(poly.name.toUpperCase())}</text>`,
    )
  }

  parts.push('</svg>')
  return parts.join('\n')
}
