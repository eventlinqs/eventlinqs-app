'use client'

import { useMemo, useState } from 'react'
import { FormSelect, FormField } from '@/components/forms/form-fields'
import { GENRES, getSubgenresForGenre, isGenreSlug } from '@/lib/genres/data'
import { resolveGenreSelection } from '@/lib/genres/resolve'
import { artistSlug } from '@/lib/artists/slug'

export type PickerArtist = {
  artist_id: string | null
  name: string
  billing_order: number
}

export type GenreArtistValue = {
  genre_slug: string | null
  subgenre_slug: string | null
  artists: PickerArtist[]
}

type ArtistOption = { id: string; name: string }

type Props = {
  value: GenreArtistValue
  onChange: (value: GenreArtistValue) => void
  /** Existing artists to search. Optional; the picker also allows creating new. */
  artistOptions?: ArtistOption[]
}

const CONTROL_BTN =
  'inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg border border-gray-300 text-textPrimary transition-colors hover:bg-background focus:ring-2 focus:ring-accent focus:border-accent outline-none disabled:opacity-40 disabled:cursor-not-allowed'

/**
 * Self-contained, controlled genre + sub-genre + artist lineup picker.
 *
 * Drop into any event form in one line:
 *   <GenreArtistPicker value={music} onChange={setMusic} artistOptions={artists} />
 *
 * Genre/sub-genre selection is funnelled through resolveGenreSelection so a
 * sub-genre always forces its parent genre and the two can never contradict -
 * the same authority the server action uses. Artists can be picked from the
 * supplied options or typed in to create on save (find-or-create by slug).
 */
export function GenreArtistPicker({ value, onChange, artistOptions = [] }: Props) {
  const [artistQuery, setArtistQuery] = useState('')

  const subgenres = useMemo(
    () => (value.genre_slug && isGenreSlug(value.genre_slug) ? getSubgenresForGenre(value.genre_slug) : []),
    [value.genre_slug],
  )

  const chosenSlugs = useMemo(
    () => new Set(value.artists.map((a) => (a.artist_id ? `id:${a.artist_id}` : `slug:${artistSlug(a.name)}`))),
    [value.artists],
  )

  const trimmedQuery = artistQuery.trim()
  const querySlug = artistSlug(trimmedQuery)

  const matches = useMemo(() => {
    if (!trimmedQuery) return []
    const q = trimmedQuery.toLowerCase()
    return artistOptions
      .filter((o) => o.name.toLowerCase().includes(q) && !chosenSlugs.has(`id:${o.id}`))
      .slice(0, 6)
  }, [trimmedQuery, artistOptions, chosenSlugs])

  // Offer a create row when the typed name is not an exact existing match and
  // is not already in the lineup.
  const canCreate =
    querySlug.length > 0 &&
    !chosenSlugs.has(`slug:${querySlug}`) &&
    !artistOptions.some((o) => artistSlug(o.name) === querySlug)

  function handleGenreChange(slug: string) {
    if (!slug || !isGenreSlug(slug)) {
      onChange({ ...value, genre_slug: null, subgenre_slug: null })
      return
    }
    // Keep the current sub-genre only if it still belongs to the new genre.
    const stillValid = getSubgenresForGenre(slug).some((s) => s.slug === value.subgenre_slug)
    const resolved = resolveGenreSelection(slug, stillValid ? value.subgenre_slug : null)
    onChange({ ...value, genre_slug: resolved.genre_slug, subgenre_slug: resolved.subgenre_slug })
  }

  function handleSubgenreChange(slug: string) {
    const resolved = resolveGenreSelection(value.genre_slug, slug || null)
    onChange({ ...value, genre_slug: resolved.genre_slug, subgenre_slug: resolved.subgenre_slug })
  }

  function addArtist(artist: { artist_id: string | null; name: string }) {
    const next = [...value.artists, { ...artist, billing_order: value.artists.length }]
    onChange({ ...value, artists: renumber(next) })
    setArtistQuery('')
  }

  function removeArtist(index: number) {
    const next = value.artists.filter((_, i) => i !== index)
    onChange({ ...value, artists: renumber(next) })
  }

  function move(index: number, delta: number) {
    const target = index + delta
    if (target < 0 || target >= value.artists.length) return
    const next = [...value.artists]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange({ ...value, artists: renumber(next) })
  }

  return (
    <div className="space-y-4">
      <FormSelect
        label="Genre"
        hint="Optional. Helps fans discover your event by sound."
        value={value.genre_slug ?? ''}
        onChange={(e) => handleGenreChange(e.target.value)}
      >
        <option value="">No genre</option>
        {GENRES.map((g) => (
          <option key={g.slug} value={g.slug}>
            {g.name}
          </option>
        ))}
      </FormSelect>

      {subgenres.length > 0 && (
        <FormSelect
          label="Sub-genre"
          hint="Picking a sub-genre sets its parent genre automatically."
          value={value.subgenre_slug ?? ''}
          onChange={(e) => handleSubgenreChange(e.target.value)}
        >
          <option value="">All of {GENRES.find((g) => g.slug === value.genre_slug)?.name}</option>
          {subgenres.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.name}
            </option>
          ))}
        </FormSelect>
      )}

      <FormField label="Lineup" hint="Add artists in billing order. The first is the headliner.">
        <div className="space-y-2">
          {value.artists.length > 0 && (
            <ul className="space-y-2">
              {value.artists.map((artist, index) => (
                <li
                  key={`${artist.artist_id ?? artistSlug(artist.name)}-${index}`}
                  className="flex items-center gap-2 rounded-lg border border-gray-300 bg-surface px-3 py-2"
                >
                  <span className="text-xs font-medium text-textSecondary w-16 shrink-0">
                    {index === 0 ? 'Headliner' : `Support ${index}`}
                  </span>
                  <span className="flex-1 text-textPrimary truncate">{artist.name}</span>
                  <button
                    type="button"
                    className={CONTROL_BTN}
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label={`Move ${artist.name} up`}
                  >
                    <span aria-hidden>↑</span>
                  </button>
                  <button
                    type="button"
                    className={CONTROL_BTN}
                    onClick={() => move(index, 1)}
                    disabled={index === value.artists.length - 1}
                    aria-label={`Move ${artist.name} down`}
                  >
                    <span aria-hidden>↓</span>
                  </button>
                  <button
                    type="button"
                    className={CONTROL_BTN}
                    onClick={() => removeArtist(index)}
                    aria-label={`Remove ${artist.name}`}
                  >
                    <span aria-hidden>×</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <input
            type="text"
            value={artistQuery}
            onChange={(e) => setArtistQuery(e.target.value)}
            placeholder="Search or add an artist"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent focus:border-accent outline-none transition-colors text-textPrimary"
          />

          {(matches.length > 0 || canCreate) && (
            <ul className="rounded-lg border border-gray-300 bg-surface divide-y divide-gray-100">
              {matches.map((option) => (
                <li key={option.id}>
                  <button
                    type="button"
                    className="w-full text-left min-h-[44px] px-3 py-2 text-textPrimary hover:bg-background focus:bg-background outline-none"
                    onClick={() => addArtist({ artist_id: option.id, name: option.name })}
                  >
                    {option.name}
                  </button>
                </li>
              ))}
              {canCreate && (
                <li>
                  <button
                    type="button"
                    className="w-full text-left min-h-[44px] px-3 py-2 text-accent hover:bg-background focus:bg-background outline-none"
                    onClick={() => addArtist({ artist_id: null, name: trimmedQuery })}
                  >
                    Add &quot;{trimmedQuery}&quot;
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>
      </FormField>
    </div>
  )
}

function renumber(artists: PickerArtist[]): PickerArtist[] {
  return artists.map((artist, index) => ({ ...artist, billing_order: index }))
}
