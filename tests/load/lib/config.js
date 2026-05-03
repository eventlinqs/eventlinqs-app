// Shared config used by every k6 profile.
//
// k6 runs scripts in Goja, a JS interpreter. No NPM, no `require`. Use
// `import` of relative .js files only, or k6's built-in modules like
// 'k6/http', 'k6/data', 'k6'.
//
// All env vars consumed here are read once at module scope so that VUs
// share the same value (k6 evaluates this module per-VU but we want
// deterministic config). Document every env var added below in
// tests/load/README.md.

const FALLBACK_BASE = 'http://localhost:3000'

export const BASE_URL = (__ENV.BASE_URL || FALLBACK_BASE).replace(/\/$/, '')

// Bypass token used by load-test-only routes, if any. Production routes
// must reject this token. Empty string means no special header.
export const LOAD_TEST_TOKEN = __ENV.LOAD_TEST_TOKEN || ''

// Tag every metric with the environment so k6 Cloud / dashboards can
// filter cleanly. The results doc captures this verbatim.
export const RUN_ENV = __ENV.RUN_ENV || 'preview'

// User-agent strings used by Profile 1 to match real browser shape.
// 70% mobile, 30% desktop per scope.
export const USER_AGENTS = {
  mobile: [
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.6367.111 Mobile/15E148 Safari/604.1',
  ],
  desktop: [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  ],
}

export function pickUserAgent() {
  const isMobile = Math.random() < 0.7
  const pool = isMobile ? USER_AGENTS.mobile : USER_AGENTS.desktop
  return pool[Math.floor(Math.random() * pool.length)]
}

// Default request headers. Always merge with profile-specific overrides.
export function baseHeaders(extra = {}) {
  return {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-AU,en;q=0.9',
    'Cache-Control': 'no-cache',
    'User-Agent': pickUserAgent(),
    ...extra,
  }
}

// Weighted random pick for route selection. Pass an array of
// [weight, value] tuples; weights are normalised internally.
export function weightedPick(weighted) {
  let total = 0
  for (const [w] of weighted) total += w
  let r = Math.random() * total
  for (const [w, v] of weighted) {
    r -= w
    if (r <= 0) return v
  }
  return weighted[weighted.length - 1][1]
}

// Pseudo-random integer in [min, max] inclusive.
export function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}
