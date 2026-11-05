import { isValidTime } from '../../src/domain/openingHours.ts'
import { parseOsmOpeningHours } from '../../src/domain/osmOpeningHours.ts'
import { DAY_KEYS, emptyWeek, type DayKey, type TimeRange, type WeeklyHours } from '../../src/domain/types.ts'

/**
 * Haalt openingstijden uit de HTML van een winkelwebsite. Bewust streng: bij twijfel `null`.
 *
 * 1. schema.org JSON-LD (`openingHoursSpecification` of `openingHours`)
 * 2. microdata (`itemprop="openingHours" content="…"`)
 * 3. Nederlandse tekst vlak na een kopje als "Openingstijden", bijv. "Di t/m vr 13.00 – 17.30 uur"
 */

export type HoursMethod = 'schema.org' | 'microdata' | 'tekst'

export interface ParsedHours {
  weekly: WeeklyHours
  method: HoursMethod
  /** Leesbare samenvatting van wat er gevonden is, voor controle. */
  evidence: string
}

const SCHEMA_DAYS: Record<string, DayKey> = {
  monday: 'mo', tuesday: 'tu', wednesday: 'we', thursday: 'th', friday: 'fr', saturday: 'sa', sunday: 'su',
  mo: 'mo', tu: 'tu', we: 'we', th: 'th', fr: 'fr', sa: 'sa', su: 'su',
}

function pad(t: string): string | null {
  const m = /^(\d{1,2})[:.u]?(\d{2})?/.exec(t.trim())
  if (!m) return null
  const v = `${m[1].padStart(2, '0')}:${m[2] ?? '00'}`
  return isValidTime(v) ? v : null
}

/** Redelijke winkeltijden: openen tussen 06:00 en 22:00, minimaal een half uur open. */
function plausible(r: TimeRange): boolean {
  const [oh, om] = r.open.split(':').map(Number)
  const [ch, cm] = r.close.split(':').map(Number)
  const o = oh * 60 + om
  const c = ch * 60 + cm
  return o >= 360 && o <= 1320 && c - o >= 30 && c <= 1440
}

function countDays(w: WeeklyHours, specified: Set<DayKey>): number {
  return DAY_KEYS.filter((d) => specified.has(d) || w[d].length > 0).length
}

// ───────── 1. JSON-LD ─────────

interface LdSpec {
  dayOfWeek?: string | string[]
  opens?: string
  closes?: string
}

function collectLd(node: unknown, out: { specs: LdSpec[]; strings: string[]; postcodes: string[] }[], current?: { specs: LdSpec[]; strings: string[]; postcodes: string[] }) {
  if (Array.isArray(node)) {
    for (const n of node) collectLd(n, out, current)
    return
  }
  if (!node || typeof node !== 'object') return
  const obj = node as Record<string, unknown>
  let target = current
  if ('openingHoursSpecification' in obj || 'openingHours' in obj) {
    target = { specs: [], strings: [], postcodes: [] }
    out.push(target)
    const spec = obj.openingHoursSpecification
    for (const s of Array.isArray(spec) ? spec : spec ? [spec] : []) target.specs.push(s as LdSpec)
    const oh = obj.openingHours
    for (const s of Array.isArray(oh) ? oh : oh ? [oh] : []) if (typeof s === 'string') target.strings.push(s)
    const addr = obj.address as Record<string, unknown> | undefined
    if (addr && typeof addr.postalCode === 'string') target.postcodes.push(addr.postalCode.replace(/\s/g, '').toUpperCase())
  }
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'openingHoursSpecification' || k === 'openingHours') continue
    collectLd(v, out, target === current ? current : undefined)
  }
}

function weeklyFromLd(entry: { specs: LdSpec[]; strings: string[] }): WeeklyHours | null {
  if (entry.specs.length) {
    const w = emptyWeek()
    const specified = new Set<DayKey>()
    for (const s of entry.specs) {
      const days = (Array.isArray(s.dayOfWeek) ? s.dayOfWeek : [s.dayOfWeek ?? ''])
        .map((d) => SCHEMA_DAYS[String(d).replace(/^https?:\/\/schema\.org\//i, '').toLowerCase()])
        .filter(Boolean)
      if (!days.length) return null // validFrom/validThrough-specials e.d. zonder dag: niet zeker
      const open = s.opens ? pad(s.opens) : null
      const close = s.closes ? pad(s.closes) : null
      for (const d of days) {
        specified.add(d)
        if (!open || !close || (open === '00:00' && close === '00:00')) continue // gesloten
        const r = { open, close: close === '00:00' ? '24:00' : close }
        if (!plausible(r)) return null
        w[d] = [...w[d], r]
      }
    }
    return countDays(w, specified) >= 3 ? w : null
  }
  if (entry.strings.length) {
    const parsed = parseOsmOpeningHours(entry.strings.join('; '))
    return parsed && DAY_KEYS.every((d) => parsed.weekly[d].every(plausible)) ? parsed.weekly : null
  }
  return null
}

function fromJsonLd(html: string, postcode?: string): ParsedHours | null {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
  const entries: { specs: LdSpec[]; strings: string[]; postcodes: string[] }[] = []
  for (const b of blocks) {
    try {
      collectLd(JSON.parse(b[1].trim()), entries)
    } catch {
      /* ongeldige JSON-LD negeren */
    }
  }
  const usable = entries.filter((e) => e.specs.length || e.strings.length)
  if (!usable.length) return null
  // Meerdere vestigingen: alleen het blok met de juiste postcode, anders niets.
  let chosen = usable
  if (usable.length > 1) {
    const pc = postcode?.replace(/\s/g, '').toUpperCase()
    chosen = pc ? usable.filter((e) => e.postcodes.includes(pc)) : []
    if (chosen.length !== 1) return null
  }
  const weekly = weeklyFromLd(chosen[0])
  return weekly ? { weekly, method: 'schema.org', evidence: JSON.stringify(chosen[0].specs.length ? chosen[0].specs : chosen[0].strings).slice(0, 300) } : null
}

// ───────── 2. Microdata ─────────

function fromMicrodata(html: string): ParsedHours | null {
  const values = [...html.matchAll(/itemprop=["']openingHours["'][^>]*content=["']([^"']+)["']/gi)].map((m) => m[1])
  if (!values.length) return null
  const parsed = parseOsmOpeningHours(values.join('; '))
  if (!parsed || !DAY_KEYS.every((d) => parsed.weekly[d].every(plausible))) return null
  if (countDays(parsed.weekly, new Set()) < 2) return null
  return { weekly: parsed.weekly, method: 'microdata', evidence: values.join('; ') }
}

// ───────── 3. Nederlandse tekst ─────────

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h\d|section|article|dt|dd|table|ul|ol)>/gi, '\n')
    .replace(/<\/(td|th)>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&ndash;|&#8211;/g, '–')
    .replace(/&mdash;|&#8212;/g, '—')
    .replace(/&[a-z]+;|&#\d+;/gi, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*/g, '\n')
}

const DAY_WORDS: [RegExp, DayKey][] = [
  [/^(maandag|maandagen|ma)$/, 'mo'],
  [/^(dinsdag|dinsdagen|di)$/, 'tu'],
  [/^(woensdag|woensdagen|wo|woe)$/, 'we'],
  [/^(donderdag|donderdagen|do|don)$/, 'th'],
  [/^(vrijdag|vrijdagen|vr|vrij)$/, 'fr'],
  [/^(zaterdag|zaterdagen|za|zat)$/, 'sa'],
  [/^(zondag|zondagen|zo|zon)$/, 'su'],
]
const DAY_ALT = 'maandagen|maandag|dinsdagen|dinsdag|woensdagen|woensdag|donderdagen|donderdag|vrijdagen|vrijdag|zaterdagen|zaterdag|zondagen|zondag|woe|don|vrij|zat|zon|ma|di|wo|do|vr|za|zo'
const DAY = `(?:${DAY_ALT})\\.?`
const TIME = `\\d{1,2}(?:[.:u]\\d{2})?`
const RANGE = `${TIME}\\s*(?:uur\\s*)?(?:-|–|—|tot)\\s*${TIME}`
const DAYSPEC = `${DAY}(?:\\s*(?:t\\/m|tm|tot en met|-|–|—)\\s*${DAY})?(?:\\s*(?:,|&|en|\\/)\\s*${DAY}(?:\\s*(?:t\\/m|tm|tot en met|-|–)\\s*${DAY})?)*`
const ENTRY = new RegExp(
  `(?<![a-z])(${DAYSPEC})\\s*[:.]?\\s*(?:van\\s+)?((?:${RANGE})(?:\\s*(?:uur)?\\s*(?:,|en|&|\\/|;)?\\s*(?:${RANGE}))*|gesloten|dicht|closed)(?![\\d])`,
  'gi',
)
const ANCHOR = /(openingstijden|openingstijd|openings tijden|winkeltijden|geopend op|openingsuren|wij zijn open|we zijn open)/gi

function dayOf(word: string): DayKey | undefined {
  const w = word.toLowerCase().replace(/\.$/, '')
  return DAY_WORDS.find(([re]) => re.test(w))?.[1]
}

function expandDaySpec(spec: string): DayKey[] | null {
  // "t/m" eerst vervangen, anders splitst de "/" hem in tweeën.
  const parts = spec.toLowerCase().replace(/t\/m/g, 'tm').split(/\s*(?:,|&|\ben\b|\/)\s*/)
  const days: DayKey[] = []
  for (const part of parts) {
    const range = new RegExp(`^(${DAY})\\s*(?:t\\/m|tm|tot en met|-|–|—)\\s*(${DAY})$`).exec(part.trim())
    if (range) {
      const a = dayOf(range[1])
      const b = dayOf(range[2])
      if (!a || !b) return null
      const ia = DAY_KEYS.indexOf(a)
      const ib = DAY_KEYS.indexOf(b)
      if (ib < ia) return null
      for (let i = ia; i <= ib; i++) days.push(DAY_KEYS[i])
      continue
    }
    const d = dayOf(part.trim())
    if (!d) return null
    days.push(d)
  }
  return days
}

function parseRanges(text: string): TimeRange[] | null {
  const ranges: TimeRange[] = []
  for (const m of text.matchAll(new RegExp(`(${TIME})\\s*(?:uur\\s*)?(?:-|–|—|tot)\\s*(${TIME})`, 'g'))) {
    const open = pad(m[1])
    const close = pad(m[2])
    if (!open || !close) return null
    const r = { open, close }
    if (!plausible(r)) return null
    ranges.push(r)
  }
  return ranges.length ? ranges : null
}

function fromText(html: string): ParsedHours | null {
  const text = htmlToText(html)
  const lower = text.toLowerCase()
  const week = emptyWeek()
  const specified = new Set<DayKey>()
  const evidence: string[] = []
  let conflict = false
  for (const anchor of lower.matchAll(ANCHOR)) {
    const windowText = lower.slice(anchor.index, anchor.index + 700)
    // Seizoensroosters (zomer/winter) of "op afspraak" in hetzelfde blok: te onzeker.
    if (/(zomer|winter|vakantie)tijden|zomerperiode|wintertijd|zomertijd/.test(windowText.slice(0, 400))) return null
    for (const m of windowText.matchAll(ENTRY)) {
      const days = expandDaySpec(m[1])
      if (!days) continue
      const value = m[2].trim()
      const ranges = /gesloten|dicht|closed/.test(value) ? [] : parseRanges(value)
      if (ranges === null) continue
      for (const d of days) {
        const key = JSON.stringify(ranges)
        if (specified.has(d) && JSON.stringify(week[d]) !== key) conflict = true
        week[d] = ranges
        specified.add(d)
      }
      evidence.push(m[0].replace(/\s+/g, ' ').trim())
    }
  }
  if (conflict) return null
  if (specified.size < 3 || !DAY_KEYS.some((d) => week[d].length)) return null
  return { weekly: week, method: 'tekst', evidence: [...new Set(evidence)].join(' | ').slice(0, 300) }
}

export function extractOpeningHours(html: string, postcode?: string): ParsedHours | null {
  return fromJsonLd(html, postcode) ?? fromMicrodata(html) ?? fromText(html)
}

/** Links op dezelfde site die waarschijnlijk openingstijden bevatten. */
export function candidateLinks(html: string, baseUrl: string): string[] {
  const base = new URL(baseUrl)
  const out: string[] = []
  for (const m of html.matchAll(/<a\s[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const label = htmlToText(m[2]).toLowerCase()
    const href = m[1]
    if (!/(openingstijd|contact|over[- ]ons|winkel|bezoek|locatie|route)/i.test(`${href} ${label}`)) continue
    try {
      const u = new URL(href, base)
      if (u.hostname.replace(/^www\./, '') !== base.hostname.replace(/^www\./, '')) continue
      if (/\.(pdf|jpe?g|png|gif)$/i.test(u.pathname)) continue
      out.push(u.href)
    } catch {
      /* ongeldige link */
    }
  }
  // Pagina's met "openingstijden" eerst.
  return [...new Set(out)].sort((a, b) => Number(/openingstijd/i.test(b)) - Number(/openingstijd/i.test(a))).slice(0, 2)
}
