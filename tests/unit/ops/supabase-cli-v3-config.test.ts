import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * TOOLS KEPT CURRENT (Lawal's ruling of 6 November 2026, 15:51; the CONTROLLER's 15:55). The Supabase CLI on the build
 * machine is 3.0.0 (scoop, 6 November). Its release notes (github.com/supabase/cli/releases/tag/v3.0.0, read 6 November):
 * 'v3 can't load a supabase/config.toml that still has an [inbucket] section' (renamed [local_smtp]); 'enable_signup under
 * [auth.email] and [auth.sms]' is deprecated, use 'enabled', and every run warned about it until it changed.
 */
const config = readFileSync(join(__dirname, '..', '..', '..', 'supabase', 'config.toml'), 'utf8')
const section = (name: string) => {
  const at = config.indexOf(`\n[${name}]`)
  if (at < 0) return ''
  const rest = config.slice(at + name.length + 3)
  const next = rest.search(/\n\[/)
  return next < 0 ? rest : rest.slice(0, next)
}

describe('supabase/config.toml loads in Supabase CLI v3 with no warning', () => {
  it('has no [inbucket] section; [local_smtp] instead', () => {
    expect(config).not.toMatch(/^\[inbucket\]/m)
    expect(config).toMatch(/^\[local_smtp\]/m)
  })

  it('names email and phone sign ups with enabled, never the deprecated enable_signup', () => {
    for (const name of ['auth.email', 'auth.sms']) expect(section(name)).not.toMatch(/^\s*enable_signup\s*=/m)
    expect(section('auth.email')).toMatch(/^\s*enabled\s*=\s*true/m)
  })
})
