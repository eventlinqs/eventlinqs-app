import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/*
 * EVERY TILE IN A ROW ENDS LEVEL (LAUNCH-READINESS row 17, /organisers read on production at 768 and 1440 on
 * 7 November 2026). 'Open to every community': a tile whose description runs to a second line (African, Pride, South
 * Asian) stood taller than its neighbours, so each row's bottom edge stepped. The grid stretches each item to its row;
 * the tile link was a plain block and did not fill it. The Design system: 'Uniform card dimensions within a rail'.
 */
describe('the organisers page community tiles', () => {
  const src = readFileSync('src/components/features/organisers/community-strip.tsx', 'utf8').replace(/\r\n/g, '\n')
  const surface = src.match(/const SURFACE =([\s\S]*?)\n\n/)?.[1] ?? ''

  it('each tile fills its grid row, so the row ends level', () => {
    expect(surface).toMatch(/\bh-full\b/)
  })

  it('the grid still stretches its items (no items-start that would undo it)', () => {
    expect(src).toMatch(/className="mt-10 grid /)
    expect(src).not.toMatch(/grid[^"]*\bitems-(start|center|end)\b/)
  })
})
