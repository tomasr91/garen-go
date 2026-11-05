import { parseOsmOpeningHours } from '../domain/osmOpeningHours.ts'
import { DAY_KEYS, type Shop, type ShopDataset } from '../domain/types.ts'
import { newShopId } from './shopRepository.ts'

/**
 * Import van JSON (ShopDataset of Shop[]) en CSV.
 *
 * CSV-kolommen (puntkomma of komma als scheidingsteken, eerste regel = kopregel):
 *   id, name, address, postcode, city, lat, lon, categories, opening_hours, website, phone, assortment, active
 * - categories en assortment: meerdere waarden scheiden met "|"
 * - opening_hours: OpenStreetMap-notatie, bijv. "Tu-Fr 09:30-17:30; Sa 10:00-17:00"
 * - id mag leeg zijn: dan wordt een nieuw ID aangemaakt
 */
export const CSV_COLUMNS = [
  'id', 'name', 'address', 'postcode', 'city', 'lat', 'lon', 'categories',
  'opening_hours', 'website', 'phone', 'assortment', 'active',
] as const

export function parseCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === sep) {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      if (row.some((f) => f.trim())) rows.push(row)
      row = []
      field = ''
    } else field += ch
  }
  row.push(field)
  if (row.some((f) => f.trim())) rows.push(row)
  return rows
}

export interface ImportResult {
  shops: Shop[]
  errors: string[]
}

export function shopsFromCsv(text: string, now = new Date().toISOString()): ImportResult {
  const rows = parseCsv(text)
  const errors: string[] = []
  if (rows.length < 2) return { shops: [], errors: ['Het CSV-bestand bevat geen gegevensregels.'] }
  const header = rows[0].map((h) => h.trim().toLowerCase())
  const col = (name: string) => header.indexOf(name)
  for (const required of ['name', 'lat', 'lon', 'categories']) {
    if (col(required) < 0) errors.push(`Kolom "${required}" ontbreekt.`)
  }
  if (errors.length) return { shops: [], errors }

  const shops: Shop[] = []
  rows.slice(1).forEach((r, i) => {
    const get = (name: string) => (col(name) >= 0 ? (r[col(name)] ?? '').trim() : '')
    const lat = Number(get('lat').replace(',', '.'))
    const lon = Number(get('lon').replace(',', '.'))
    if (!get('name') || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      errors.push(`Regel ${i + 2}: naam of coördinaten ontbreken, overgeslagen.`)
      return
    }
    const rawHours = get('opening_hours')
    const openingHours = parseOsmOpeningHours(rawHours)
    if (rawHours && !openingHours) errors.push(`Regel ${i + 2}: openingstijden "${rawHours}" niet herkend, opgeslagen als onbekend.`)
    const active = get('active').toLowerCase()
    shops.push({
      id: get('id') || newShopId(),
      name: get('name'),
      address: get('address'),
      postcode: get('postcode').toUpperCase(),
      city: get('city'),
      lat,
      lon,
      categories: get('categories').split('|').map((s) => s.trim()).filter(Boolean),
      openingHours,
      website: get('website') || undefined,
      phone: get('phone') || undefined,
      assortment: get('assortment').split('|').map((s) => s.trim()).filter(Boolean),
      active: !['false', 'nee', '0', 'no'].includes(active),
      source: { type: 'import' },
      verification: 'unverified',
      updatedAt: now,
    })
  })
  return { shops, errors }
}

export function shopsFromJson(text: string): ImportResult {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { shops: [], errors: ['Het bestand is geen geldige JSON.'] }
  }
  const list = Array.isArray(data) ? data : (data as ShopDataset)?.shops
  if (!Array.isArray(list)) return { shops: [], errors: ['Verwacht een lijst met winkels of een object met "shops".'] }
  const shops: Shop[] = []
  const errors: string[] = []
  list.forEach((s: Partial<Shop>, i) => {
    if (!s || typeof s.name !== 'string' || typeof s.lat !== 'number' || typeof s.lon !== 'number') {
      errors.push(`Item ${i + 1}: naam of coördinaten ontbreken, overgeslagen.`)
      return
    }
    shops.push({
      address: '', postcode: '', city: '', categories: [], openingHours: null, assortment: [],
      active: true, source: { type: 'import' }, verification: 'unverified', updatedAt: new Date().toISOString(),
      ...s,
      id: s.id || newShopId(),
    } as Shop)
  })
  return { shops, errors }
}

/** Openingstijden terug naar OSM-notatie (voor CSV-export en het beheerformulier). */
export function toOsmNotation(shop: Shop): string {
  if (!shop.openingHours) return ''
  const osm = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
  return DAY_KEYS.map((d, i) => {
    const r = shop.openingHours!.weekly[d]
    return `${osm[i]} ${r.length ? r.map((x) => `${x.open}-${x.close}`).join(',') : 'off'}`
  }).join('; ')
}

export function shopsToCsv(shops: Shop[]): string {
  const esc = (v: string) => (/[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  const lines = [CSV_COLUMNS.join(',')]
  for (const s of shops) {
    lines.push(
      [s.id, s.name, s.address, s.postcode, s.city, String(s.lat), String(s.lon), s.categories.join('|'),
        toOsmNotation(s), s.website ?? '', s.phone ?? '', s.assortment.join('|'), String(s.active)]
        .map(esc)
        .join(','),
    )
  }
  return lines.join('\n') + '\n'
}

export function downloadFile(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
