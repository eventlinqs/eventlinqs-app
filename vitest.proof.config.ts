import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

/**
 * The PROOF runner, deliberately separate from `npm test`.
 *
 * Files under tests/proofs render real artefacts to disk so a human can look at
 * them: social cards, posters, before-and-after sets. They are slow, they write
 * files, and they are not assertions, so they must never sit in the CI suite.
 *
 *   npx vitest run --config vitest.proof.config.ts
 */
const srcAlias = fileURLToPath(new URL('./src', import.meta.url))
const emptyStub = fileURLToPath(new URL('./tests/stubs/empty.ts', import.meta.url))

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: { '@': srcAlias, 'server-only': emptyStub, 'client-only': emptyStub },
  },
  test: {
    name: 'proofs',
    include: ['tests/proofs/**/*.proof.ts', 'tests/proofs/**/*.proof.tsx'],
    environment: 'node',
    globals: false,
    testTimeout: 180_000,
    hookTimeout: 180_000,
  },
})
