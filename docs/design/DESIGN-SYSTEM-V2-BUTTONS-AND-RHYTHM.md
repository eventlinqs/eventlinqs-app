# EventLinqs — Button & Section Rhythm System

**Purpose:** eliminate static, dead-feeling UI. Every interactive element must respond. Every page must have visual rhythm.
**Reference bar:** Ticketmaster, DICE, Resident Advisor. We match or exceed.

---

## 1. The Problem We're Solving

Right now, buttons look identical in every state. There's no feedback on hover, no feedback on click, no feedback on focus. That alone makes the platform feel amateur — the user's brain notices even if they can't articulate why. Similarly, every section has the same background, so the page reads as one flat wall of content instead of a deliberate composition.

Ticketmaster, DICE, RA, and every serious event platform solve this with two techniques: **stateful buttons** and **alternating section rhythm**. We implement both.

---

## 2. Button State System

Every button in the app implements five states. No exceptions.

| State | Visual treatment | Purpose |
|---|---|---|
| **Default** | Base colour, base shadow, pointer cursor | Resting state |
| **Hover** | -5% brightness OR +5% saturation, shadow lifts (y+2, blur+4), 150ms ease-out | "This is clickable" |
| **Active (pressed)** | -10% brightness, shadow compresses (y-1, blur-2), scale 0.98, 80ms ease-in | Tactile press feedback |
| **Focus (keyboard)** | 2px ring in brand colour, 2px offset | Accessibility — visible keyboard nav |
| **Disabled** | 40% opacity, no cursor change, no hover response | "Not available right now" |

### 2.1 Token definitions (Tailwind + CSS vars)

Add to `app/globals.css` or equivalent:

```css
:root {
  /* Brand */
  --brand-primary: #0B0F1A;          /* EventLinqs near-black */
  --brand-accent: #FF5E3A;           /* warm accent — adjust to your actual brand */
  --brand-accent-hover: #E84A28;
  --brand-accent-active: #D13E1F;

  /* Surfaces */
  --surface-0: #FFFFFF;              /* base page */
  --surface-1: #F7F7F9;              /* alternating section */
  --surface-2: #EEEEF2;              /* cards on surface-1 */
  --surface-dark: #0B0F1A;           /* hero / dark sections */

  /* Text */
  --text-primary: #0B0F1A;
  --text-secondary: #4A4A55;
  --text-muted: #8A8A95;
  --text-on-dark: #F7F7F9;

  /* Shadows — the rhythm of depth */
  --shadow-sm:  0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md:  0 4px 6px -1px rgb(0 0 0 / 0.08), 0 2px 4px -2px rgb(0 0 0 / 0.05);
  --shadow-lg:  0 10px 15px -3px rgb(0 0 0 / 0.10), 0 4px 6px -4px rgb(0 0 0 / 0.08);
  --shadow-xl:  0 20px 25px -5px rgb(0 0 0 / 0.12), 0 8px 10px -6px rgb(0 0 0 / 0.10);

  /* Motion */
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in:  cubic-bezier(0.7, 0, 0.84, 0);
  --dur-fast: 80ms;
  --dur-base: 150ms;
  --dur-slow: 300ms;
}
```

### 2.2 Button component spec

Three button variants. Use the same state logic for all three — only the base colour changes.

```tsx
// components/ui/Button.tsx

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

const base = `
  inline-flex items-center justify-center gap-2
  font-medium rounded-lg
  transition-all duration-150 ease-out
  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--brand-accent)]
  active:scale-[0.98] active:duration-[80ms]
  disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none
`;

const variants = {
  primary: `
    bg-[var(--brand-accent)] text-white shadow-md
    hover:bg-[var(--brand-accent-hover)] hover:shadow-lg hover:-translate-y-0.5
    active:bg-[var(--brand-accent-active)] active:shadow-sm active:translate-y-0
  `,
  secondary: `
    bg-[var(--surface-2)] text-[var(--text-primary)] shadow-sm
    hover:bg-[var(--surface-1)] hover:shadow-md hover:-translate-y-0.5
    active:bg-[var(--surface-2)] active:shadow-sm active:translate-y-0
  `,
  ghost: `
    bg-transparent text-[var(--text-primary)]
    hover:bg-[var(--surface-1)]
    active:bg-[var(--surface-2)]
  `,
};

const sizes = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-4 text-base',
  lg: 'h-12 px-6 text-base',
};
```

### 2.3 Where each variant is used

- **Primary** → "Get Tickets", "Sign up", "Create Event", "Publish" — the one most important action per screen.
- **Secondary** → "Learn more", "Save draft", "Cancel" — important but not primary.
- **Ghost** → nav links, table row actions, dismissals.

**Rule:** never put two primary buttons in the same visual zone. If you feel the urge, one of them is actually secondary.

---

## 3. Section Rhythm Pattern

Every long-scroll page (homepage, events listing, event detail, dashboard overview) alternates section backgrounds. This creates visual rhythm and makes each section feel like a deliberate composition.

### 3.1 The three surfaces

| Surface | Token | Use for |
|---|---|---|
| **Surface 0** (white/lightest) | `--surface-0` | Base page, default cards |
| **Surface 1** (off-white) | `--surface-1` | Every second section |
| **Dark** (near-black) | `--surface-dark` | Hero, special emphasis sections, footer |

### 3.2 The homepage rhythm (reference pattern)

```
[ HERO — dark, video background ]
[ FEATURED — surface 0, mini-rail of 4 events ]
[ TRENDING NOW — surface 1, horizontal rail ]
[ CULTURE PICKS — surface 0, editorial rail ]
[ CITY GUIDE — surface 1, grid ]
[ FOR ORGANISERS — surface 0, split CTA ]
[ FOOTER — dark ]
```

Same pattern applies to `/events` and event detail — alternate dark hero → light content → off-white secondary content → light → dark footer.

### 3.3 Section container component

```tsx
// components/layout/Section.tsx
// Enforces consistent vertical rhythm and surface switching.

type SurfaceName = 'base' | 'alt' | 'dark';

const surfaces: Record<SurfaceName, string> = {
  base: 'bg-[var(--surface-0)] text-[var(--text-primary)]',
  alt:  'bg-[var(--surface-1)] text-[var(--text-primary)]',
  dark: 'bg-[var(--surface-dark)] text-[var(--text-on-dark)]',
};

export function Section({
  surface = 'base',
  children,
  className = '',
}: {
  surface?: SurfaceName;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`${surfaces[surface]} py-16 md:py-20 lg:py-24 ${className}`}>
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
        {children}
      </div>
    </section>
  );
}
```

Vertical padding: `py-16` mobile, `py-20` tablet, `py-24` desktop. This is the rhythm spacing. Nothing uses custom `py-*` values outside this component.

---

## 4. Card Depth System

Cards are the most-seen component on the platform. They need depth that responds.

| State | Shadow | Transform |
|---|---|---|
| Default | `shadow-md` | none |
| Hover | `shadow-xl` | `-translate-y-1` |
| Focus (keyboard) | `shadow-xl` + 2px ring | `-translate-y-1` |
| Active (pressed) | `shadow-sm` | `translate-y-0` |

```tsx
// Tailwind classes for an EventCard
className={`
  group relative overflow-hidden rounded-2xl bg-[var(--surface-0)]
  shadow-md transition-all duration-200 ease-out
  hover:shadow-xl hover:-translate-y-1
  focus-visible:shadow-xl focus-visible:-translate-y-1
  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]
  active:shadow-sm active:translate-y-0 active:duration-75
  cursor-pointer
`}
```

Image inside the card also responds: `group-hover:scale-105 transition-transform duration-500 ease-out`.

---

## 5. Accessibility Requirements (non-negotiable)

- **Focus rings must be visible** on keyboard nav. Never remove `:focus-visible` styles.
- **Contrast ratios**: 4.5:1 for body text, 3:1 for large text. Verify every text/background pair.
- **Touch targets**: minimum 44×44px. No tiny icon-only buttons on mobile.
- **Motion respect**: honour `prefers-reduced-motion` — wrap scale/translate transitions in a media query.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 6. Claude Code Command — Implement Everywhere

Paste into Claude Code in the `eventlinqs-app` project after reading this doc:

```
Read docs/design/BUTTON-AND-RHYTHM-SYSTEM.md in full.

Implement across the entire app:

1. Add all CSS custom properties from Section 2.1 to app/globals.css.
2. Replace or create components/ui/Button.tsx using the spec in Section 2.2. Support variants primary|secondary|ghost and sizes sm|md|lg. Ensure all five states (default/hover/active/focus/disabled) work as specified.
3. Create components/layout/Section.tsx per Section 3.3.
4. Update every existing button in the codebase to use the new Button component. Audit these directories at minimum: app/, components/. Remove any ad-hoc <button className="..."> tags that duplicate Button's logic.
5. Update the homepage (app/page.tsx) to wrap each top-level section in <Section surface="base|alt|dark"> following the rhythm in Section 3.2.
6. Update the events listing page (app/events/page.tsx) and event detail page (app/events/[slug]/page.tsx) to use Section wrappers.
7. Update EventCard (wherever it lives) to match Section 4 card depth spec.
8. Add the prefers-reduced-motion media query from Section 5 to globals.css.
9. Verify no page uses inline hex colours for brand colours — everything reads from CSS vars.
10. Run npm run build. Fix any type or lint errors. Commit with message: "feat(design): unified button state system + section rhythm across all pages".

Do not touch business logic, Supabase queries, Stripe code, or Redis code. Design-layer only.

When done, list every file changed and every button/section that was migrated.
```

---

## 7. Verification Checklist (run after the command finishes)

- [ ] Every button hovers, presses, and shows focus ring.
- [ ] Homepage has 7 distinct sections with alternating backgrounds.
- [ ] Event cards lift on hover with shadow change.
- [ ] `/events` page uses Section components — no raw `<div className="py-...">`.
- [ ] Event detail page uses Section components.
- [ ] No inline hex colours in any JSX file (grep for `#` in className strings).
- [ ] Keyboard Tab navigation shows visible focus on every interactive element.
- [ ] `npm run build` passes with zero errors.
- [ ] Lighthouse a11y score ≥ 95 on homepage.

---

**Once this ships, the platform will feel like a platform. Not a prototype.**
