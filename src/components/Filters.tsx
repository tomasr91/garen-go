import { CATEGORIES } from '../domain/categories.ts'
import { useAppState } from '../state/AppState.tsx'
import { IconClose, IconSearch } from './Icons.tsx'

/** Zoekveld + categoriefilters. Wordt op beide tabbladen gebruikt en deelt dezelfde status. */
export function SearchAndFilters({ floating = false }: { floating?: boolean }) {
  const { query, setQuery, enabledCategories, toggleCategory } = useAppState()
  return (
    <div className={`filters${floating ? ' filters--floating' : ''}`}>
      <label className="search">
        <IconSearch className="search__icon" />
        <span className="sr-only">Zoek op winkelnaam, plaats of postcode</span>
        <input
          type="search"
          inputMode="search"
          enterKeyHint="search"
          placeholder="Zoek op naam, plaats of postcode"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
        />
        {query && (
          <button type="button" className="search__clear" onClick={() => setQuery('')} aria-label="Zoekterm wissen">
            <IconClose width={18} height={18} />
          </button>
        )}
      </label>
      <div className="chips" role="group" aria-label="Filter op categorie">
        {CATEGORIES.map((c) => {
          const on = enabledCategories.has(c.id)
          return (
            <button
              key={c.id}
              type="button"
              className={`chip${on ? ' chip--on' : ''}`}
              aria-pressed={on}
              onClick={() => toggleCategory(c.id)}
              style={{ ['--cat' as string]: c.color }}
              title={c.label}
            >
              <span className="chip__dot" aria-hidden />
              {c.shortLabel}
            </button>
          )
        })}
      </div>
    </div>
  )
}
