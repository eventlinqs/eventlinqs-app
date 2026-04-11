# Benchmark: Mobile Responsiveness

## Overview

Mobile-first is not a slogan — it is a technical requirement. In 2026, more than 70% of event ticket purchases begin on mobile. In Africa (an EventLinqs primary market), this number exceeds 90%, with many users on Android devices on 3G/4G connections with limited RAM. This document defines exactly what "mobile-first" means for EventLinqs: specific breakpoints, device profiles, touch target sizes, and interaction patterns.

---

## Target Device Profiles

Every page and component must be verified at these exact dimensions:

| Device | Viewport (px) | Notes |
|--------|--------------|-------|
| iPhone SE (3rd gen) | 375×667 | Smallest modern Apple target; no notch |
| iPhone 15 Pro | 393×852 | Dynamic Island; safe area insets required |
| iPhone 15 Pro Max | 430×932 | Large iPhone; tests layout at iPhone's widest |
| Samsung Galaxy S24 | 360×780 | Android baseline; most common Android form factor |
| Google Pixel 8 | 393×851 | Stock Android reference |
| iPad Mini (6th gen) | 768×1024 | Small tablet; often used in portrait for events |
| iPad Pro 11" | 834×1194 | Medium tablet; landscape and portrait |
| Desktop laptop | 1280×800 | Standard laptop screen |
| Desktop wide | 1920×1080 | Full HD monitor |

**Playwright MCP viewport commands to use:**
```
375x667  → iPhone SE
393x852  → iPhone 15 Pro
360x780  → Samsung Galaxy S24
768x1024 → iPad Mini
1280x800 → Laptop
1920x1080 → Desktop
```

---

## Breakpoint System

EventLinqs uses Tailwind CSS breakpoints:

| Name | Min Width | Target Devices |
|------|-----------|---------------|
| (default — mobile) | 0px | iPhone SE, all phones |
| `sm` | 640px | Large phones landscape, old tablets |
| `md` | 768px | iPad Mini portrait |
| `lg` | 1024px | iPad Pro, small laptops |
| `xl` | 1280px | Laptops |
| `2xl` | 1536px | Wide monitors |

**Rule:** Write mobile styles first (the default, no prefix), then add `md:`, `lg:`, `xl:` overrides. Never write desktop-first CSS.

---

## Touch Target Requirements

**Minimum:** 44×44px — Apple Human Interface Guidelines
**Recommended:** 48×48px — Google Material Design
**Critical:** No touch target smaller than 44px in any axis, on any tested device

### Applying to specific elements:

**Buttons:**
- All `<button>` elements: minimum `h-11` (44px) in Tailwind
- Primary CTA buttons: `h-12` (48px) or larger
- Icon-only buttons: 44×44px, with visible focus ring

**Links in navigation:**
- Nav menu items: minimum 44px height, full-width tap target
- Bottom tab bar icons: 64px tap zone (even if icon is 24px)

**Form inputs:**
- Minimum height: 44px (`h-11`)
- Full-width on mobile unless layout explicitly requires side-by-side (and only when 375px wide allows it)

**Seat map seats:**
- In overview (section-level): section polygons must have minimum bounding box of 44×44px
- In zoomed section view: individual seats must be minimum 24px diameter, but add invisible padding to create 44×44px tap target via CSS `::after` or wrapper element

**Checkboxes and radio buttons:**
- Wrap in label with `min-h-[44px] min-w-[44px]` — the entire label area is the tap target
- Do not rely on just the 16px checkbox itself

---

## No Horizontal Scroll Rule

No page, at any target viewport width, may have horizontal scroll. This is a zero-tolerance rule.

**Common causes to prevent:**
- Fixed-width elements (e.g., `width: 500px` on an element inside a 375px container)
- Long unbroken text strings without `overflow-wrap: break-word`
- Tables without horizontal scroll container: use `overflow-x-auto` on a table wrapper
- Images wider than their container: always use `max-width: 100%` or `w-full` on images
- CSS Grid with `minmax` that produces columns wider than viewport
- Third-party embeds without responsive wrappers

**Detection:** Use Playwright MCP to take a screenshot at 375px width and inspect. Any content visually cut off or with a scrollbar indicates violation.

---

## Navigation Patterns

### Mobile Navigation (≤768px)
- Bottom tab bar with 4–5 items (primary navigation)
- OR hamburger menu that slides in from left (for secondary navigation)
- EventLinqs uses bottom tab bar for attendee-facing pages (Discovery, Search, Tickets, Account)
- Hamburger for organiser dashboard sidebar items on mobile

**Bottom tab bar requirements:**
- Fixed to bottom: `fixed bottom-0 left-0 right-0`
- Background: white/surface color with top border
- Safe area inset: `padding-bottom: env(safe-area-inset-bottom)` — critical for iPhone notch/Dynamic Island devices
- Icons: 24px, labels: 10–12px below icons
- Total bar height: 56px + safe area inset

### Desktop Navigation (≥768px)
- Horizontal top nav (public pages)
- Left sidebar (organiser dashboard)
- No hamburger on desktop — always show full nav

---

## Safe Area Insets (Notch Phones)

iPhone 15 Pro has a Dynamic Island, iPhone 14 has a notch. Both require safe area insets.

**Required CSS (apply to fixed bottom elements):**
```css
padding-bottom: env(safe-area-inset-bottom);
/* or */
padding-bottom: max(16px, env(safe-area-inset-bottom));
```

**Apply to:**
- Bottom tab navigation bar
- Fixed "Pay Now" / "Reserve Seats" bottom CTA buttons
- Bottom sheet drawers
- Toast/snackbar notifications positioned at bottom

**Tailwind implementation:**
```
pb-safe  /* custom utility, add to tailwind.config.js via plugin */
```

Or use: `className="pb-4 pb-[env(safe-area-inset-bottom)]"` though this doesn't work as expected — better to add a custom Tailwind plugin:
```js
// tailwind.config.js
plugins: [
  function({ addUtilities }) {
    addUtilities({
      '.pb-safe': { 'padding-bottom': 'env(safe-area-inset-bottom)' },
      '.pt-safe': { 'padding-top': 'env(safe-area-inset-top)' },
    })
  }
]
```

---

## Form Inputs on Mobile

**iOS auto-zoom rule:** iOS Safari auto-zooms inputs with `font-size < 16px`. This is jarring and breaks layout.

**Rule:** All form `<input>`, `<select>`, and `<textarea>` elements must have `text-base` (16px) or larger font size. Use `text-base` class on all inputs.

**Correct input types for mobile keyboards:**
| Input | Type to use | Mobile keyboard |
|-------|------------|-----------------|
| Email | `type="email"` | Email keyboard with @ key |
| Phone | `type="tel"` | Numeric dial pad |
| Number (price, qty) | `type="number"` | Numeric keyboard |
| Date | Use custom picker | Native date picker works but looks different per platform |
| Search | `type="search"` | Keyboard with search/return |

**Autocomplete attributes for faster form fill:**
```html
<input autocomplete="given-name" />  <!-- First name -->
<input autocomplete="email" />        <!-- Email -->
<input autocomplete="cc-number" />    <!-- Card number -->
<input autocomplete="cc-exp" />       <!-- Card expiry -->
<input autocomplete="cc-csc" />       <!-- CVV -->
```

---

## Bottom-Fixed CTAs

On mobile, primary action buttons must be **fixed to the bottom** of the screen — not scrolled off. This is the single highest-impact mobile conversion pattern.

**Pages requiring bottom-fixed CTAs:**
- Event detail page: "Get Tickets" or "Reserve Seats" (fixed bottom)
- Seat map page: "Checkout [2 seats — $190]" — dynamic price in CTA
- Checkout Step 1: "Continue to Payment" (fixed bottom)
- Checkout Step 2: "Pay Now — $190.00" (fixed bottom, includes total)
- Cart: "Checkout" (fixed bottom)

**Bottom CTA implementation:**
```jsx
<div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 pb-safe z-50">
  <Button className="w-full h-12 text-base">
    Reserve Seats
  </Button>
</div>
{/* Add bottom margin to page content to prevent overlap */}
<div className="pb-24" /> {/* 96px = 4px * 24 = enough for fixed bottom CTA */}
```

---

## Modals on Mobile

**Rule:** Modals must be full-screen sheets on mobile, centered overlays on desktop.

```jsx
// Tailwind: full-screen on mobile, centered modal on md+
<div className="fixed inset-0 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2
                w-full h-full md:w-[560px] md:h-auto md:max-h-[90vh]
                bg-white overflow-y-auto">
```

**Mobile modal close:** Swipe down (gesture) OR tap "X" button OR "Cancel" in header. Never require modal be closed by an action that changes state (always allow escape).

---

## Virtual Keyboard Handling

When the virtual keyboard opens on iOS/Android, it reduces the visible viewport height. Fixed-bottom elements may be obscured by the keyboard.

**Handling:**
- Do not use `position: fixed` on elements that need to be visible above the keyboard (like submit buttons when inside a focused form)
- Instead, use `position: sticky` with `bottom: 0` where possible — sticky is keyboard-aware
- For checkout modals with payment forms: test explicitly on a real device or Playwright emulator

Use `window.visualViewport` API to detect keyboard presence:
```js
window.visualViewport.addEventListener('resize', () => {
  // keyboard is open when visualViewport.height < window.innerHeight
})
```

---

## Orientation Handling

All pages must work in both portrait and landscape on mobile:

- Seat map: must be usable in landscape on phone (wider canvas = more of the map visible)
- Event detail page: landscape on iPhone shows shorter hero image, content starts sooner
- Checkout: must not break in landscape

Use `min-h-screen` not `h-screen` to prevent content being cut off when content exceeds viewport.

---

## Image Optimization for Mobile

```jsx
<Image
  src={event.imageUrl}
  alt={event.name}
  width={800}
  height={450}
  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
  className="w-full aspect-video object-cover"
  loading="lazy"    // below fold
  // loading="eager" for above-fold images (first card, hero)
/>
```

- Use `WebP` format (Supabase Storage serves WebP if configured, or use Cloudflare Images)
- Use `AVIF` as primary with `WebP` fallback via `<picture>` tag for best compression
- Never load full-resolution image on mobile when a 400px wide card is displayed

---

## Africa-Specific Mobile Considerations

EventLinqs is Africa-ready. This means:

- **Low bandwidth:** All images must lazy-load. Total page weight for events listing < 500KB on first load (before images load).
- **Feature phones / older Android:** Support Chrome 80+ (not just latest). Avoid CSS features not available in Chrome 80.
- **Mobile money:** UI for mobile money payment (M-Pesa, MTN Mobile Money) must look native — a phone number input with carrier auto-detection, not a card form
- **WhatsApp sharing:** "Share on WhatsApp" must be a prominent share option — more important than Facebook for African markets. WhatsApp share link: `https://wa.me/?text=[encoded-message]`
- **Offline resilience:** The confirmation page and ticket QR code must be available offline (cached via Service Worker) — some users attend events in areas with no signal
