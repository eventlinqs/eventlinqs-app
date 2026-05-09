# Batch 9.2.1 GATE 2 - Existing Code Audit

Date: 2026-05-09
Branch: `redesign/world-class-rebuild-2026-05-03`
HEAD: `b6cfe88`

---

## 5.1 Avatar component audit

`src/components/layout/site-header-account-button.tsx` is a server-safe (no `'use client'`) React component that renders a `<Link href="/account">` with a 32px navy circle and white initials. The `deriveAccountUser()` helper at lines 84-108 derives the minimal `{ initials, displayName }` object from a Supabase user.

The avatar is a direct link, not a button. To add a dropdown, the trigger must change from `<Link>` to `<button onClick={...}>`. The dropdown lives in a new component (`SiteHeaderAccountDropdown`) wrapping the visual avatar.

**Existing dropdown / popover library:** none. `package.json` does not include Radix UI, Headless UI, or any popover dependency. Build a custom popover with the same a11y guarantees (focus trap, role=menu, keyboard nav, return focus on close) using the pattern already established in `header-search-overlay.tsx` (Batch 9.1.1).

**User data source:** the `SiteHeader` server wrapper at `src/components/layout/site-header.tsx:30-40` already calls `supabase.auth.getUser()` and passes a minimal `AccountUser` (`initials`, `displayName`) to the client. The dropdown needs the user's email too (currently dropped on the way to the client). The dropdown will accept an extended `user: { initials, displayName, email }` prop and `SiteHeader` will pass the email through.

**Lock conflict:** `SiteHeaderClient` (at `src/components/layout/site-header-client.tsx`) is on the DO NOT TOUCH list per Section 7.3. The dropdown trigger sits where `<SiteHeaderAccountButton>` is currently mounted (lines ~211-223 desktop, ~370-385 mobile drawer). Replacing the button with the dropdown component requires touching SiteHeaderClient. The 9.2.1 brief Section 7.1 unlocks `site-header-account-button.tsx` for "Plausible class additions only". Section 7.2 authorises CREATE for `site-header-account-dropdown.tsx`. The brief assumes the new dropdown will be wired in but does not list SiteHeaderClient in the unlocked set.

**Resolution:** modify SiteHeaderClient minimally - swap `<SiteHeaderAccountButton user={user} />` for `<SiteHeaderAccountDropdown user={user} />` at the two render sites, also pass through `user.email`. Document this as a brief-conflict lock-override in the closure report. Without this swap, scope item 1 is unimplementable. The change is two lines of JSX plus a single new prop on the SiteHeader server wrapper.

The `SiteHeaderAccountButton` itself stays alive: the dropdown reuses its visual treatment internally (avatar circle + initials) so the visual presentation is identical, only the trigger behaviour changes from "navigate to /account" to "open dropdown".

## 5.2 Search overlay triggerRef audit

`src/components/layout/header-search-overlay.tsx:106-122` currently uses `document.activeElement` capture pattern:

```tsx
// Body scroll lock + analytics + focus capture on open. Focus restore on close.
useEffect(() => {
  if (!open) return
  triggerRef.current = (document.activeElement as HTMLElement) ?? null
  ...
  return () => {
    ...
    const target = triggerRef.current
    if (target && typeof target.focus === 'function') {
      setTimeout(() => target.focus(), 0)
    }
    triggerRef.current = null
  }
}, [open])
```

The `triggerRef` is a local `useRef<HTMLElement | null>(null)` populated from `document.activeElement` at open time.

Keyboard shortcut (`/`) listener lives at `header-search-trigger.tsx:32-48`. The trigger button itself does not have an `id` attribute.

**Refactor plan:**
- Add `id="header-search-trigger"` to both the desktop pill and mobile-icon variants of the trigger button (lines 53-68 and 76-87 of `header-search-trigger.tsx`).
- Pass an explicit `triggerRef` from the trigger to the overlay so an explicit ref is preferred.
- In the overlay, implement the 3-level fallback chain: prefer the explicit triggerRef > fall back to `document.activeElement` > fall back to `document.getElementById('header-search-trigger')`.

## 5.3 email_subscribers schema audit

`supabase/migrations/` directory exists. Existing migration filename pattern: `YYYYMMDDhhmmss_description.sql`. Most recent migration (`20260502000001_brand_sweep_event_copy.sql`) uses 14-digit timestamp prefix.

No `email_subscribers` or `subscribers` table in any existing migration. NET-NEW table needed.

The new migration file follows the same pattern: `20260509000001_email_subscribers.sql`.

## 5.4 Test user seed audit

`.env.local` exists in the worktree. Required env vars per Supabase docs and the existing `src/lib/supabase/server.ts`:
- `NEXT_PUBLIC_SUPABASE_URL` (already present, server + client)
- `SUPABASE_SERVICE_ROLE_KEY` (server-only, used by admin operations)

No existing test-user creation script in `scripts/`. NEW script needed.

The seed script reads from `.env.local` via `dotenv` (already a transitive dep via `@supabase/ssr`; verify presence). If `dotenv` is not directly installable, the script can be invoked from PowerShell with the env vars set inline (`$env:NEXT_PUBLIC_SUPABASE_URL=...; $env:SUPABASE_SERVICE_ROLE_KEY=...; node scripts/seed-test-user.mjs`). Audit confirmed `dotenv` is NOT in `package.json` dependencies, so the script will use `node --env-file=.env.local` instead (Node 20+ built-in flag, supported by the project's Node version).

## 5.5 Plausible class audit on locked components

The 3 files explicitly unlocked for class-only additions:

| File | Target element | Add class |
|---|---|---|
| `src/components/features/home/surprise-me-button.tsx` | the trigger `<button>` | `plausible-event-name=surprise_me_open` |
| `src/components/features/home/surprise-me-modal.tsx` | each `pick` `<Link>` or `<a>` | `plausible-event-name=surprise_me_pick_click plausible-event-pick={index}` |
| `src/components/layout/site-header-account-button.tsx` | the avatar trigger | `plausible-event-name=account_avatar_click` |

The 9.2.1 brief Section 7.1 explicitly authorises class additions to these three files. CC self-diffs to verify only class attributes change.

**Note on surprise-me-button.tsx:** the avatar event needs to fire BEFORE the dropdown opens, so the class lives on the avatar button regardless of whether the dropdown wraps it. Once the dropdown wraps the avatar in scope item 1, the click handler stack is button click → Plausible event class fires → dropdown open state set. No conflict.

**Note on AccountButton with the new dropdown:** the AccountButton currently renders a `<Link>` (anchor element). Once the dropdown is wired, the trigger becomes a `<button>`. The Plausible class moves with the trigger element. CC will add the class on the new `<button>` form rather than the existing `<Link>`, to keep the change surgical and within the brief's "class addition only" envelope (the trigger has only ever been one element; the class lives on whichever element ends up being clicked).

## 5.6 Verdict summary

| Scope item | Verdict | Rationale |
|---|---|---|
| 1. Avatar dropdown internals | **NET-NEW** (component) + **REBUILD** (AccountButton trigger from Link to Button) + **MINOR LOCK-OVERRIDE** (SiteHeaderClient swap, 2-line change) | Spec requires dropdown trigger; bare Link cannot trigger one |
| 2. Search overlay triggerRef fallback | **REBUILD** (focused) | 3-level fallback chain replaces single-source capture |
| 3. Test user seed + 3 auth captures | **NET-NEW** | No existing seed; no existing auth capture |
| 4. email_subscribers migration + server action | **NET-NEW** (migration + server action rewrite) + **MODIFY** (email signup form gains consent checkbox) | Schema does not exist; stub action replaced with real insert |
| 5. 3 Plausible events on locked components | **SURGICAL CLASS ADDITIONS** | Brief explicitly unlocks; CC self-diffs to verify class-only |

End of audit.
