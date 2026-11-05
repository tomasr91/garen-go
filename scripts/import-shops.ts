/**
 * Bouwt public/data/shops.json uit:
 *   1. OpenStreetMap (Overpass API): handwerk-winkeltypes + winkels met een handwerknaam
 *   2. data/sources/manual.json: handmatig gecontroleerde winkels
 *   3. data/sources/dealers.json: fysieke verkooppunten van garenmerken
 *
 * Gebruik:  npm run data:import
 *
 * Handmatig toegevoegde winkels en winkels met verificatie "verified" worden nooit
 * overschreven. Bij overige OSM-winkels blijft een uitgeschakelde status (active=false) behouden.
 * Data © OpenStreetMap-bijdragers, ODbL.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Shop, ShopDataset } from '../src/domain/types.ts'
import { dedupeShops, fillMissingCity, mapOsmElement, SHOP_TYPE_CATEGORIES, type Place } from './osm/mapping.ts'
import { overpass } from './osm/overpass.ts'
import { applyWebsiteHours, type WebsiteHoursMap } from './sources/websiteHours.ts'
import { entryToShop, geocodePdok, mergeExtra, type SourceEntry } from './sources/extraSources.ts'

const OUTPUT = resolve(import.meta.dirname, '../public/data/shops.json')
const shopTypes = Object.keys(SHOP_TYPE_CATEGORIES).join('|')
const SHOP_QUERY = `
[out:json][timeout:240];
area["ISO3166-1"="NL"][admin_level=2]->.nl;
nwr["shop"~"^(${shopTypes})$"](area.nl);
out center tags;`

// Stap 2: ook winkels van een ander type waarvan de naam op handwerk wijst (wordt in mapping.ts streng gefilterd).
const NAME_QUERY = `
[out:json][timeout:240];
area["ISO3166-1"="NL"][admin_level=2]->.nl;
nwr["shop"]["shop"!~"^(${shopTypes})$"]["name"~"wol|garen|brei|haken|haak|yarn|knit|quilt|patchwork|borduur|handwerk|fourniture|kruissteek",i](area.nl);
out center tags;`

const PLACE_QUERY = `
[out:json][timeout:240];
area["ISO3166-1"="NL"][admin_level=2]->.nl;
node["place"~"^(city|town|village|suburb|hamlet)$"]["name"](area.nl);
out;`

const SOURCES_DIR = resolve(import.meta.dirname, '../data/sources')

async function loadEntries(file: string): Promise<SourceEntry[]> {
  try {
    return JSON.parse(await readFile(resolve(SOURCES_DIR, file), 'utf8')) as SourceEntry[]
  } catch {
    return []
  }
}

async function toShops(entries: SourceEntry[], type: 'manual' | 'import', prefix: string, now: string): Promise<Shop[]> {
  const shops: Shop[] = []
  for (const e of entries) {
    if (e.lat === undefined || e.lon === undefined) {
      try {
        const pos = await geocodePdok(e)
        await new Promise((r) => setTimeout(r, 120)) // PDOK netjes behandelen
        if (!pos) {
          console.warn(`  adres niet gevonden, overgeslagen: ${e.name}, ${e.address} ${e.postcode} ${e.city}`)
          continue
        }
        e.lat = pos.lat
        e.lon = pos.lon
      } catch (err) {
        console.warn(`  geocoderen mislukt voor ${e.name}:`, (err as Error).message)
        continue
      }
    }
    const shop = entryToShop(e, type, prefix, now)
    if (shop) shops.push(shop)
  }
  return shops
}

async function readExisting(): Promise<Shop[]> {
  try {
    const data = JSON.parse(await readFile(OUTPUT, 'utf8')) as ShopDataset
    return data.shops ?? []
  } catch {
    return []
  }
}

async function main() {
  const now = new Date().toISOString()
  console.log('Winkels ophalen uit OpenStreetMap…')
  const typeElements = await overpass(SHOP_QUERY)
  console.log(`  ${typeElements.length} OSM-objecten op winkeltype`)
  const nameElements = await overpass(NAME_QUERY)
  console.log(`  ${nameElements.length} extra OSM-objecten op naam`)
  const elements = [...typeElements, ...nameElements]
  console.log('Woonplaatsen ophalen (voor ontbrekende plaatsnamen)…')
  const placeElements = await overpass(PLACE_QUERY)
  // Wijken laten we weg: de plaatsnaam moet een woonplaats zijn.
  const places: Place[] = placeElements
    .filter((p) => p.tags?.name && p.lat !== undefined && p.lon !== undefined && p.tags.place !== 'suburb')
    .map((p) => ({ name: p.tags!.name, lat: p.lat!, lon: p.lon! }))

  const skipped = new Map<string, number>()
  const mapped: Shop[] = []
  for (const el of elements) {
    const result = mapOsmElement(el, now)
    if ('shop' in result) mapped.push(fillMissingCity(result.shop, places))
    else skipped.set(result.skipped, (skipped.get(result.skipped) ?? 0) + 1)
  }
  const fromOsm = dedupeShops(mapped)

  // Extra bronnen: handmatig + verkooppunten van merken.
  const manual = await loadEntries('manual.json')
  const dealers = await loadEntries('dealers.json')
  const manualShops = await toShops(manual, 'manual', 'src', now)
  const addable = await toShops(dealers.filter((d) => !d.enrichOnly), 'import', 'dlr', now)
  const enrichers = await toShops(dealers.filter((d) => d.enrichOnly), 'import', 'dlr', now)
  // Gevonden coördinaten bewaren, zodat een volgende run niet opnieuw hoeft te geocoderen.
  await writeFile(resolve(SOURCES_DIR, 'dealers.json'), JSON.stringify(dealers, null, 1) + '\n')
  await writeFile(resolve(SOURCES_DIR, 'manual.json'), JSON.stringify(manual, null, 2) + '\n')
  const step1 = mergeExtra(fromOsm, manualShops, 'replace')
  const step2 = mergeExtra(step1.shops, addable, 'enrich-or-add')
  const step3 = mergeExtra(step2.shops, enrichers, 'enrich-only')
  console.log(`  handmatig: ${manualShops.length} (${step1.report.replacedOsm} vervangen een OSM-winkel)`)
  console.log(`  verkooppunten: ${addable.length} → ${step2.report.added} nieuw, ${step2.report.enrichedExisting} verrijkten een bestaande winkel`)
  console.log(`  alleen-verrijken: ${enrichers.length} → ${step3.report.enrichedExisting} gekoppeld`)
  const imported = step3.shops

  // Samenvoegen met bestaande data.
  const existing = await readExisting()
  const existingById = new Map(existing.map((s) => [s.id, s]))
  // Beschermd = in beheer toegevoegd of gecontroleerd. Winkels uit data/sources/ (src-/dlr-) worden elke run opnieuw opgebouwd.
  const fromSources = (id: string) => id.startsWith('src-') || id.startsWith('dlr-')
  const protectedShops = existing.filter(
    (s) => !fromSources(s.id) && (s.source.type !== 'osm' || s.verification === 'verified'),
  )
  const protectedIds = new Set(protectedShops.map((s) => s.id))
  const merged: Shop[] = [...protectedShops]
  for (const shop of imported) {
    if (protectedIds.has(shop.id)) continue
    const prev = existingById.get(shop.id)
    merged.push(prev && prev.active === false ? { ...shop, active: false } : shop)
  }
  merged.sort((a, b) => a.id.localeCompare(b.id))

  // Eerder gevonden openingstijden van winkelwebsites (npm run data:hours) opnieuw toepassen.
  let websiteHours: WebsiteHoursMap = {}
  try {
    websiteHours = JSON.parse(await readFile(resolve(SOURCES_DIR, 'website-hours.json'), 'utf8')) as WebsiteHoursMap
  } catch {
    /* nog niet aanwezig */
  }
  const withSiteHours = applyWebsiteHours(merged, websiteHours)
  merged.splice(0, merged.length, ...withSiteHours.shops)
  console.log(`  openingstijden van winkelwebsites toegepast: ${withSiteHours.applied}`)

  const dataset: ShopDataset = {
    version: 1,
    generatedAt: now,
    attribution: 'Winkelgegevens © OpenStreetMap-bijdragers (ODbL), aangevuld met handmatige invoer.',
    shops: merged,
  }
  await writeFile(OUTPUT, JSON.stringify(dataset, null, 1) + '\n')

  const withHours = merged.filter((s) => s.openingHours).length
  console.log(`\nKlaar: ${merged.length} winkels geschreven naar public/data/shops.json`)
  console.log(`  ${fromOsm.length} uit OSM (na ontdubbelen), ${protectedShops.length} beschermd (eerder handmatig/gecontroleerd in beheer)`)
  console.log(`  ${withHours} met leesbare openingstijden`)
  for (const [reason, count] of skipped) console.log(`  overgeslagen: ${count}× ${reason}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
