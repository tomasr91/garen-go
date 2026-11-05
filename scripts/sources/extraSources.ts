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

const digits = (p?: string) => (p ?? '').replace(/\D/g, '').slice(-9)
const domain = (u?: string) => {
  try {
    return u ? new URL(u).hostname.replace(/^www\./, '') : ''
  } catch {
    return ''
  }
}
const streetKey = (a: string) => normalizeText(a).replace(/ /g, '')

/**
 * Zelfde zaak, ook als bronnen een ander (of verouderd) adres noemen:
 * exact dezelfde naam binnen 5 km én hetzelfde telefoonnummer, dezelfde website of hetzelfde straatadres.
 */
export function isSameBusiness(a: Shop, b: Shop): boolean {
  if (normalizeText(a.name) !== normalizeText(b.name)) return false
  if (distanceKm(a, b) > 5) return false
  const phone = digits(a.phone).length === 9 && digits(a.phone) === digits(b.phone)
  const site = !!domain(a.website) && domain(a.website) === domain(b.website) && !/facebook|instagram/.test(domain(a.website))
  const street = !!a.address && streetKey(a.address) === streetKey(b.address)
  return phone || site || street
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
    const idx = shops.findIndex((s) => s.id === shop.id || isSameShop(s, shop) || isSameBusiness(s, shop))
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
      // Noemt de andere bron een ander adres? Dan laten we dat zien als controlepunt.
      const otherAddress = streetKey(existing.address) !== streetKey(shop.address) && shop.address
      const brand = shop.source.ref?.replace('verkooppunt:', '') ?? 'een andere bron'
      const addressNote = otherAddress
        ? `Let op: ${brand} noemt adres ${shop.address}, ${shop.postcode} ${shop.city}; controleer welk adres actueel is.`
        : undefined
      const assortment = [...new Set([...existing.assortment, ...shop.assortment])]
      const categories = [...new Set([...existing.categories, ...shop.categories])]
      shops[idx] = {
        ...existing,
        assortment,
        categories,
        website: existing.website ?? shop.website,
        phone: existing.phone ?? shop.phone,
        openingHours: existing.openingHours ?? shop.openingHours,
        notes: addressNote && !existing.notes?.includes(addressNote) ? [existing.notes, addressNote].filter(Boolean).join(' ') : existing.notes,
      }
      report.enrichedExisting++
    }
  }
  return { shops, report }
}

/** Straatnaam zonder huisnummer, bijv. "Kleine Overstraat 6" → "kleine overstraat". */
export function streetName(address: string): string {
  return normalizeText(address.replace(/\s*\d.*$/, ''))
}

/** Levenshtein-afstand, voor kleine tikfouten ("Zoetemeer" ↔ "Zoetermeer"). */
export function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return dp[b.length]
}

const compactText = (s: string) => normalizeText(s).replace(/ /g, '')

/** Bijna gelijk: gelijk, bevat de ander, of hooguit 2 tikfouten (bij langere namen). */
function similar(a: string, b: string): boolean {
  const x = compactText(a)
  const y = compactText(b)
  if (!x || !y) return false
  if (x === y || x.includes(y) || y.includes(x)) return true
  return Math.min(x.length, y.length) >= 6 && editDistance(x, y) <= 2
}

/** "H. Droststraat" ↔ "Hendrik Droststraat", "Lage-maat" ↔ "Lagemaat": zelfde straat. */
export function streetMatches(a: string, b: string): boolean {
  const x = streetName(a)
  const y = normalizeText(b)
  if (!x || !y) return false
  if (similar(x, y)) return true
  return x.split(' ').pop() === y.split(' ').pop() && x.split(' ').pop()!.length >= 5
}

/** Plaatsnaam uit de bron vs. BAG-woonplaats: "Spakenburg" ↔ "Bunschoten-Spakenburg", "Den Bosch" ↔ "'s-Hertogenbosch". */
export function cityMatches(a: string, b: string): boolean {
  const alias = (c: string) =>
    normalizeText(c.replace(/\(.*?\)/g, ''))
      .replace(/^den bosch$/, 's hertogenbosch')
      .replace(/^den haag$/, 's gravenhage')
      .replace(/ (zh|nh|gld|nb|ov|lb|fr|gr|dr|ut|zl)$/, '')
  return similar(alias(a), alias(b))
}

interface PdokDoc {
  centroide_ll: string
  woonplaatsnaam: string
  postcode?: string
  straatnaam?: string
}

async function pdok(q: string): Promise<PdokDoc | null> {
  const url = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?q=${encodeURIComponent(q)}&fq=type:adres&rows=1&fl=centroide_ll,woonplaatsnaam,postcode,straatnaam`
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  if (!res.ok) return null
  const json = (await res.json()) as { response: { docs: PdokDoc[] } }
  return json.response.docs[0] ?? null
}

/**
 * Zoekt coördinaten bij een Nederlands adres via de PDOK Locatieserver.
 * Eerst postcode + huisnummer; klopt de straatnaam niet (bijv. een verkeerde postcode in de bron),
 * dan op straat + huisnummer + plaats. Het resultaat moet altijd in dezelfde straat en plaats liggen.
 */
export async function geocodePdok(e: SourceEntry): Promise<{ lat: number; lon: number; postcode?: string } | null> {
  const nr = /(\d+)\s*([a-zA-Z]?)\s*(?:[-\s]?\d+)?$/.exec(e.address.trim())
  const pc = e.postcode.replace(/\s/g, '').toUpperCase()
  const queries = [
    /^\d{4}[A-Z]{2}$/.test(pc) && nr ? `${pc} ${nr[1]}${nr[2] ?? ''}` : null,
    `${e.address} ${e.city}`.trim(),
  ].filter((q): q is string => !!q)
  for (const q of queries) {
    const doc = await pdok(q)
    if (!doc) continue
    // De straat moet altijd kloppen; daarnaast de postcode óf (ongeveer) de plaats.
    const streetOk = !!doc.straatnaam && streetMatches(e.address, doc.straatnaam)
    const pcOk = !!doc.postcode && doc.postcode.replace(/\s/g, '') === pc
    const cityOk = !e.city || cityMatches(e.city, doc.woonplaatsnaam)
    if (!streetOk || !(pcOk || cityOk)) continue
    const m = /POINT\(([\d.]+) ([\d.]+)\)/.exec(doc.centroide_ll)
    if (!m) continue
    return { lon: Number(m[1]), lat: Number(m[2]), postcode: doc.postcode }
  }
  return null
}
