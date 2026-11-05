export interface LatLon {
  lat: number
  lon: number
}

/** Middelpunt en zoomniveau waarop heel Nederland in beeld is. */
export const NETHERLANDS_CENTER: LatLon = { lat: 52.2, lon: 5.3 }
export const NETHERLANDS_ZOOM = 7

const EARTH_RADIUS_KM = 6371.0088

/** Hemelsbrede afstand in kilometers (haversine). Dit is géén rij- of loopafstand. */
export function distanceKm(a: LatLon, b: LatLon): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

const km1 = new Intl.NumberFormat('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const km0 = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 0 })

/** "350 m", "2,4 km", "38 km". */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m`
  if (km < 10) return `${km1.format(km)} km`
  return `${km0.format(km)} km`
}

/** Routelink die op iOS, Android en desktop werkt. */
export function navigationUrl(p: LatLon): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}`
}

export function isInNetherlandsBox(p: LatLon): boolean {
  return p.lat >= 50.6 && p.lat <= 53.7 && p.lon >= 3.2 && p.lon <= 7.3
}
