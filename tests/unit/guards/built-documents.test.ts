// WHERE A BUILD WRITES ITS PRERENDERED DOCUMENTS (car 50, 6 November 2026). Next.js 16.4 writes them to .next/server/app
// when it builds alone, and to .next/server/route-cache/<kind>/<sha256 of the route>/$<path> when a deployment adapter is set
// (node_modules/next/dist/server/lib/route-cache-key.js, getRouteCacheKey; build/index.js uses it when config.adapterPath is
// set), which Vercel's build sets. Car 50's preview went ERROR on Vercel: '[no-catalogue-in-every-document] FAIL: not one .html
// or .rsc document under .next/server/app', after 148 pages were prerendered. Every guard that reads the built documents
// reads them through scripts/guards/lib/built-documents.mjs, which knows both.

import { afterEach, describe, expect, test } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { builtDocuments, builtDocumentsExist } from '../../../scripts/guards/lib/built-documents.mjs'

let root = ''
afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true })
  root = ''
})
const file = (rel: string, body = '<html></html>') => {
  const path = join(root, rel)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, body)
}

describe('the built documents', () => {
  test('a build alone: .next/server/app', () => {
    root = mkdtempSync(join(tmpdir(), 'built-docs-'))
    file('.next/server/app/index.html')
    file('.next/server/app/events/browse.rsc')
    file('.next/server/app/events/page.js')
    expect(builtDocumentsExist(root)).toBe(true)
    expect(builtDocuments(root).map((p) => p.replace(/\\/g, '/').split('/.next/')[1]).sort()).toEqual(['server/app/events/browse.rsc', 'server/app/index.html'])
  })

  test("a build through a deployment adapter (Vercel's): .next/server/route-cache", () => {
    root = mkdtempSync(join(tmpdir(), 'built-docs-'))
    file('.next/server/app/events/page.js')
    file('.next/server/route-cache/APP_PAGE/0f1e2d/$index.html')
    file('.next/server/route-cache/APP_PAGE/0f1e2d/$index.rsc')
    expect(builtDocumentsExist(root)).toBe(true)
    expect(builtDocuments(root)).toHaveLength(2)
  })

  test('no build at all: nothing, and it says so', () => {
    root = mkdtempSync(join(tmpdir(), 'built-docs-'))
    expect(builtDocumentsExist(root)).toBe(false)
    expect(builtDocuments(root)).toEqual([])
  })
})
