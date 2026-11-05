import type { OsmElement } from './mapping.ts'

/** Overpass API met terugvalservers en time-outs. */
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]
export const USER_AGENT = 'GarenEnGo-data-import/1.0 (+https://github.com/tomasr91/garen-go)'


export async function overpass(query: string): Promise<OsmElement[]> {
  let lastError: unknown
  for (const endpoint of ENDPOINTS) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
          body: new URLSearchParams({ data: query }),
          signal: AbortSignal.timeout(300_000),
        })
        if (!res.ok) throw new Error(`${endpoint} gaf HTTP ${res.status}`)
        const json = (await res.json()) as { elements: OsmElement[]; remark?: string }
        // Bij een time-out of overbelasting geeft Overpass soms HTTP 200 met een onvolledig resultaat + "remark".
        if (json.remark && /error|timed out|out of memory|runtime/i.test(json.remark)) {
          throw new Error(`onvolledig resultaat: ${json.remark.slice(0, 120)}`)
        }
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

