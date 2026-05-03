import { describe, expect, test } from 'vitest'
import { escapeHtmlAttribute } from '@/lib/email/auth-emails'

describe('escapeHtmlAttribute', () => {
  test('escapes ampersand, quote, apostrophe, and angle brackets', () => {
    expect(escapeHtmlAttribute(`a&b"c'd<e>f`)).toBe('a&amp;b&quot;c&#39;d&lt;e&gt;f')
  })

  test('escapes ampersands first so subsequent escapes do not double-escape', () => {
    expect(escapeHtmlAttribute('&amp;')).toBe('&amp;amp;')
    expect(escapeHtmlAttribute('"')).toBe('&quot;')
  })

  test('breaks an attempt to close an href attribute mid-string', () => {
    const malicious = `https://evil.example/" onclick="alert('xss')`
    const out = escapeHtmlAttribute(malicious)
    expect(out).not.toContain('"')
    expect(out).not.toContain("'")
    expect(out).toContain('&quot;')
    expect(out).toContain('&#39;')
  })

  test('passes through normal action_link URLs unchanged where safe', () => {
    const url = 'https://gndnldyfudbytbboxesk.supabase.co/auth/v1/verify?token=abc123&type=signup&redirect_to=https://eventlinqs.com/auth/callback'
    const out = escapeHtmlAttribute(url)
    expect(out).toContain('https://gndnldyfudbytbboxesk.supabase.co/auth/v1/verify?token=abc123')
    expect(out).toContain('&amp;type=signup')
    expect(out).not.toContain('&type=signup')
  })
})
