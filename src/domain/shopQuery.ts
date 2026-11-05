import { distanceKm, type LatLon } from './geo.ts'
import type { Shop } from './types.ts'

/** Eén plek voor filteren, zoeken en sorteren: zowel de lijst als de kaart gebruiken dit. */

export interface ShopFilter {
  categories: ReadonlySet<string>
  query: string
}

export type SortMode = 'distance' | 'city' | 'name'

export interface ShopWithDistance {
  shop: Shop
  /** `undefined` als de locatie van de gebruiker niet bekend is. */
  distanceKm?: number
}

export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const compact = (s: string) => normalizeText(s).replace(/ /g, '')

/** Officiële en gangbare plaatsnamen, zodat "Den Haag" ook "'s-Gravenhage" vindt. */
const CITY_ALIASES: [string, string][] = [
  ['s gravenhage', 'den haag'],
  ['s hertogenbosch', 'den bosch'],
]
function withAliases(text: string): string {
  let out = text
  for (const [a, b] of CITY_ALIASES) {
    if (out.includes(a)) out += ` ${b}`
    else if (out.includes(b)) out += ` ${a}`
  }
  return out
}

/** Sorteersleutel voor plaatsnamen: "'s-Gravenhage" hoort bij de G, "'t Zandt" bij de Z. */
export function citySortKey(city: string): string {
  return city.replace(/^['’](s|t)[-\s]/i, '')
}

/** Zoekt op winkelnaam, plaatsnaam en postcode. Alle zoekwoorden moeten ergens voorkomen. */
export function matchesQuery(shop: Shop, query: string): boolean {
  const q = normalizeText(query)
  if (!q) return true
  const haystack = withAliases(normalizeText(`${shop.name} ${shop.city} ${shop.postcode}`))
  const words = q.split(' ')
  if (words.every((w) => haystack.includes(w))) return true
  // Postcode zonder spatie ("3511AB") of gedeeltelijk ("3511").
  const pc = compact(shop.postcode)
  return pc.length > 0 && compact(query).length >= 2 && pc.startsWith(compact(query))
}

export function matchesCategories(shop: Shop, enabled: ReadonlySet<string>): boolean {
  return shop.categories.some((c) => enabled.has(c))
}

export function filterShops(shops: Shop[], filter: ShopFilter): Shop[] {
  return shops.filter((s) => s.active && matchesCategories(s, filter.categories) && matchesQuery(s, filter.query))
}

const collator = new Intl.Collator('nl-NL', { sensitivity: 'base' })

export function withDistance(shops: Shop[], location: LatLon | null): ShopWithDistance[] {
  return shops.map((shop) => ({ shop, distanceKm: location ? distanceKm(location, shop) : undefined }))
}

export function sortShops(items: ShopWithDistance[], mode: SortMode): ShopWithDistance[] {
  const byName = (a: ShopWithDistance, b: ShopWithDistance) => collator.compare(a.shop.name, b.shop.name)
  const byCity = (a: ShopWithDistance, b: ShopWithDistance) => {
    // Winkels zonder plaats achteraan.
    if (!a.shop.city !== !b.shop.city) return a.shop.city ? -1 : 1
    return collator.compare(citySortKey(a.shop.city), citySortKey(b.shop.city)) || byName(a, b)
  }
  const sorted = [...items]
  if (mode === 'distance' && items.some((i) => i.distanceKm !== undefined)) {
    sorted.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) || byName(a, b))
  } else if (mode === 'name') {
    sorted.sort(byName)
  } else {
    sorted.sort(byCity)
  }
  return sorted
}
