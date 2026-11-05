import { NAME_HINTS } from '../osm/mapping.ts'
import type { SourceEntry } from './extraSources.ts'

/** Parsers voor openbare verkooppuntenlijsten van garenmerken. Elke parser levert SourceEntry's op. */

function decode(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&#039;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** "Hendrik Droststraat 48, 8121 BJ Olst" → straat, postcode, plaats. */
export function splitDutchAddress(text: string): { address: string; postcode: string; city: string } | null {
  const m = /^(.*?),?\s*(\d{4})\s?([A-Z]{2})\s+(.+)$/i.exec(text.trim())
  if (!m) return null
  return { address: m[1].trim().replace(/,$/, ''), postcode: `${m[2]} ${m[3].toUpperCase()}`, city: m[4].trim() }
}

function categoriesFor(name: string, base: string[]): string[] {
  const cats = new Set(base)
  for (const [re, cat] of NAME_HINTS) if (re.test(name)) cats.add(cat)
  return [...cats]
}

/**
 * Scheepjes-winkelzoeker (scheepjes.com/nl/winkels/?stores=<plaats>): een HTML-tabel per zoekopdracht.
 * Alleen fysieke winkels in Nederland; pure webshops slaan we over.
 */
export function parseScheepjes(html: string, pageUrl: string): SourceEntry[] {
  const out: SourceEntry[] = []
  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? []
  for (const row of rows) {
    const cell = (cls: string) => {
      const m = new RegExp(`<td class="${cls}">([\\s\\S]*?)</td>`).exec(row)
      return m ? m[1] : ''
    }
    const name = decode(cell('name'))
    const type = decode(cell('type')).toLowerCase()
    const country = decode(cell('country'))
    if (!name || country !== 'Nederland') continue
    if (!/(winkel|store)/.test(type)) continue
    const addr = splitDutchAddress(decode(cell('address')))
    if (!addr) continue
    const phone = decode(cell('telephoneNumber')) || undefined
    const website = /href="(https?:\/\/[^"]+)"/.exec(cell('website'))?.[1]
    out.push({
      name,
      ...addr,
      categories: categoriesFor(name, ['wol']),
      phone,
      website,
      brand: 'Scheepjes',
      sourceUrl: pageUrl,
      verification: 'unverified',
      notes: 'Te controleren: overgenomen uit de Scheepjes-winkelzoeker; openingstijden ontbreken.',
    })
  }
  return out
}

interface RicoStore {
  position: { lat: number; lng: number }
  post: { post_title: string }
  fields: { address?: string; zipcode?: string; city?: string; country?: string; website?: string }
}

const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase())

/**
 * Rico Design-winkelzoeker. De namen bevatten vaak de naam van de eigenaar, daarom gebruiken we
 * deze lijst alleen om bestaande winkels aan te vullen (enrichOnly), nooit om winkels toe te voegen.
 */
export function parseRico(html: string, pageUrl: string): SourceEntry[] {
  const m = /var stores = (\[[\s\S]*?\]);\s/.exec(html)
  if (!m) return []
  let stores: RicoStore[]
  try {
    stores = JSON.parse(m[1]) as RicoStore[]
  } catch {
    return []
  }
  return stores
    .filter((s) => s.fields?.country === 'Netherlands' && s.fields.zipcode)
    .map((s) => ({
      name: titleCase(decode(s.post.post_title)),
      address: titleCase(s.fields.address ?? ''),
      postcode: (s.fields.zipcode ?? '').toUpperCase(),
      city: titleCase(s.fields.city ?? ''),
      lat: s.position.lat,
      lon: s.position.lng,
      categories: ['wol'],
      brand: 'Rico Design',
      sourceUrl: pageUrl,
      enrichOnly: true,
    }))
}

/** Ontdubbelen op postcode + huisnummer (of naam als het adres ontbreekt). */
export function dedupeEntries(entries: SourceEntry[]): SourceEntry[] {
  const seen = new Map<string, SourceEntry>()
  for (const e of entries) {
    const nr = /(\d+)/.exec(e.address)?.[1] ?? ''
    const key = `${e.brand}|${e.postcode.replace(/\s/g, '')}|${nr}`.toUpperCase()
    if (!seen.has(key)) seen.set(key, e)
  }
  return [...seen.values()]
}
