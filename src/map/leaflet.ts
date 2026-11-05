/**
 * Eén plek waar Leaflet wordt geladen en geconfigureerd.
 * leaflet.markercluster verwacht een globale `L`; die zetten we hier vóór het importeren van de plugin.
 */
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Shop } from '../domain/types.ts'

;(window as unknown as { L: typeof L }).L = L

export { L }

/** OpenStreetMap-tegels: gratis, geen API-key. Gebruik volgens https://operations.osmfoundation.org/policies/tiles/ */
export function addBaseLayer(map: L.Map) {
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>-bijdragers',
  }).addTo(map)
}

export function shopIcon(_shop: Shop, selected = false): L.DivIcon {
  return L.divIcon({
    className: 'shop-marker',
    // Alle markers in dezelfde accentkleur: rustiger kaartbeeld (categorie staat in het kaartje).
    html: `<span class="pin${selected ? ' pin--selected' : ''}"></span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 28],
  })
}

export function userIcon(): L.DivIcon {
  return L.divIcon({ className: 'user-marker', html: '<span class="user-dot"></span>', iconSize: [22, 22], iconAnchor: [11, 11] })
}
