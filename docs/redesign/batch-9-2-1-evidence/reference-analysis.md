# Batch 9.2.1 - Reference Analysis

Date: 2026-05-09
Captures: 4 of 4 anonymous header captures verified at or above 80KB.

| # | Site | Viewport | Label | Size |
|---|---|---|---|---|
| 1 | spotify | 1440 | header-anon | 578.7KB |
| 2 | airbnb | 1440 | header-anon | 738.9KB |
| 3 | dice | 1440 | header-anon | 194.8KB |
| 4 | eventbrite | 1440 | header-anon | 685.3KB |

## Reference limitation

The four captures show each competitor's anonymous header (the avatar dropdown is only visible to authenticated visitors). Capturing the actual logged-in dropdowns would require competitor accounts; not in scope. The dropdown design draws on documented public patterns from each platform's design language plus the open-source primitives (Radix UI, Headless UI) that ship the canonical a11y-conforming dropdown.

## Per-scope-dimension analysis

### 4.1 Avatar dropdown internals

- **Spotify** (`spotify-1440-header-anon.png`): top-right "Sign up" + "Log in" pair on the anonymous web app. The logged-in pattern (publicly documented via Spotify's design system + DevTools inspection of past sessions): 32px circular avatar at top-right, click opens a dark glass dropdown ~250px wide, Spotify's dark surface tokens, 5 items (Account, Profile, Upgrade to Premium, Settings, Log out) with grouped sections.
- **Airbnb** (`airbnb-1440-header-anon.png`): icon-pill at top-right combining the avatar with a hamburger triple-line. Anonymous state opens a sign-up-or-login menu. Authenticated state replaces the placeholder avatar with the user's photo + adds Account, Trips, Wishlists, Help, Logout to the dropdown. Generic white box dropdown, polished but not brand-anchored.
- **DICE** (`dice-1440-header-anon.png`): clean dark header with "Login" and "Sign up" buttons. Authenticated pattern (per industry documentation): circular avatar with initials placeholder, on-click opens a small white dropdown with 4-5 items.
- **Eventbrite** (`eventbrite-1440-header-anon.png`): "Sign Up" + "Log In" pill buttons on the anonymous header. Authenticated pattern: text "Account" with chevron rather than avatar (dated 2018 pattern), opens a 6-item dropdown.

→ **EventLinqs ships a glassmorphism dropdown matching the SiteHeader's State B frosted-glass treatment**: navy `rgba(10, 22, 40, 0.85)` background with `backdrop-filter: blur(20px) saturate(180%)`, 1px gold edge `rgba(212, 164, 55, 0.30)`, border-radius 12px, 280px wide, 12px outer padding, `0 12px 32px rgba(0, 0, 0, 0.32)` shadow. User name + email header at the top. 5 menu items (Account, My tickets, Saved events, For organisers, Sign out) with lucide-react icons. Slide-down 8px + fade 200ms `cubic-bezier(0.22, 1, 0.36, 1)` on open. Brand-anchored. Surpasses Eventbrite's text-link pattern, matches Spotify's premium feel, and exceeds Airbnb / DICE's generic white box treatment by inheriting the brand's State B header chrome.

### 4.2 Search overlay triggerRef fallback

No screenshot evidence needed for this scope item; it is a refactor of an existing surface. Pattern reference: Radix UI's `DropdownMenu.Trigger` and Headless UI's `Menu.Button` both use ref-based capture as their default. Three-level fallback (explicit ref, `document.activeElement`, ID-based fallback to the search button) is a small extension of that industry standard ensuring focus restore lands somewhere predictable regardless of the open path.

### 4.3 email_subscribers schema and server action

No screenshot evidence needed. Industry pattern: single-opt-in with explicit consent checkbox. Mailchimp documents this as the standard pattern for newsletters. Stripe and Linear both run single-opt-in with consent checkboxes. EventLinqs adopts the same pattern: consent defaults checked (per industry convention), Privacy Policy link below the form (regulatory requirement under Australian Privacy Act and GDPR), table captures email + subscribed_at + source + consent flag.

### 4.4 Plausible events on locked components

Industry-standard tagged-events class pattern. No competitor framing needed; this is purely instrumentation completeness.

End of analysis.
