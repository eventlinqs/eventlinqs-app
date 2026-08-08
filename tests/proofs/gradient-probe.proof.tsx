import { describe, it } from 'vitest'
import { ImageResponse } from 'next/og'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * A throwaway probe: which CSS background forms does the renderer behind
 * ImageResponse actually resolve? Keeps design decisions evidence-based rather
 * than guessed, since a silently-ignored gradient looks identical to a flat
 * fill in the output.
 */
const OUT = join(process.cwd(), 'docs', 'design', 'launch-kit-artefacts', 'probe')

const CASES: { name: string; style: Record<string, string> }[] = [
  { name: 'a-single-radial-percent', style: { background: 'radial-gradient(ellipse 85% 42% at 100% 0%, rgba(232,183,56,0.55) 0%, rgba(10,22,40,0) 70%)' } },
  { name: 'b-single-radial-circle', style: { background: 'radial-gradient(circle at 100% 0%, rgba(232,183,56,0.55) 0%, rgba(10,22,40,0) 70%)' } },
  { name: 'c-two-linear', style: { background: 'linear-gradient(150deg, rgba(232,183,56,0.30) 0%, rgba(10,22,40,0) 45%), linear-gradient(160deg, #0A1628 0%, #050D18 100%)' } },
  { name: 'd-one-linear-three-stop', style: { background: 'linear-gradient(150deg, #23406a 0%, #0A1628 48%, #050D18 100%)' } },
  { name: 'e-backgroundimage-radial', style: { backgroundColor: '#0A1628', backgroundImage: 'radial-gradient(ellipse 85% 42% at 100% 0%, rgba(232,183,56,0.55) 0%, rgba(10,22,40,0) 70%)' } },
]

describe('gradient probe', () => {
  it('renders each background form', async () => {
    await mkdir(OUT, { recursive: true })
    for (const testCase of CASES) {
      const response = new ImageResponse(
        (
          <div
            style={{
              width: 400,
              height: 400,
              display: 'flex',
              backgroundColor: '#0A1628',
              ...testCase.style,
            }}
          />
        ),
        { width: 400, height: 400 },
      )
      await writeFile(join(OUT, `${testCase.name}.png`), Buffer.from(await response.arrayBuffer()))
    }
  })
})
