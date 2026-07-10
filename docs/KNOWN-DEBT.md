# Known debt (tracked, do not forget)

Deliberate, named shortcuts taken with a clear reason and a clear payback. Each
entry: what, why it was deferred, the fix, and the trigger to do it.

## DEBT-1: `arts-culture` event-category slug contains the banned word "culture"

- **What.** The live `event_categories` taxonomy still carries the slug
  `arts-culture` (and the image-spine storage path `categories/arts-culture`,
  plus `categories/arts`). The constitution permanently bans "culture" in every
  form, including slugs, identifiers, and data (see CLAUDE.md, Copy and banned
  content). The community-first lookup slug is already `arts-community`; only the
  underlying DB category slug and the physical storage object names still use the
  culture-era name.
- **Why deferred.** Renaming the category slug is a data migration with FK and
  cache implications (events reference the category id, not the slug, so the id
  is stable, but the slug is used in routes/filters and the spine path). The
  national seed (2026-06-28) intentionally uses the existing `arts-culture` slug
  for FK correctness rather than silently creating a divergent category. Renaming
  the storage objects is a founder-gated Production-storage migration (currently
  HELD, see the spine.ts note).
- **The fix.** (1) Migration: add the community-first category (`arts-community`
  or `arts-theatre`), repoint events, retire `arts-culture`; OR rename the slug
  in place with a redirect. (2) Update `src/lib/images/spine.ts` storage paths
  once the bucket objects are re-uploaded community-first. (3) Re-run the
  zero-match `culture` grep gate.
- **Trigger.** The category-taxonomy cleanup pass, or whenever the banned-word
  grep gate is wired into CI as blocking. Must be cleared before the
  Production-storage rename is executed.
