#!/usr/bin/env node
/**
 * build-preview-critical-css.mjs
 *
 * Compiles a minimal critical CSS for /dev/connect-onboarding-preview by
 * running Tailwind v4 against `_body.html` only. The full app CSS bundle
 * is ~111kB which blocks FCP on Lighthouse simulated mobile/desktop.
 * The generated subset is typically under 20kB.
 *
 * Output: src/app/dev/connect-onboarding-preview/_critical.css
 *
 * Re-run after editing _body.html or the brand tokens in globals.css.
 */

import { mkdtemp, writeFile, rm, readFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'

const ROOT = resolve(process.cwd())
const BODY_HTML = resolve(ROOT, 'src/app/dev/connect-onboarding-preview/_body.html')
const OUT_FILE = resolve(ROOT, 'src/app/dev/connect-onboarding-preview/_critical.css')
const GLOBALS = resolve(ROOT, 'src/app/globals.css')

async function main() {
  if (!existsSync(BODY_HTML)) {
    console.error('Missing', BODY_HTML)
    process.exit(1)
  }
  const globals = await readFile(GLOBALS, 'utf8')

  // Lift the @theme inline block from globals.css verbatim. This keeps brand
  // tokens (gold, ink, success, warning) in lock-step with the rest of the app.
  const themeMatch = globals.match(/@theme inline \{[\s\S]*?\n\}/)
  if (!themeMatch) {
    console.error('Could not locate @theme inline block in globals.css')
    process.exit(1)
  }
  const themeBlock = themeMatch[0]

  const tmp = await mkdtemp(join(ROOT, 'node_modules', '.cache', 'preview-critical-'))
  try {
    await mkdir(tmp, { recursive: true })
    const input = resolve(tmp, 'input.css')
    const out = resolve(tmp, 'out.css')
    const sourceHtml = resolve(tmp, 'body.html')
    await writeFile(sourceHtml, await readFile(BODY_HTML, 'utf8'))
    const inputCss = `@import "tailwindcss" source(none);
@source "${sourceHtml.replace(/\\/g, '/')}";

${themeBlock}

:root {
  --background: #FAFAF7;
  --foreground: #0A1628;
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-body, system-ui, -apple-system, sans-serif);
  margin: 0;
}

:focus-visible {
  outline: 2px solid var(--color-gold-400);
  outline-offset: 2px;
  border-radius: 4px;
}
`
    await writeFile(input, inputCss)

    const result = spawnSync(
      'npx',
      [
        '--no-install',
        '@tailwindcss/cli',
        '-i',
        input,
        '-o',
        out,
        '--cwd',
        ROOT,
        '--minify',
      ],
      { stdio: 'pipe', shell: true, cwd: ROOT }
    )
    if (result.status !== 0) {
      console.error('Tailwind CLI failed')
      console.error('stdout:', result.stdout?.toString())
      console.error('stderr:', result.stderr?.toString())
      process.exit(1)
    }
    const css = await readFile(out, 'utf8')
    await mkdir(resolve(OUT_FILE, '..'), { recursive: true })
    await writeFile(OUT_FILE, css)
    console.log(
      `wrote ${OUT_FILE} (${css.length.toLocaleString()} bytes, ${(css.length / 1024).toFixed(1)} kB)`
    )
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
