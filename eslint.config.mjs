import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Underscore-prefixed identifiers are a well-established "intentionally
      // unused" convention (positional destructures, ignored callback args,
      // rest-tuple placeholders). Tell the unused-vars rule to honour it
      // everywhere so we don't drown in warnings for deliberate omissions.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          args: "after-used",
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  // ────────────────────────────────────────────────────────────────────────
  // MEDIA ARCHITECTURE ENFORCEMENT
  //
  // Rules that enforce docs/MEDIA-ARCHITECTURE.md across the platform.
  //
  //   1. Raw <img> for content imagery is forbidden — use a media/ surface.
  //   2. background-image: url(...) is forbidden for content imagery.
  //   3. Direct `next/image` import is forbidden in feature code — feature
  //      code consumes only the media/ library.
  // ────────────────────────────────────────────────────────────────────────
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      // Escalate from default "warn" to "error". Existing files use
      // eslint-disable comments which still work — those will be removed
      // during Pre-Task 2 refactor.
      "@next/next/no-img-element": "error",
      "no-restricted-syntax": [
        "error",
        {
          // Ban inline `style={{ backgroundImage: 'url(...)' }}` for content.
          // Decorative gradients (radial-gradient, linear-gradient) are NOT
          // matched. Template-literal URL strings (\`url(${x})\`) are not
          // caught by AST regex match — PR review covers that escape hatch.
          selector:
            "JSXAttribute[name.name='style'] Property[key.name='backgroundImage'][value.value=/url\\(/]",
          message:
            "background-image: url(...) is forbidden for content imagery. Use <HeroMedia> / <EventCardMedia> / etc. See docs/MEDIA-ARCHITECTURE.md §11.",
        },
      ],
    },
  },
  // Block direct next/image imports in feature code — feature components
  // must consume the media/ library only. The media/ library itself, plus
  // the transitional list below, are exempt.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      // Permanent — the media library IS the wrapper layer.
      "src/components/media/**",
      // Transitional — refactored to media/ surfaces in Pre-Task 2.
      // Removing each entry from this list is the migration milestone.
      "src/components/ui/smart-media.tsx",
      "src/components/ui/CategoryHeroEmpty.tsx",
      "src/components/features/events/event-form.tsx",
      "src/components/features/events/event-sold-out.tsx",
      "src/components/features/events/live-vibe-marquee.tsx",
      "src/components/features/events/city-rail-tile.tsx",
      "src/components/features/events/event-card.tsx",
      // Square-bracket Next.js dynamic segments and parenthesized route
      // groups confuse minimatch — use `**` wildcards to traverse them.
      "src/app/queue/**",
      "src/app/squad/**",
      "src/app/**/dashboard/events/**",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "next/image",
              message:
                "Direct `next/image` is forbidden in feature code. Import from `@/components/media` (HeroMedia, EventCardMedia, CityTileImage, OrganiserAvatar, CategoryTileImage). See docs/MEDIA-ARCHITECTURE.md §11.",
            },
            {
              name: "next/legacy/image",
              message:
                "next/legacy/image is forbidden — use the modern next/image via @/components/media.",
            },
          ],
        },
      ],
    },
  },
  // The media/ library is allowed to do everything. Decorative gradient
  // exception in branded-placeholder.tsx is also allowed (no url() literal).
  {
    files: ["src/components/media/**"],
    rules: {
      "@next/next/no-img-element": "off",
      "no-restricted-syntax": "off",
      "no-restricted-imports": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "scratch/**",
  ]),
]);

export default eslintConfig;
