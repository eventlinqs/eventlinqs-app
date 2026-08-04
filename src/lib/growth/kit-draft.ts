/**
 * The /launch kit-draft marker (founder ruling 2026-07-25: drafts persist
 * server-side, keyed to a signed cookie). The composer sets this cookie the
 * moment a kit has RENDERED for an anonymous visitor; its presence at signup
 * is what qualifies the email capture as after-render (the activation metric
 * email_captured_after_render), never an ordinary signup.
 *
 * This module is deliberately tiny and pure so the guard is unit-testable:
 * the signup route must not fire the metric on a missing, malformed, or
 * junk-stuffed cookie.
 */

export const KIT_DRAFT_COOKIE = 'el_kit_draft'

/** Opaque draft tokens: 16 to 128 url-safe base64 characters, nothing else. */
const TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/

export function isKitDraftToken(value: string | null | undefined): value is string {
  return typeof value === 'string' && TOKEN_RE.test(value)
}
