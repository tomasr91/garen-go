import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { CATEGORIES, defaultEnabledCategoryIds } from '../domain/categories.ts'
import type { LatLon } from '../domain/geo.ts'
import { filterShops, sortShops, withDistance, type ShopWithDistance, type SortMode } from '../domain/shopQuery.ts'
import { useShopStore } from './ShopStore.tsx'

/**
 * Gedeelde UI-status voor beide tabbladen: filters, zoekterm, sortering, locatie en "nu".
 * Lijst en kaart lezen allebei `visibleShops`, zodat ze altijd dezelfde winkels tonen.
 */

export type LocationStatus = 'idle' | 'requesting' | 'granted' | 'denied' | 'unavailable'

interface AppStateValue {
  enabledCategories: ReadonlySet<string>
  toggleCategory(id: string): void
  resetCategories(): void
  query: string
  setQuery(q: string): void
  sortMode: SortMode
  setSortMode(m: SortMode): void
  location: LatLon | null
  locationStatus: LocationStatus
  requestLocation(): void
  locationPromptDismissed: boolean
  dismissLocationPrompt(): void
  now: Date
  visibleShops: ShopWithDistance[]
}

const AppStateContext = createContext<AppStateValue | null>(null)

const CATEGORY_KEY = 'garen-go:categories:v1'
const PROMPT_KEY = 'garen-go:location-prompt-dismissed'

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* opslag niet beschikbaar: dan onthouden we het alleen voor deze sessie */
  }
}

/** Huidige tijd, ververst elke minuut op de minuutgrens zodat statussen vanzelf bijwerken. */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const schedule = () => {
      timer = setTimeout(() => {
        setNow(new Date())
        schedule()
      }, 60_000 - (Date.now() % 60_000) + 50)
    }
    schedule()
    // Na terugkeer naar het tabblad (telefoon uit slaapstand) meteen bijwerken.
    const onVisible = () => document.visibilityState === 'visible' && setNow(new Date())
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
  return now
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const { shops } = useShopStore()
  const known = new Set(CATEGORIES.map((c) => c.id))
  const [enabled, setEnabled] = useState<Set<string>>(
    () => new Set(readJson<string[]>(CATEGORY_KEY, defaultEnabledCategoryIds()).filter((id) => known.has(id))),
  )
  const [query, setQuery] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('distance')
  const [location, setLocation] = useState<LatLon | null>(null)
  const [locationStatus, setLocationStatus] = useState<LocationStatus>(
    typeof navigator !== 'undefined' && 'geolocation' in navigator ? 'idle' : 'unavailable',
  )
  const [promptDismissed, setPromptDismissed] = useState(() => readJson(PROMPT_KEY, false))
  const now = useNow()

  const requestLocation = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setLocationStatus('unavailable')
      return
    }
    setLocationStatus('requesting')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // Alleen in het geheugen van deze pagina; wordt nergens opgeslagen of verstuurd.
        setLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude })
        setLocationStatus('granted')
      },
      (err) => setLocationStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 5 * 60_000 },
    )
  }, [])

  // Heeft de gebruiker eerder al toestemming gegeven? Dan zonder vraag de locatie ophalen.
  useEffect(() => {
    navigator.permissions
      ?.query({ name: 'geolocation' })
      .then((p) => {
        if (p.state === 'granted') requestLocation()
        else if (p.state === 'denied') setLocationStatus('denied')
      })
      .catch(() => {})
  }, [requestLocation])

  const toggleCategory = useCallback((id: string) => {
    setEnabled((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      writeJson(CATEGORY_KEY, [...next])
      return next
    })
  }, [])

  const resetCategories = useCallback(() => {
    const next = new Set(defaultEnabledCategoryIds())
    writeJson(CATEGORY_KEY, [...next])
    setEnabled(next)
  }, [])

  const visibleShops = useMemo(
    () => sortShops(withDistance(filterShops(shops, { categories: enabled, query }), location), location ? sortMode : sortMode === 'distance' ? 'city' : sortMode),
    [shops, enabled, query, location, sortMode],
  )

  const value: AppStateValue = {
    enabledCategories: enabled,
    toggleCategory,
    resetCategories,
    query,
    setQuery,
    sortMode,
    setSortMode,
    location,
    locationStatus,
    requestLocation,
    locationPromptDismissed: promptDismissed,
    dismissLocationPrompt: () => {
      setPromptDismissed(true)
      writeJson(PROMPT_KEY, true)
    },
    now,
    visibleShops,
  }
  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}

export function useAppState(): AppStateValue {
  const ctx = useContext(AppStateContext)
  if (!ctx) throw new Error('useAppState buiten AppStateProvider')
  return ctx
}
