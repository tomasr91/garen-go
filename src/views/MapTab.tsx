import { useEffect, useMemo, useRef, useState } from 'react'
import { hrefFor } from '../app/router.ts'
import { SearchAndFilters } from '../components/Filters.tsx'
import { IconClose, IconLocate, IconNavigate } from '../components/Icons.tsx'
import { CategoryTags, StatusBadge } from '../components/ShopBits.tsx'
import { formatDistance, navigationUrl, NETHERLANDS_CENTER, NETHERLANDS_ZOOM } from '../domain/geo.ts'
import { getOpeningStatus } from '../domain/openingHours.ts'
import { createClusterGroup } from '../map/cluster.ts'
import { addBaseLayer, L, shopIcon, userIcon } from '../map/leaflet.ts'
import { useAppState } from '../state/AppState.tsx'

export function MapTab({ active }: { active: boolean }) {
  const { visibleShops, location, locationStatus, requestLocation, now, query } = useAppState()
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null)
  const markersRef = useRef(new Map<string, L.Marker>())
  const userMarkerRef = useRef<L.Marker | null>(null)
  const centeredOnUser = useRef(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Kaart één keer opzetten.
  useEffect(() => {
    if (!container.current || mapRef.current) return
    const map = L.map(container.current, { zoomControl: false, minZoom: 6, maxBounds: [[49.5, 1.5], [54.5, 8.5]] }).setView(
      [NETHERLANDS_CENTER.lat, NETHERLANDS_CENTER.lon],
      NETHERLANDS_ZOOM,
    )
    L.control.zoom({ position: 'topright' }).addTo(map)
    addBaseLayer(map)
    const cluster = createClusterGroup()
    map.addLayer(cluster)
    map.on('click', () => setSelectedId(null))
    mapRef.current = map
    clusterRef.current = cluster
    return () => {
      map.remove()
      mapRef.current = null
      clusterRef.current = null
      markersRef.current.clear()
    }
  }, [])

  // Kaart was verborgen (ander tabblad): afmetingen opnieuw bepalen.
  useEffect(() => {
    if (active) setTimeout(() => mapRef.current?.invalidateSize(), 0)
  }, [active])

  // Markers bijwerken wanneer filters/zoekterm veranderen.
  useEffect(() => {
    const cluster = clusterRef.current
    if (!cluster) return
    const markers = visibleShops.map(({ shop }) => {
      let m = markersRef.current.get(shop.id)
      if (!m) {
        m = L.marker([shop.lat, shop.lon], { icon: shopIcon(shop), title: shop.name, keyboard: true, riseOnHover: true })
        m.on('click', () => setSelectedId(shop.id))
        markersRef.current.set(shop.id, m)
      } else {
        m.setLatLng([shop.lat, shop.lon])
        m.setIcon(shopIcon(shop))
      }
      return m
    })
    cluster.clearLayers()
    cluster.addLayers(markers)
    setSelectedId((id) => (id && visibleShops.some((v) => v.shop.id === id) ? id : null))
  }, [visibleShops])

  // Bij zoeken: inzoomen op de resultaten.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !query.trim() || visibleShops.length === 0) return
    const t = setTimeout(() => {
      const bounds = L.latLngBounds(visibleShops.map(({ shop }) => [shop.lat, shop.lon] as [number, number]))
      map.fitBounds(bounds.pad(0.2), { maxZoom: 14 })
    }, 500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  // Locatie van de gebruiker tonen en (eenmalig) de kaart daarop centreren.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !location) return
    if (!userMarkerRef.current) {
      userMarkerRef.current = L.marker([location.lat, location.lon], { icon: userIcon(), interactive: false, keyboard: false }).addTo(map)
    } else {
      userMarkerRef.current.setLatLng([location.lat, location.lon])
    }
    if (!centeredOnUser.current) {
      centeredOnUser.current = true
      map.setView([location.lat, location.lon], 12)
    }
  }, [location])

  // Geselecteerde marker markeren.
  useEffect(() => {
    for (const { shop } of visibleShops) {
      markersRef.current.get(shop.id)?.setIcon(shopIcon(shop, shop.id === selectedId))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  const selected = useMemo(() => visibleShops.find((v) => v.shop.id === selectedId), [visibleShops, selectedId])

  const onLocate = () => {
    if (location) mapRef.current?.setView([location.lat, location.lon], 13)
    else requestLocation()
  }

  return (
    <div className="map-tab">
      <div ref={container} className="map" role="application" aria-label="Kaart met handwerkwinkels" />
      <SearchAndFilters floating />
      <div className="map-count" aria-live="polite">
        {visibleShops.length} {visibleShops.length === 1 ? 'winkel' : 'winkels'}
      </div>
      <button
        type="button"
        className="fab"
        onClick={onLocate}
        aria-label={location ? 'Centreer op mijn locatie' : 'Gebruik mijn locatie'}
        title={locationStatus === 'denied' ? 'Locatietoegang is geweigerd in je browser' : undefined}
      >
        <IconLocate />
      </button>
      {visibleShops.length === 0 && (
        <div className="map-empty" role="status">
          Geen winkels in de gekozen categorieën{query ? ` voor “${query}”` : ''}.
        </div>
      )}
      {selected && (
        <div className="map-sheet" role="dialog" aria-label={selected.shop.name}>
          <button type="button" className="map-sheet__close" onClick={() => setSelectedId(null)} aria-label="Sluiten">
            <IconClose />
          </button>
          <a className="map-sheet__main" href={hrefFor.shop(selected.shop.id)}>
            <h3>{selected.shop.name}</h3>
            <p className="card__city">
              {selected.shop.city || 'Plaats onbekend'}
              {selected.distanceKm !== undefined && ` · ${formatDistance(selected.distanceKm)}`}
            </p>
            <StatusBadge status={getOpeningStatus(selected.shop.openingHours, now)} />
            <CategoryTags ids={selected.shop.categories} />
          </a>
          <div className="card__actions">
            <a className="btn btn--primary" href={hrefFor.shop(selected.shop.id)}>
              Bekijk winkel
            </a>
            <a className="btn btn--ghost" href={navigationUrl(selected.shop)} target="_blank" rel="noopener noreferrer">
              <IconNavigate width={18} height={18} /> Route
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
