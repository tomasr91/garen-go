/**
 * Zoekt openingstijden op de eigen websites van winkels die er nog geen hebben.
 * Schrijft data/sources/website-hours.json en werkt public/data/shops.json direct bij.
 *
 * Gebruik:  npm run data:hours
 *
 * Beleefd: respecteert robots.txt, maximaal 3 pagina's per winkel, een paar tegelijk.
 * Streng: alleen eenduidige tijden (zie hoursParser.ts); alles krijgt "controleren" in de notities.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { ShopDataset } from '../src/domain/types.ts'
import { candidateLinks, extractOpeningHours } from './sources/hoursParser.ts'
import { applyWebsiteHours, robotsRuleMatches, siteDomain, type WebsiteHoursMap } from './sources/websiteHours.ts'

const SHOPS = resolve(import.meta.dirname, '../public/data/shops.json')
const OUTPUT = resolve(import.meta.dirname, '../data/sources/website-hours.json')
const UA = 'Mozilla/5.0 (compatible; GarenEnGo-hours/1.0; +https://github.com/tomasr91/garen-go)'
const CONCURRENCY = 6

async function get(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'nl-NL,nl' }, redirect: 'follow', signal: AbortSignal.timeout(15_000) })
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('html')) return null
    const text = await res.text()
    return text.length > 3_000_000 ? text.slice(0, 3_000_000) : text
  } catch {
    return null
  }
}

const robotsCache = new Map<string, Promise<string[]>>()
/** Disallow-regels voor User-agent: * (eenvoudige maar correcte variant). */
function disallowed(origin: string): Promise<string[]> {
  if (!robotsCache.has(origin)) {
    robotsCache.set(
      origin,
      fetch(`${origin}/robots.txt`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10_000) })
        .then((r) => (r.ok ? r.text() : ''))
        .catch(() => '')
        .then((txt) => {
          const rules: string[] = []
          let applies = false
          for (const raw of txt.split(/\r?\n/)) {
            const line = raw.replace(/#.*/, '').trim()
            const [k, ...rest] = line.split(':')
            const v = rest.join(':').trim()
            if (/^user-agent$/i.test(k)) applies = v === '*'
            else if (applies && /^disallow$/i.test(k) && v) rules.push(v)
          }
          return rules
        }),
    )
  }
  return robotsCache.get(origin)!
}
async function allowed(url: string): Promise<boolean> {
  const u = new URL(url)
  const rules = await disallowed(u.origin)
  return !rules.some((r) => robotsRuleMatches(r, u.pathname + u.search))
}

async function main() {
  const dataset = JSON.parse(await readFile(SHOPS, 'utf8')) as ShopDataset
  let existing: WebsiteHoursMap = {}
  try {
    existing = JSON.parse(await readFile(OUTPUT, 'utf8')) as WebsiteHoursMap
  } catch {
    /* eerste keer */
  }

  const domainCount = new Map<string, number>()
  for (const s of dataset.shops) {
    const d = s.website ? siteDomain(s.website) : null
    if (d) domainCount.set(d, (domainCount.get(d) ?? 0) + 1)
  }
  const todo = dataset.shops.filter((s) => s.active && !s.openingHours && s.website && siteDomain(s.website))
  console.log(`${todo.length} winkels zonder openingstijden met een eigen website`)

  const found: WebsiteHoursMap = { ...existing }
  const stats = { found: 0, none: 0, blocked: 0, failed: 0, shared: 0 }
  let index = 0
  const now = new Date().toISOString()

  async function worker() {
    while (index < todo.length) {
      const shop = todo[index++]
      const shared = (domainCount.get(siteDomain(shop.website!)!) ?? 0) > 1
      const pages = [shop.website!]
      let result: ReturnType<typeof extractOpeningHours> = null
      let resultUrl = ''
      let fetchedAny = false
      for (let i = 0; i < pages.length && i < 3 && !result; i++) {
        const url = pages[i]
        if (!(await allowed(url))) {
          stats.blocked++
          break
        }
        const html = await get(url)
        if (!html) continue
        fetchedAny = true
        const r = extractOpeningHours(html, shop.postcode)
        // Gedeelde website (keten/meerdere vestigingen): alleen schema.org met deze postcode op de pagina.
        const pcOnPage = shop.postcode && html.replace(/\s/g, '').toUpperCase().includes(shop.postcode.replace(/\s/g, ''))
        if (r && (!shared || (r.method === 'schema.org' && pcOnPage))) {
          result = r
          resultUrl = url
        } else if (r && shared) {
          stats.shared++
        }
        if (i === 0) pages.push(...candidateLinks(html, url))
      }
      if (result) {
        found[shop.id] = { weekly: result.weekly, method: result.method, url: resultUrl, retrievedAt: now, evidence: result.evidence }
        stats.found++
        console.log(`  ✓ ${shop.name} (${shop.city}) [${result.method}] ${result.evidence.slice(0, 90)}`)
      } else if (fetchedAny) stats.none++
      else stats.failed++
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  await writeFile(OUTPUT, JSON.stringify(found, null, 1) + '\n')
  const { shops, applied } = applyWebsiteHours(dataset.shops, found)
  await writeFile(SHOPS, JSON.stringify({ ...dataset, shops }, null, 1) + '\n')
  console.log(`\nKlaar: ${stats.found} gevonden, ${stats.none} geen eenduidige tijden, ${stats.failed} niet bereikbaar, ` +
    `${stats.blocked} geblokkeerd door robots.txt, ${stats.shared} overgeslagen (gedeelde ketenwebsite).`)
  console.log(`${applied} winkels hebben nu openingstijden van hun website.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
