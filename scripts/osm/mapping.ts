import { parseOsmOpeningHours } from '../../src/domain/osmOpeningHours.ts'
import type { Shop } from '../../src/domain/types.ts'

/** Omzetting van OpenStreetMap-objecten naar het Garen & Go-winkelmodel. */

export interface OsmElement {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

/** OSM `shop=*`-waarden die we ophalen, met hun basiscategorieën. */
export const SHOP_TYPE_CATEGORIES: Record<string, string[]> = {
  wool: ['wol'],
  yarn: ['wol'],
  needlework: ['handwerk', 'borduur-quilt'],
  patchwork: ['borduur-quilt'],
  fabric: ['handwerk'],
  haberdashery: ['fournituren'],
  sewing: ['fournituren'],
  craft: ['hobby'],
}

const SHOP_TYPE_ASSORTMENT: Record<string, string> = {
  wool: 'Wol en garen',
  yarn: 'Wol en garen',
  needlework: 'Handwerkmaterialen',
  patchwork: 'Patchwork en quilten',
  fabric: 'Stoffen',
  haberdashery: 'Fournituren',
  sewing: 'Naaibenodigdheden',
}

/** Extra categorieën op basis van woorden in de winkelnaam. */
const NAME_HINTS: [RegExp, string][] = [
  [/\b(wol|garen|garens|brei|breien|breiwinkel|haak|haken|yarn|knit|knitting|wolwinkel)/i, 'wol'],
  [/(quilt|patchwork|borduur|borduren|stitch|kruissteek)/i, 'borduur-quilt'],
  [/(fourni|knopen|band en|naaibenodigd|sewing|naaimachine)/i, 'fournituren'],
  [/(handwerk|handwerken|needle|naaiatelier)/i, 'handwerk'],
]

/** Woorden die bij een `shop=craft` op textiel/handwerk wijzen. Zonder zo'n hint laten we een hobbywinkel weg. */
const CRAFT_RELEVANT = /(wol|garen|brei|haak|naai|stof|stoffen|quilt|patchwork|borduur|handwerk|fourni|knop|textiel|yarn|knit|stitch|sew|fabric|kant|vilt)/i

/** Namen die op raamdecoratie of meubelstoffering wijzen, niet op handwerk. */
const EXCLUDE_NAME = /(gordijn|raamdecoratie|raambekleding|zonwering|stoffeerderij|tapijt|vloeren|schuimrubber|foam|matras|beddengoed|bed & textiel)/i

export type MapResult = { shop: Shop } | { skipped: string }

function clean(s: string | undefined): string | undefined {
  const v = s?.trim()
  return v ? v : undefined
}

function normalizeWebsite(url: string | undefined): string | undefined {
  const u = clean(url?.split(';')[0])
  if (!u) return undefined
  return /^https?:\/\//i.test(u) ? u : `https://${u}`
}

function normalizePostcode(pc: string | undefined): string {
  const v = clean(pc)?.toUpperCase().replace(/\s+/g, '')
  if (!v) return ''
  const m = /^(\d{4})([A-Z]{2})$/.exec(v)
  return m ? `${m[1]} ${m[2]}` : v
}

export function mapOsmElement(el: OsmElement, now: string): MapResult {
  const tags = el.tags ?? {}
  const shopType = tags.shop
  const name = clean(tags.name) ?? clean(tags.brand)
  if (!shopType || !SHOP_TYPE_CATEGORIES[shopType]) return { skipped: 'onbekend winkeltype' }
  if (!name) return { skipped: 'geen naam' }
  if (EXCLUDE_NAME.test(name)) return { skipped: 'geen handwerkwinkel (naam)' }
  if (shopType === 'craft' && !CRAFT_RELEVANT.test(`${name} ${tags.description ?? ''} ${tags.craft ?? ''}`)) {
    return { skipped: 'hobbywinkel zonder aanwijzing voor handwerkaanbod' }
  }

  const lat = el.lat ?? el.center?.lat
  const lon = el.lon ?? el.center?.lon
  if (lat === undefined || lon === undefined) return { skipped: 'geen coördinaten' }

  const categories = new Set(SHOP_TYPE_CATEGORIES[shopType])
  for (const [re, cat] of NAME_HINTS) if (re.test(name)) categories.add(cat)

  const street = [clean(tags['addr:street']), clean(tags['addr:housenumber'])].filter(Boolean).join(' ')
  const city = clean(tags['addr:city']) ?? ''
  const openingHours = parseOsmOpeningHours(tags.opening_hours)

  const assortment = [SHOP_TYPE_ASSORTMENT[shopType]].filter((x): x is string => !!x)
  const description = clean(tags.description)
  if (description) assortment.push(description)

  const todo: string[] = []
  if (!street) todo.push('adres ontbreekt')
  if (!city) todo.push('plaats ontbreekt in OSM')
  if (tags.opening_hours && !openingHours) todo.push(`openingstijden niet automatisch te lezen: "${tags.opening_hours}"`)
  if (!tags.opening_hours) todo.push('openingstijden ontbreken')

  const shop: Shop = {
    id: `osm-${el.type}-${el.id}`,
    name,
    address: street,
    postcode: normalizePostcode(tags['addr:postcode']),
    city,
    lat: Math.round(lat * 1e6) / 1e6,
    lon: Math.round(lon * 1e6) / 1e6,
    categories: [...categories],
    openingHours,
    website: normalizeWebsite(tags.website ?? tags['contact:website']),
    phone: clean(tags.phone ?? tags['contact:phone']),
    assortment,
    active: true,
    source: {
      type: 'osm',
      ref: `${el.type}/${el.id}`,
      url: `https://www.openstreetmap.org/${el.type}/${el.id}`,
      checkedAt: clean(tags['check_date:opening_hours'] ?? tags.check_date),
    },
    verification: 'unverified',
    notes: todo.length ? `Te controleren: ${todo.join('; ')}.` : undefined,
    updatedAt: now,
  }
  return { shop }
}

/** Dubbele winkels: zelfde (genormaliseerde) naam binnen 75 meter. We houden de meest complete. */
export function dedupeShops(shops: Shop[]): Shop[] {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const score = (s: Shop) =>
    (s.openingHours ? 4 : 0) + (s.address ? 2 : 0) + (s.city ? 1 : 0) + (s.website ? 1 : 0) + (s.phone ? 1 : 0)
  const kept: Shop[] = []
  for (const shop of [...shops].sort((a, b) => score(b) - score(a))) {
    const dup = kept.find(
      (k) =>
        norm(k.name) === norm(shop.name) &&
        Math.abs(k.lat - shop.lat) < 0.0007 &&
        Math.abs(k.lon - shop.lon) < 0.0011,
    )
    if (dup) {
      dup.categories = [...new Set([...dup.categories, ...shop.categories])]
    } else {
      kept.push({ ...shop })
    }
  }
  return kept
}

export interface Place {
  name: string
  lat: number
  lon: number
}

/** Vult een ontbrekende plaatsnaam aan met de dichtstbijzijnde woonplaats uit OSM (binnen ~5 km). */
export function fillMissingCity(shop: Shop, places: Place[]): Shop {
  if (shop.city || places.length === 0) return shop
  let best: Place | undefined
  let bestD = Infinity
  const cosLat = Math.cos((shop.lat * Math.PI) / 180)
  for (const p of places) {
    const d = (p.lat - shop.lat) ** 2 + ((p.lon - shop.lon) * cosLat) ** 2
    if (d < bestD) {
      bestD = d
      best = p
    }
  }
  if (!best || Math.sqrt(bestD) * 111 > 5) return shop
  return {
    ...shop,
    city: best.name,
    notes: shop.notes?.replace('plaats ontbreekt in OSM', 'plaats afgeleid van dichtstbijzijnde woonplaats'),
  }
}
