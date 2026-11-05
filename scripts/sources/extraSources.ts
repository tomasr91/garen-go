import { normalizeText } from '../../src/domain/shopQuery.ts'
import { distanceKm } from '../../src/domain/geo.ts'
import { parseOsmOpeningHours } from '../../src/domain/osmOpeningHours.ts'
import type { Shop, SourceType, VerificationStatus } from '../../src/domain/types.ts'

/**
 * Extra bronnen naast OpenStreetMap:
 *   data/sources/manual.json   handmatig gecontroleerde winkels (bijv. van de eigen website van de winkel)
 *   data/sources/dealers.json  fysieke verkooppunten van garenmerken (gegenereerd door scripts/import-dealers.ts)
 *
 * Elke regel heeft minimaal naam + adres. Coördinaten worden via de PDOK Locatieserver
 * (gratis, open overheidsdata) bij het adres gezocht als ze ontbreken.
 */
export interface SourceEntry {
  /** Optioneel stabiel ID; anders afgeleid van naam + postcode. */
  id?: string
  name: string
  address: string
  postcode: string
  city: string
  lat?: number
  lon?: number
  categories: string[]
  /** OSM-notatie, bijv. "Tu-Fr 13:00-17:30; Sa 09:30-16:00". */
  opening_hours?: string
  /** Zichtbare toelichting bij de openingstijden. */
  hours_note?: string
  website?: string
  phone?: string
  assortment?: string[]
  /** Bijv. "Scheepjes" voor een verkooppuntenlijst. */
  brand?: string
  sourceUrl?: string
  /** Alleen gebruiken om een bestaande winkel aan te vullen, nooit als nieuwe winkel toevoegen. */
  enrichOnly?: boolean
  checkedAt?: string
  verification?: VerificationStatus
  notes?: string
}

export function slug(s: string): string {
  return normalizeText(s).replace(/ /g, '-').slice(0, 60)
}

export function entryId(prefix: string, e: SourceEntry): string {
  return e.id ?? `${prefix}-${slug(e.name)}-${e.postcode.replace(/\s/g, '').toLowerCase()}`
}

export function entryToShop(e: SourceEntry, type: SourceType, idPrefix: string, now: string): Shop | null {
  if (e.lat === undefined || e.lon === undefined) return null
  const parsed = parseOsmOpeningHours(e.opening_hours)
  const openingHours = parsed && e.hours_note ? { ...parsed, note: e.hours_note } : parsed
  const assortment = [...(e.assortment ?? [])]
  if (e.brand && !assortment.includes(`Verkooppunt ${e.brand}`)) assortment.push(`Verkooppunt ${e.brand}`)
  return {
    id: entryId(idPrefix, e),
    name: e.name,
    address: e.address,
    postcode: e.postcode,
    city: e.city,
    lat: e.lat,
    lon: e.lon,
    categories: e.categories,
    openingHours,
    website: e.website,
    phone: e.phone,
    assortment,
    active: true,
    source: { type, url: e.sourceUrl, checkedAt: e.checkedAt, ref: e.brand ? `verkooppunt:${e.brand}` : undefined },
    verification: e.verification ?? 'unverified',
    notes: e.notes ?? (openingHours ? undefined : 'Te controleren: openingstijden ontbreken.'),
    updatedAt: now,
  }
}

const STOP = new Set(['de', 'het', 't', 'van', 'en', 'wol', 'winkel', 'shop', 's', 'b', 'v', 'bv'])
function nameTokens(name: string): Set<string> {
  return new Set(normalizeText(name).split(' ').filter((w) => w.length >= 3 && !STOP.has(w)))
}

/** Is dit (vrijwel zeker) dezelfde winkel? Zelfde postcode of < 150 m, én een overlappend naamwoord. */
export function isSameShop(a: Pick<Shop, 'name' | 'postcode' | 'lat' | 'lon'>, b: Pick<Shop, 'name' | 'postcode' | 'lat' | 'lon'>): boolean {
  const samePc = !!a.postcode && a.postcode.replace(/\s/g, '') === b.postcode.replace(/\s/g, '')
  const near = distanceKm(a, b) < 0.15
  if (!samePc && !near) return false
  const ta = nameTokens(a.name)
  const tb = nameTokens(b.name)
  for (const t of ta) if (tb.has(t) || [...tb].some((u) => u.includes(t) || t.includes(u))) return true
  // Zelfde adres en heel dichtbij: ook bij verschillende naam waarschijnlijk dezelfde zaak (andere schrijfwijze).
  return samePc && distanceKm(a, b) < 0.03
}

export interface MergeReport {
  added: number
  enrichedExisting: number
  replacedOsm: number
}

/**
 * Voegt extra winkels toe aan de bestaande lijst.
 * - Handmatige winkels (`replace = true`) vervangen een dubbele OSM-winkel.
 * - Verkooppunten (`replace = false`) verrijken een bestaande winkel met het merk, of worden nieuw toegevoegd.
 */
export type MergeMode = 'replace' | 'enrich-or-add' | 'enrich-only'

export function mergeExtra(base: Shop[], extra: Shop[], mode: MergeMode): { shops: Shop[]; report: MergeReport } {
  const replace = mode === 'replace'
  const shops = [...base]
  const report: MergeReport = { added: 0, enrichedExisting: 0, replacedOsm: 0 }
  for (const shop of extra) {
    const idx = shops.findIndex((s) => s.id === shop.id || isSameShop(s, shop))
    if (idx < 0) {
      if (mode === 'enrich-only') continue
      shops.push(shop)
      report.added++
      continue
    }
    const existing = shops[idx]
    if (existing.id === shop.id) {
      shops[idx] = shop
    } else if (replace && existing.source.type === 'osm') {
      shops[idx] = { ...shop, notes: [shop.notes, `Vervangt OSM ${existing.source.ref}.`].filter(Boolean).join(' ') }
      report.replacedOsm++
    } else {
      const assortment = [...new Set([...existing.assortment, ...shop.assortment])]
      const categories = [...new Set([...existing.categories, ...shop.categories])]
      shops[idx] = {
        ...existing,
        assortment,
        categories,
        website: existing.website ?? shop.website,
        phone: existing.phone ?? shop.phone,
        openingHours: existing.openingHours ?? shop.openingHours,
      }
      report.enrichedExisting++
    }
  }
  return { shops, report }
}

/** Zoekt coördinaten bij een Nederlands adres via de PDOK Locatieserver. Controleert dat de plaats klopt. */
export async function geocodePdok(e: SourceEntry): Promise<{ lat: number; lon: number } | null> {
  // Postcode + huisnummer is het meest betrouwbaar (straatnamen worden vaak afgekort, bijv. "H. Droststraat").
  const nr = /(\d+)\s*([a-zA-Z]?)\s*(?:[-\s]?\d+)?$/.exec(e.address.trim())
  const pc = e.postcode.replace(/\s/g, '').toUpperCase()
  const q = /^\d{4}[A-Z]{2}$/.test(pc) && nr ? `${pc} ${nr[1]}${nr[2] ?? ''}` : `${e.address} ${e.postcode} ${e.city}`.trim()
  const url = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?q=${encodeURIComponent(q)}&fq=type:adres&rows=1&fl=centroide_ll,woonplaatsnaam,postcode,weergavenaam`
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  if (!res.ok) return null
  const json = (await res.json()) as { response: { docs: { centroide_ll: string; woonplaatsnaam: string; postcode?: string }[] } }
  const doc = json.response.docs[0]
  if (!doc) return null
  const pcOk = !e.postcode || (doc.postcode ?? '').replace(/\s/g, '') === e.postcode.replace(/\s/g, '').toUpperCase()
  const cityOk = !e.city || normalizeText(doc.woonplaatsnaam) === normalizeText(e.city)
  if (!pcOk && !cityOk) return null
  const m = /POINT\(([\d.]+) ([\d.]+)\)/.exec(doc.centroide_ll)
  if (!m) return null
  return { lon: Number(m[1]), lat: Number(m[2]) }
}
