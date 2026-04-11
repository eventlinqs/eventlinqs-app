# Benchmark: Accessibility

## Overview

WCAG 2.2 AA compliance is non-negotiable for EventLinqs. Beyond the legal requirement (ADA in the US, Equality Act in the UK, DDA in Australia), accessibility is good product design. Keyboard navigation benefits power users. Screen reader support benefits the 285 million people globally with visual impairments. High contrast benefits users in sunlight on mobile. This document defines what compliance looks like in practice for EventLinqs.

---

## Color Contrast Requirements (WCAG 2.2 AA)

**Minimum contrast ratios:**
- Normal text (< 18pt or < 14pt bold): **4.5:1**
- Large text (≥ 18pt or ≥ 14pt bold): **3:1**
- UI components and graphical objects: **3:1**

**EventLinqs color audit:**

| Foreground | Background | Ratio | Pass/Fail |
|-----------|-----------|-------|----------|
| `#FFFFFF` (white) on `#1A1A2E` (navy) | — | 16.1:1 | ✓ Pass (buttons) |
| `#1A1A2E` (navy) on `#FAFAFA` (off-white) | — | 15.9:1 | ✓ Pass (body text) |
| `#4A90D9` (blue) on `#FAFAFA` (off-white) | — | 4.1:1 | ✗ Borderline — verify |
| `#6B7280` (grey) on `#FFFFFF` (white) | — | 4.6:1 | ✓ Pass (barely) |
| `#10B981` (green) on `#FFFFFF` (white) | — | 3.2:1 | ✗ Fail for normal text |

**Action items:**
- `#4A90D9` links on white background: darken to `#3478C5` for guaranteed AA compliance
- `#10B981` success green: only use on dark backgrounds or for large text/icons (not body text)
- `#6B7280` grey text: do not use at less than 14px size

Use the WebAIM Contrast Checker or axe DevTools browser extension to verify all new color pairings.

---

## Keyboard Navigation

Every interactive element must be reachable and operable via keyboard alone.

**Tab order rules:**
- Tab order must follow visual reading order (top-to-bottom, left-to-right)
- Modal: when opened, focus moves to first interactive element inside modal. Tab cycles within modal. Escape closes modal and returns focus to trigger element.
- Dropdown menus: Arrow Down to open, Arrow Up/Down to navigate options, Enter to select, Escape to close
- Seat map: Tab moves focus between sections. Arrow keys move between seats within a section. Enter to select/deselect.

**Focus indicators (visible):**
All focused elements must have a visible focus ring. Never use `outline: none` without replacement.

```css
/* EventLinqs focus style (add to globals.css) */
:focus-visible {
  outline: 2px solid #4A90D9;
  outline-offset: 2px;
  border-radius: 4px;
}
/* :focus-visible fires only on keyboard focus, not mouse click */
```

**Keyboard shortcuts:**
- `Tab` / `Shift+Tab`: forward/backward focus
- `Enter` / `Space`: activate buttons and checkboxes
- `Escape`: close modals, dialogs, dropdowns
- `Arrow keys`: navigate within composite widgets (seat map, date picker, tabs)
- `Home` / `End`: jump to first/last item in list

---

## Screen Reader Support

### ARIA Roles and Labels

**Icon-only buttons MUST have aria-label:**
```jsx
<button aria-label="Save event to wishlist">
  <HeartIcon className="w-5 h-5" />
</button>
```

**Images must have alt text:**
```jsx
<Image alt="Event poster for Summer Fest 2026 at Sydney Opera House" ... />
// OR for decorative images:
<Image alt="" role="presentation" ... />
```

**Seat map ARIA (critical — most complex component):**
```jsx
<div
  role="grid"
  aria-label="Seat map — Section A"
  aria-rowcount={rows.length}
>
  {rows.map((row) => (
    <div role="row" key={row.label} aria-label={`Row ${row.label}`}>
      {row.seats.map((seat) => (
        <button
          role="gridcell"
          key={seat.id}
          aria-label={`Row ${row.label} Seat ${seat.number} — $${seat.price} — ${seat.status}`}
          aria-pressed={seat.selected}
          aria-disabled={seat.status === 'sold'}
          disabled={seat.status === 'sold'}
        >
          {/* visual seat representation */}
        </button>
      ))}
    </div>
  ))}
</div>
```

**Live regions for dynamic content:**
When seat count updates, reservation timer counts down, or new content loads — screen readers must be notified:

```jsx
// Reservation timer
<div aria-live="polite" aria-atomic="true" className="sr-only">
  {`${minutesRemaining} minutes and ${secondsRemaining} seconds remaining to complete your purchase`}
</div>

// Tickets sold update
<div aria-live="polite">
  {ticketCount} tickets remaining
</div>
```

Use `aria-live="assertive"` only for urgent interruptions (payment failed, session expired). Use `aria-live="polite"` for non-urgent updates.

### Form Accessibility

```jsx
// Every input MUST have a label — never use placeholder as the only label
<label htmlFor="email" className="block text-sm font-medium text-gray-700">
  Email address <span aria-hidden="true">*</span>
  <span className="sr-only">(required)</span>
</label>
<input
  id="email"
  type="email"
  name="email"
  autoComplete="email"
  required
  aria-required="true"
  aria-describedby={error ? "email-error" : undefined}
  className="..."
/>
{error && (
  <p id="email-error" role="alert" className="mt-1 text-sm text-red-600">
    {error}
  </p>
)}
```

**Key rules:**
- Every `<input>` has a matching `<label>` via `htmlFor`/`id` — not just `placeholder`
- Error messages use `id` linked to `aria-describedby` on the input
- `role="alert"` or `aria-live="assertive"` on error messages so screen readers announce them immediately on appearance
- Required fields: `required` AND `aria-required="true"` AND visible indicator (asterisk with sr-only text)

---

## Skip Links

The first focusable element on every page must be a skip link:

```jsx
// In the root layout, before <header>
<a
  href="#main-content"
  className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4
             focus:z-50 focus:bg-white focus:px-4 focus:py-2 focus:rounded focus:shadow-lg"
>
  Skip to main content
</a>
```

And the main content area:
```jsx
<main id="main-content" tabIndex={-1}>
  {/* page content */}
</main>
```

The skip link is invisible until focused (Tab key) — does not affect visual layout.

---

## Reduced Motion

Users who have enabled "Reduce Motion" in their OS accessibility settings must not experience animations:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

**What this affects:**
- Seat map zoom animations (instant instead of animated)
- Page transition animations
- Loading skeleton shimmer (replace with static grey)
- Confetti/celebration on order confirmation (hide entirely)
- Countdown timer number flip (number changes without animation)

Verify with: DevTools → Rendering panel → Emulate CSS media feature: prefers-reduced-motion → reduce

---

## Ticketmaster Accessibility Failures (to avoid)

- Seat map SVG has almost no ARIA labels on individual seats — screen reader users cannot use the seat map
- Focus indicators are present but very subtle (1px thin outline)
- Filter chips on mobile have tap targets smaller than 44px
- Date pickers have poor keyboard navigation

## Eventbrite Accessibility Failures (to avoid)

- Rich text editor for event description traps keyboard focus (common issue with WYSIWYG editors)
- Some icon buttons have no aria-label
- Dynamic ticket quantity updates do not announce to screen readers

---

## Accessibility Testing Checklist

For every major page/component:

1. **axe DevTools** browser extension — run automated scan, zero critical/serious violations
2. **Keyboard-only navigation** — navigate entire flow with Tab, Arrow keys, Enter, Escape only
3. **Screen reader test** — VoiceOver (macOS/iOS) or NVDA (Windows) — read page and form flow
4. **Contrast check** — verify all text/background combinations with WebAIM Contrast Checker
5. **Zoom to 200%** — page must remain usable at 200% browser zoom, no content overlapping
6. **Reduced motion** — enable in OS, verify no forced animations

**Automated testing in CI:**
- Use `jest-axe` to run accessibility checks in unit tests:
```js
import { axe, toHaveNoViolations } from 'jest-axe'
expect.extend(toHaveNoViolations)

it('has no accessibility violations', async () => {
  const { container } = render(<EventCard event={mockEvent} />)
  const results = await axe(container)
  expect(results).toHaveNoViolations()
})
```
