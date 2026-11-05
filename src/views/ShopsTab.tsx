import { useEffect, useRef, useState } from 'react'
import { SearchAndFilters } from '../components/Filters.tsx'
import { LocationPrompt } from '../components/LocationPrompt.tsx'
import { ShopCard } from '../components/ShopCard.tsx'
import type { SortMode } from '../domain/shopQuery.ts'
import { useAppState } from '../state/AppState.tsx'
import { useShopStore } from '../state/ShopStore.tsx'

const PAGE = 40

export function ShopsTab() {
  const { status, error, reload } = useShopStore()
  const { visibleShops, now, location, sortMode, setSortMode, query, enabledCategories, resetCategories, setQuery } = useAppState()
  const [limit, setLimit] = useState(PAGE)
  const sentinel = useRef<HTMLDivElement>(null)

  // Bij nieuwe filters/zoekterm weer bovenaan beginnen.
  useEffect(() => setLimit(PAGE), [query, enabledCategories, sortMode, location])

  // Meer kaartjes laden zodra de onderkant in beeld komt.
  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setLimit((l) => l + PAGE)
    }, { rootMargin: '600px' })
    io.observe(el)
    return () => io.disconnect()
  }, [visibleShops.length > limit])

  const effectiveSort: SortMode = !location && sortMode === 'distance' ? 'city' : sortMode
  const count = visibleShops.length

  return (
    <div className="shops-tab">
      <SearchAndFilters />
      <LocationPrompt />

      <div className="list-bar">
        <p className="list-bar__count" aria-live="polite">
          {status === 'ready' ? `${count} ${count === 1 ? 'winkel' : 'winkels'}` : ' '}
        </p>
        <label className="sort">
          <span className="sr-only">Sorteer</span>
          <select value={effectiveSort} onChange={(e) => setSortMode(e.target.value as SortMode)}>
            {location && <option value="distance">Dichtstbij</option>}
            <option value="city">Plaats</option>
            <option value="name">Naam</option>
          </select>
        </label>
      </div>
      {location && <p className="hint">Afstanden zijn hemelsbreed, niet de afstand over de weg.</p>}

      {status === 'loading' && (
        <ul className="card-list" aria-busy="true" aria-label="Winkels laden">
          {Array.from({ length: 4 }, (_, i) => (
            <li key={i} className="card card--skeleton" />
          ))}
        </ul>
      )}

      {status === 'error' && (
        <div className="empty">
          <h2>Winkels konden niet worden geladen</h2>
          <p>{error} Controleer je internetverbinding en probeer het opnieuw.</p>
          <button type="button" className="btn btn--primary" onClick={reload}>
            Opnieuw proberen
          </button>
        </div>
      )}

      {status === 'ready' && count === 0 && (
        <div className="empty">
          <h2>Geen winkels gevonden</h2>
          {enabledCategories.size === 0 ? (
            <p>Alle categorieën staan uit. Zet er minimaal één aan.</p>
          ) : query ? (
            <p>Geen winkels voor “{query}” in de gekozen categorieën.</p>
          ) : (
            <p>Er zijn geen winkels in de gekozen categorieën.</p>
          )}
          <div className="empty__actions">
            {query && (
              <button type="button" className="btn btn--ghost" onClick={() => setQuery('')}>
                Zoekterm wissen
              </button>
            )}
            <button type="button" className="btn btn--ghost" onClick={resetCategories}>
              Standaardfilters
            </button>
          </div>
        </div>
      )}

      {status === 'ready' && count > 0 && (
        <ul className="card-list">
          {visibleShops.slice(0, limit).map(({ shop, distanceKm }) => (
            <li key={shop.id}>
              <ShopCard shop={shop} distanceKm={distanceKm} now={now} />
            </li>
          ))}
        </ul>
      )}
      {count > limit && <div ref={sentinel} className="sentinel" aria-hidden />}
    </div>
  )
}
