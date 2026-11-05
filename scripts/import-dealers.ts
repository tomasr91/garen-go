/**
 * Haalt fysieke verkooppunten van garenmerken op en schrijft data/sources/dealers.json.
 * Daarna voegt `npm run data:import` ze samen met OpenStreetMap (zonder dubbelingen).
 *
 * Gebruik:  npm run data:dealers
 *
 * - Scheepjes: zoekt per Nederlandse woonplaats (stad/dorp uit OSM) in de openbare winkelzoeker.
 * - Rico Design: zoekt op een raster over Nederland; alleen gebruikt om bestaande winkels aan te vullen.
 * Alle verkooppunten krijgen verificatie "unverified" en een bronvermelding.
 */
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { overpass } from './osm/overpass.ts'
import { dedupeEntries, parseRico, parseScheepjes } from './sources/dealerParsers.ts'
import type { SourceEntry } from './sources/extraSources.ts'

const OUTPUT = resolve(import.meta.dirname, '../data/sources/dealers.json')
const UA = 'Mozilla/5.0 (compatible; GarenEnGo-dealers/1.0; +https://github.com/tomasr91/garen-go)'
const DELAY_MS = 1200

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function get(url: string): Promise<string | null> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'nl-NL' }, signal: AbortSignal.timeout(30_000) })
      if (res.ok) return await res.text()
      console.warn(`  HTTP ${res.status}: ${url}`)
    } catch (err) {
      console.warn(`  mislukt (${attempt}): ${url}: ${(err as Error).message}`)
    }
    await sleep(3000)
  }
  return null
}

async function scheepjes(): Promise<SourceEntry[]> {
  console.log('Scheepjes: woonplaatsen ophalen…')
  const places = await overpass(`
[out:json][timeout:120];
area["ISO3166-1"="NL"][admin_level=2]->.nl;
node["place"~"^(city|town)$"]["name"](area.nl);
out;`)
  const names = [...new Set(places.map((p) => p.tags!.name))].sort()
  console.log(`  ${names.length} woonplaatsen`)
  const all: SourceEntry[] = []
  for (const [i, name] of names.entries()) {
    const url = `https://www.scheepjes.com/nl/winkels/?stores=${encodeURIComponent(name)}`
    const html = await get(url)
    if (html) all.push(...parseScheepjes(html, 'https://www.scheepjes.com/nl/winkels/'))
    if (i % 25 === 0) console.log(`  ${i}/${names.length} … ${dedupeEntries(all).length} winkels`)
    await sleep(DELAY_MS)
  }
  return dedupeEntries(all)
}

async function rico(): Promise<SourceEntry[]> {
  console.log('Rico Design: raster over Nederland…')
  const all: SourceEntry[] = []
  for (let lat = 50.8; lat <= 53.5; lat += 0.3) {
    for (let lon = 3.5; lon <= 7.1; lon += 0.45) {
      const url = `https://www.rico-design.de/en/storefinder/?lat=${lat.toFixed(2)}&lng=${lon.toFixed(2)}&rad=30`
      const html = await get(url)
      if (html) all.push(...parseRico(html, 'https://www.rico-design.de/en/storefinder/'))
      await sleep(DELAY_MS)
    }
  }
  return dedupeEntries(all)
}

async function main() {
  const results: SourceEntry[] = []
  for (const [label, fn] of [['Scheepjes', scheepjes], ['Rico', rico]] as const) {
    try {
      const entries = await fn()
      console.log(`  ${label}: ${entries.length} verkooppunten`)
      results.push(...entries)
    } catch (err) {
      console.error(`  ${label} mislukt:`, (err as Error).message)
    }
  }
  if (results.length === 0) {
    console.error('Geen verkooppunten gevonden; dealers.json blijft ongewijzigd.')
    process.exit(1)
  }
  results.sort((a, b) => `${a.brand}${a.city}${a.name}`.localeCompare(`${b.brand}${b.city}${b.name}`))
  await writeFile(OUTPUT, JSON.stringify(results, null, 1) + '\n')
  console.log(`Klaar: ${results.length} verkooppunten naar data/sources/dealers.json`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
