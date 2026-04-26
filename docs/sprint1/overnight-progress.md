# Overnight Autonomous Execution - Pre-Task 2 Close-out

Started: 2026-04-26 (overnight session, Lawal asleep)

## Plan
1. Checkpoint 3: V11 (CityRailTile), V12 (DashboardTopbar), V13 (UpcomingEventsPanel), V14 (CityTile)
2. MEDIUM severity refactors per docs/MEDIA-INCONSISTENCIES.md
3. Delete SmartMedia + remove from ESLint exemption list
4. Generate docs/sprint1/pre-task-2-close-report.md
5. BONUS 1: CLAUDE.md architecture standards update
6. BONUS 2: em-dash / en-dash codebase scrub
7. BONUS 3: visual regression gallery HTML

## Progress

### V11 - CityRailTile (HIGH) - COMPLETE
- Commit: 862018a
- Refactor: direct next/image -> CityTileImage media surface
- ESLint exemptions: 8 -> 7
- 7 BEFORE + 9 AFTER screenshots (7 fullPage + 2 rail-focus viewport captures at 1280 and 1920 to compensate for content-visibility:auto fullPage paint deferral)
- Gates: lint clean, tsc clean, build green
- Pushed to origin

### V12 - DashboardTopbar avatar (HIGH) - COMPLETE
- Commit: 58cc545
- Refactor: raw <img> + eslint-disable -> OrganiserAvatar (avatar branch only)
- Preserved original initials span (bg-ink-900 text-white) for the no-avatar branch to keep exact dashboard styling
- Verification: gates-only (auth-gated component, no public render surface for visual regression)
- Gates: lint clean, tsc clean, build green
- Pushed to origin

### V13 - UpcomingEventsPanel thumb (HIGH) - COMPLETE
- Commit: 90da0cd
- Refactor: raw <img> + eslint-disable -> EventCardMedia variant="rail" (added relative wrapper for fill mode)
- Verification: gates-only (auth-gated dashboard panel)
- Gates: lint clean, tsc clean, build green
- Pushed to origin

### V14 - CityTile (HIGH) - COMPLETE
- Commit: 9ae53ea
- Refactor: raw <img> + eslint-disable -> CityTileImage media surface
- Verification: gates-only (no production consumers; reserved for M5 cities directory)
- Gates: lint clean, tsc clean, build green
- Pushed to origin

### Checkpoint 3 close
- All 10 HIGH severity components migrated (V1-V4 hero, V5 EventBentoTile, V6 EventCard, V7 ThisWeekStrip+Card, V8 FreeWeekendTile, V9 EventDetailHero, V10 LiveVibeMarquee, V11 CityRailTile, V12 DashboardTopbar, V13 UpcomingEventsPanel, V14 CityTile)
- ESLint exemption list count: 10 -> 7 (transitional entries remaining: smart-media.tsx, CategoryHeroEmpty.tsx, event-form.tsx, event-sold-out.tsx, queue/**, squad/**, dashboard/events/**)

### MEDIUM severity (M-V11, M-V13) - COMPLETE
- Commit: fd051c1
- next.config.ts qualities: [70, 75, 85] added (closes V11 , quality prop now constrained at build time, mirroring MEDIA_QUALITY tiers)
- next.config.ts remotePatterns: videos.pexels.com removed (closes V13 , dead config surface)
- Gates: lint clean, tsc clean, build green
- Pushed to origin

### SmartMedia deletion - COMPLETE
- Commit: 2559d91
- Zero consumers remained in src/ after V1-V10 hero/tile migrations
- File deleted: src/components/ui/smart-media.tsx
- Removed from ESLint no-restricted-imports exemption list (7 -> 6 entries)
- Implicitly closes V6 (quality 75 magic numbers at smart-media.tsx:134,159) and the smart-media half of V10 (transition string at smart-media.tsx:139)
- Gates: lint clean, tsc clean, build green
- Pushed to origin

### MEDIUM severity (M-V14) - COMPLETE
- Commit: 67334f8
- BrandedPlaceholder moved: src/components/ui/branded-placeholder.tsx -> src/components/media/decorative/branded-placeholder.tsx
- Re-exported via media barrel; 5 feature import callsites updated (event-bento-tile, free-weekend-tile, live-vibe-marquee, this-week-card, this-week-strip)
- Closes V14 , decorative gradient inline-style now scoped under the media library's permanent ESLint exemption rather than relying on the no-restricted-syntax url(...) regex
- Gates: lint clean, tsc clean, build green
- Pushed to origin

### MEDIUM severity (M-V10 remainder) - COMPLETE
- Commit: 8c6e834
- transitions.ts: added heroCarouselFadeMs (700ms) alongside existing carouselFadeMs (900ms). Distinct values intentional , hero uses tighter fade against priority slide-0 LCP layer.
- hero-carousel-client.tsx: Tailwind transition-opacity duration-700 ease-out class -> inline transition referencing MEDIA_TRANSITIONS.heroCarouselFadeMs (no visual change)
- Closes V10 in full (smart-media.tsx half closed by SmartMedia deletion at 2559d91)
- Gates: lint clean, tsc clean, build green
- Pushed to origin

### Pre-Task 2 close
- HIGH severity (V1-V14): COMPLETE (10 components migrated)
- MEDIUM severity (V6, V10, V11, V13, V14): COMPLETE
- SmartMedia: DELETED
- ESLint exemption list count: 10 -> 6 (transitional entries remaining: CategoryHeroEmpty.tsx, event-form.tsx, event-sold-out.tsx, queue/**, squad/**, dashboard/events/**)

