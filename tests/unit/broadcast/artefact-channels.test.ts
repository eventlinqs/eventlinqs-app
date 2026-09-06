import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { stripComments } from '../../../scripts/lib/js-source.mjs'
import {
  ARTEFACT_CHANNELS,
  DEFAULT_ARTEFACT_CHANNEL,
  artefactChannelFrom,
  isArtefactChannel,
} from '@/lib/broadcast/artefact-channels'
import { ARTEFACT_CHANNELS as FROM_KIT } from '@/lib/broadcast/kit-artefacts'
import { CAPTION_ORDER } from '@/lib/broadcast/captions'
import { DRAFT_CHANNELS } from '@/lib/launch/draft-artefacts'
import { SOCIAL_CARD_ORDER } from '@/lib/broadcast/social-card-spec'

/**
 * ONE LIST OF CHANNELS, READ EVERYWHERE, TYPED NOWHERE ELSE.
 *
 * Close-out C3 (6 September 2026): the eighteen cards are three formats across
 * six channels, and "six" was written by hand in four files. The list now has
 * one source, and everything that used to carry a copy is pinned to it here so
 * a copy cannot quietly come back.
 */

const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => stripComments(readFileSync(join(ROOT, rel), 'utf8'))

describe('the artefact channels', () => {
  test('are six, distinct, and in the order the kit presents them', () => {
    expect(ARTEFACT_CHANNELS).toEqual(['instagram', 'facebook', 'whatsapp', 'x', 'linkedin', 'email'])
    expect(new Set(ARTEFACT_CHANNELS).size).toBe(6)
  })

  test('are the same list the kit, the captions and the public composer read', () => {
    expect(FROM_KIT).toBe(ARTEFACT_CHANNELS)
    expect(CAPTION_ORDER).toBe(ARTEFACT_CHANNELS)
    expect(DRAFT_CHANNELS).toBe(ARTEFACT_CHANNELS)
  })

  test('three formats across six channels is eighteen cards', () => {
    expect(SOCIAL_CARD_ORDER.length * ARTEFACT_CHANNELS.length).toBe(18)
  })

  test('isArtefactChannel accepts each channel and nothing else', () => {
    for (const c of ARTEFACT_CHANNELS) expect(isArtefactChannel(c)).toBe(true)
    for (const bad of ['qr', 'copy', 'sms', 'digest', '', 'INSTAGRAM', ' instagram', null, undefined, 3]) {
      expect(isArtefactChannel(bad), String(bad)).toBe(false)
    }
  })

  test('a query string that names no channel, or a channel the kit does not offer, gets the default', () => {
    expect(DEFAULT_ARTEFACT_CHANNEL).toBe('instagram')
    expect(artefactChannelFrom(null)).toBe('instagram')
    expect(artefactChannelFrom(undefined)).toBe('instagram')
    expect(artefactChannelFrom('')).toBe('instagram')
    expect(artefactChannelFrom('qr')).toBe('instagram')
    expect(artefactChannelFrom('linkedin')).toBe('linkedin')
  })
})

describe('no file re-types the list', () => {
  const ROUTES = [
    'src/app/api/organiser/events/[id]/card/[format]/route.ts',
    'src/app/api/launch/[code]/card/[format]/route.ts',
  ]
  const LITERAL_LIST = /\[\s*'instagram'\s*,\s*'facebook'/

  test.each(ROUTES)('%s reads the channel from the one source and declares no list of its own', (route) => {
    const code = read(route)
    expect(code).not.toMatch(/const CHANNELS\b/)
    expect(code).not.toMatch(LITERAL_LIST)
    expect(code).toMatch(/artefactChannelFrom\(/)
    expect(code).toMatch(/@\/lib\/broadcast\/artefact-channels/)
  })

  test('the modules that used to carry a copy now import it', () => {
    for (const rel of ['src/lib/broadcast/kit-artefacts.ts', 'src/lib/broadcast/captions.ts']) {
      const code = read(rel)
      expect(code, rel).not.toMatch(LITERAL_LIST)
      expect(code, rel).toMatch(/@\/lib\/broadcast\/artefact-channels/)
    }
  })

  test('the Launch Kit inspection enumerates formats and channels from source, never from a literal', () => {
    const code = read('scripts/verify/launch-kit-inspect.mjs')
    expect(code).not.toMatch(LITERAL_LIST)
    expect(code).not.toMatch(/CARD_SPEC\s*=\s*\{/)
    expect(code).not.toMatch(/width:\s*1080/)
    expect(code).toMatch(/src\/lib\/broadcast\/social-card-spec\.ts/)
    expect(code).toMatch(/src\/lib\/broadcast\/artefact-channels\.ts/)
    expect(code).toMatch(/src\/lib\/broadcast\/social-card-layout\.ts/)
    // A failed import must fail the run; the old script swallowed it.
    expect(code).not.toMatch(/import\([^)]*\)\s*\.catch\(\s*\(\)\s*=>\s*null\s*\)/)
  })

  test('the one source itself has no imports, so a script outside the bundle can load it', () => {
    const code = read('src/lib/broadcast/artefact-channels.ts')
    expect(code).not.toMatch(/^\s*import\s/m)
  })
})
