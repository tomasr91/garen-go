import type { Shop, WeeklyHours } from '../../src/domain/types.ts'

/** Gevonden openingstijden per winkel-ID (data/sources/website-hours.json). */
export interface WebsiteHoursEntry {
  weekly: WeeklyHours
  method: string
  url: string
  retrievedAt: string
  evidence: string
}
export type WebsiteHoursMap = Record<string, WebsiteHoursEntry>

/** Vult alleen winkels zonder openingstijden aan; bestaande tijden (OSM, handmatig, beheer) gaan altijd voor. */
export function applyWebsiteHours(shops: Shop[], map: WebsiteHoursMap): { shops: Shop[]; applied: number } {
  let applied = 0
  const out = shops.map((s) => {
    const e = map[s.id]
    if (!e || s.openingHours) return s
    applied++
    const date = e.retrievedAt.slice(0, 10)
    const notes = (s.notes ?? '')
      .replace(/openingstijden ontbreken;?\s*/i, '')
      .replace(/;\s*openingstijden ontbreken/i, '')
      .replace(/^Te controleren:\s*\.?$/, '')
      .trim()
    return {
      ...s,
      openingHours: { weekly: e.weekly, source: { url: e.url, method: e.method, retrievedAt: date } },
      notes: [notes, `Openingstijden automatisch overgenomen van ${e.url} (${e.method}, ${date}); controleren.`].filter(Boolean).join(' '),
    }
  })
  return { shops: out, applied }
}

/** Domein zonder www, of null voor sociale media en dergelijke (daar staan geen bruikbare tijden in de HTML). */
export function siteDomain(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
    if (/(facebook|instagram|google|goo\.gl|linktr\.ee|marktplaats|wix\.com$|etsy|bol\.com|amazon)/.test(host)) return null
    return host
  } catch {
    return null
  }
}

/** robots.txt-patroon: prefix, met * als wildcard en $ als einde. "/*?x" blokkeert dus niet de hele site. */
export function robotsRuleMatches(rule: string, path: string): boolean {
  const body = rule.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp('^' + body).test(path)
}
