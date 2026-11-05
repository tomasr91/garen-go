/**
 * Haalt handwerkwinkels in Nederland op uit OpenStreetMap (Overpass API) en schrijft
 * public/data/shops.json.
 *
 * Gebruik:  npm run data:import-osm
 *
 * Handmatig toegevoegde winkels en winkels met verificatie "verified" worden nooit
 * overschreven. Bij overige OSM-winkels blijft een uitgeschakelde status (active=false) behouden.
 * Data © OpenStreetMap-bijdragers, ODbL.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Shop, ShopDataset } from '../src/domain/types.ts'
import { dedupeShops, fillMissingCity, mapOsmElement, SHOP_TYPE_CATEGORIES, type OsmElement, type Place } from './osm/mapping.ts'

const OUTPUT = resolve(import.meta.dirname, '../public/data/shops.json')
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]
const USER_AGENT = 'GarenEnGo-data-import/1.0 (+https://github.com/tomasr91/garen-go)'

const shopTypes = Object.keys(SHOP_TYPE_CATEGORIES).join('|')
const SHOP_QUERY = `
[out:json][timeout:240];
area["ISO3166-1"="NL"][admin_level=2]->.nl;
nwr["shop"~"^(${shopTypes})$"](area.nl);
out center tags;`

const PLACE_QUERY = `
[out:json][timeout:240];
area["ISO3166-1"="NL"][admin_level=2]->.nl;
node["place"~"^(city|town|village|suburb|hamlet)$"]["name"](area.nl);
out;`

async function overpass(query: string): Promise<OsmElement[]> {
  let lastError: unknown
  for (const endpoint of ENDPOINTS) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
          body: new URLSearchParams({ data: query }),
        })
        if (!res.ok) throw new Error(`${endpoint} gaf HTTP ${res.status}`)
        const json = (await res.json()) as { elements: OsmElement[] }
        return json.elements
      } catch (err) {
        lastError = err
        console.warn(`  poging mislukt (${endpoint}, ${attempt}):`, (err as Error).message)
        await new Promise((r) => setTimeout(r, 5000 * attempt))
      }
    }
  }
  throw lastError
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
  const elements = await overpass(SHOP_QUERY)
  console.log(`  ${elements.length} OSM-objecten gevonden`)
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

  // Samenvoegen met bestaande data.
  const existing = await readExisting()
  const existingById = new Map(existing.map((s) => [s.id, s]))
  const protectedShops = existing.filter((s) => s.source.type !== 'osm' || s.verification === 'verified')
  const protectedIds = new Set(protectedShops.map((s) => s.id))
  const merged: Shop[] = [...protectedShops]
  for (const shop of fromOsm) {
    if (protectedIds.has(shop.id)) continue
    const prev = existingById.get(shop.id)
    merged.push(prev && prev.active === false ? { ...shop, active: false } : shop)
  }
  merged.sort((a, b) => a.id.localeCompare(b.id))

  const dataset: ShopDataset = {
    version: 1,
    generatedAt: now,
    attribution: 'Winkelgegevens © OpenStreetMap-bijdragers (ODbL), aangevuld met handmatige invoer.',
    shops: merged,
  }
  await writeFile(OUTPUT, JSON.stringify(dataset, null, 1) + '\n')

  const withHours = merged.filter((s) => s.openingHours).length
  console.log(`\nKlaar: ${merged.length} winkels geschreven naar public/data/shops.json`)
  console.log(`  ${fromOsm.length} uit OSM (na ontdubbelen), ${protectedShops.length} beschermd (handmatig/gecontroleerd)`)
  console.log(`  ${withHours} met leesbare openingstijden`)
  for (const [reason, count] of skipped) console.log(`  overgeslagen: ${count}× ${reason}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
