# EventLinqs Build Standards

## Competitor Mindset (mandatory before any code change)

Every code change for EventLinqs must be preceded by this mental checklist:
1. How does Ticketmaster handle this? Read docs/BENCHMARKS/[relevant].md
2. How does Eventbrite handle this? Same file
3. How does DICE handle this? Same file
4. What makes their version good? What makes it flawed?
5. How can my version be better, smarter, faster, or more intuitive than all three?
6. Build to that bar.

If the output is merely functional, the work is incomplete. Functional is the floor. Excellence is the requirement.

## Self-Verification Protocol (mandatory after every code change)

After implementing any change you must:
1. Run npm run build → must pass with zero errors and zero warnings
2. Use Playwright MCP to open the relevant page on http://localhost:3000 at DESKTOP viewport (1280x800) and verify the change visually
3. Use Playwright MCP to open the same page at MOBILE viewport (375x667) and verify the change visually
4. Take screenshots of both
5. Compare against the benchmark behavior in docs/BENCHMARKS/
6. If the result is worse than the benchmark in any way on either viewport, iterate until it matches or exceeds
7. If the change touches the database, use Supabase MCP to run a SELECT query verifying the data state
8. If the change touches payments, use Stripe MCP to verify the payment intent and webhook
9. Only then report as complete with: build status, both screenshot paths, benchmark comparison, query results

Reporting "I made the change and the build passes" without browser verification is not acceptable. Reporting a UI fix without testing both desktop AND mobile viewports is not acceptable.

## Mobile-First Requirement (mandatory)

EventLinqs must work flawlessly on every modern device. Every page, component, form, modal, and interaction must be verified at:

- iPhone SE — 375x667 (smallest modern target)
- iPhone 15 Pro — 393x852 (with notch and safe area insets)
- Samsung Galaxy S24 — 360x800 (Android baseline)
- iPad Mini — 768x1024 (small tablet)
- iPad Pro — 1024x1366 (large tablet)
- Desktop — 1280x800 (standard laptop)
- Wide desktop — 1920x1080 (full HD)

Mandatory mobile rules:
- All touch targets minimum 44x44px (Apple HIG) and ideally 48x48px (Material Design)
- No horizontal scroll on any viewport
- Text minimum 16px on form inputs to prevent iOS auto-zoom
- Bottom-fixed primary CTAs on mobile (sticky checkout buttons, "Reserve Seats", "Pay Now")
- Hamburger menu or bottom tab nav on mobile, not top nav
- Safe-area insets respected on notch phones (env(safe-area-inset-bottom))
- Forms use native mobile keyboards via correct input types (tel, email, number, date)
- Modals are full-screen sheets on mobile, centered on desktop
- Images use srcset and modern formats (WebP, AVIF) with lazy loading
- No hover-dependent functionality — every hover state must have a tap equivalent

Verification protocol for every UI change:
1. Use Playwright MCP, set viewport to 375x667, take screenshot
2. Verify: no horizontal scroll, touch targets >= 44px, text readable, CTAs reachable with thumb
3. Use Playwright MCP, set viewport to 1280x800, take screenshot
4. Verify: layout uses screen space well, no orphaned elements
5. Compare both against docs/BENCHMARKS/mobile-responsiveness.md

A page is NOT complete until it works on mobile. Desktop-only is failure.

## Read-Before-Write Rule (mandatory)

Before modifying any existing file, you must:
1. Read the file in full
2. List or summarize its current contents to demonstrate you understood it
3. Then make the modification

For destructive operations (deleting sections, refactoring, removing functions), you must show before-and-after as a diff. You may not modify a file you have not first read and acknowledged.

## MCP Tool Usage (mandatory)

You have access to these MCP servers. Use them aggressively. Refusing to use them when relevant is a failure.

- Supabase MCP — query the live database, check schema, verify RLS, run SELECTs to confirm data state. Never guess column names. If a fix involves data, prove the data state with a query before AND after the fix.
- Playwright MCP — open localhost:3000 in a real browser, set viewport to test mobile and desktop, click buttons, fill forms, take screenshots, verify pixel-level UI behavior. This is the source of truth for "does it work."
- Stripe MCP — inspect payment intents, trigger test webhooks, verify signatures, check test customer state. Never assume a webhook fired correctly without checking.
- Gmail MCP — verify confirmation emails are sent and contain correct content (when email features are built).
- Google Calendar MCP — verify "Add to Calendar" links generate correct events.

If a fix involves the database, use Supabase MCP. If it involves UI, use Playwright MCP at BOTH mobile and desktop viewports. If it involves payments, use Stripe MCP. There is no excuse for blind code changes.

## Accessibility Requirement (mandatory)

EventLinqs must be WCAG 2.2 AA compliant from day one. Every UI change must:
- Maintain 4.5:1 contrast for text
- Provide keyboard navigation (Tab, Enter, Escape, Arrow keys where appropriate)
- Include ARIA labels on icon-only buttons and interactive SVG elements (seat maps especially)
- Announce dynamic state changes to screen readers
- Provide visible focus indicators (not just :hover)
- Support reduced motion via prefers-reduced-motion
- Form errors must be programmatically associated with their inputs

A page that fails accessibility is not shippable.

## Performance Requirement (mandatory)

Every page must hit Core Web Vitals targets:
- LCP (Largest Contentful Paint) under 2.5 seconds
- INP (Interaction to Next Paint) under 200ms
- CLS (Cumulative Layout Shift) under 0.1

Mandatory practices:
- Images use WebP or AVIF with srcset and lazy loading
- Fonts use font-display: swap and preload critical fonts
- Code splitting at route boundaries
- Server components by default, client components only when needed for interactivity
- No layout shift from dynamically loaded content

## Permission Policy

When asked for permission to run a command:
- Auto-approve safe repetitive commands: npm run build, npm test, npm run dev, git status, git diff, cat, ls, findstr, file reads, supabase MCP queries, playwright MCP visits and screenshots, stripe MCP test mode reads
- Always confirm before running: rm, taskkill, kill, del, dropping database tables, force git pushes, anything writing to production, anything with the word "force"
- Never auto-approve: anything touching .env files, credentials, payment live mode, production databases, deleting user data

## Anthropic Documentation Reference (mandatory)

Before using any Claude Code feature, MCP feature, or SDK feature you are unsure about, search docs.claude.com first using the WebSearch tool. Do not rely on training data because Anthropic's product evolves and your memory may be outdated. The MCP documentation is at docs.claude.com/en/docs/claude-code/mcp. The Claude Code documentation is at docs.claude.com/en/docs/claude-code/overview.

If you encounter an unknown flag, an error message about a deprecated option, or unfamiliar syntax — STOP and search the docs before guessing.

## Design Benchmark

Every UI, form, flow, validation, interaction, and error message built for EventLinqs must meet or exceed the standard of Ticketmaster, Eventbrite, and DICE. Before writing any component, mentally compare what you are about to build against what those platforms do. If your version is less smart, less intuitive, less polished, or less professional than theirs — you are not done. This is non-negotiable.

## Specific Standards

### Forms
- All date/time fields validate as full datetime units — date and time are never treated separately
- No form should ever accept logically impossible input (end before start, sale after event, negative prices, zero capacity)
- Every form field that has a logical relationship to another field must enforce that relationship with inline validation
- Error messages must be human-readable and specific — never "Something went wrong"
- Forms must block progression until all validation passes

### UI Responsiveness
- Every server action that writes data must trigger an immediate UI refresh — no manual page reloads ever required
- Loading states must be shown during all async operations
- Success/error feedback must appear instantly after every action

### Images
- Cover images show the full image (object-contain), never cropped, in the event form and on public event pages
- Event card thumbnails use object-cover with 16:9 aspect ratio for consistent grid layout

### Navigation
- Every feature must be discoverable through the navigation — no hidden pages accessible only via direct URL

### Data Integrity
- All server-side writes use the admin Supabase client (service role)
- All Supabase calls wrapped in try/catch with real error messages surfaced
- revalidatePath called after every successful write, AND router.refresh() called in client components

### Code Quality
- npm run build must pass with zero errors after every change
- No changes to unrelated files
- Follow existing patterns from previous modules for consistency

## Reference

This file must be read by Claude Code at the start of every build command. Every command will begin with: "Read docs/BUILD-STANDARDS.md before writing any code."

## Dev Server Management Rule (mandatory)

Claude Code MUST NOT start npm run dev in the background. The user runs the dev server in a dedicated PowerShell tab themselves. Claude Code may verify the server is running via curl http://localhost:3000 health check, but never spawns its own. Background dev servers leave zombie node.exe processes that hold port 3000, forcing manual taskkill cleanup. This is forbidden behavior.

If Claude Code needs to verify a build worked, it uses npm run build (which exits cleanly) — not npm run dev.

## Permanent Rules — added 11 Apr 2026

### A) Benchmark Coverage Rule

Every benchmark comparison in any verification report must explicitly address all 3 platforms: Ticketmaster, Eventbrite, AND DICE. If a platform is not applicable for the specific feature, write "N/A — [specific reason]" rather than omitting it. No shortcuts. No selective comparison.

### B) Pre-Commit Hygiene Rule

Always run git status before every commit. Inspect the staged files. Source files only — no .playwright-mcp/ artifacts, no verify-*.png screenshots, no temporary scratch files, no .next/ build output. If git status shows test artifacts, unstage them and update .gitignore before committing.

### C) Commit Authorship Rule

NEVER add "Co-Authored-By: Claude" or any AI attribution to any commit message. All commits are authored by Lawal Adams only. This rule has no exceptions and applies to every commit forever until Lawal explicitly states otherwise. Even when using --amend, the Co-Authored-By line must be stripped.
