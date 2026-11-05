import { isValidTime } from './openingHours.ts'
import { DAY_KEYS, emptyWeek, type OpeningHours, type TimeRange } from './types.ts'

/**
 * Bewust beperkte parser voor de OpenStreetMap `opening_hours`-notatie.
 *
 * Ondersteunt de vormen die winkels vrijwel altijd gebruiken:
 *   "Mo-Fr 09:00-17:30; Sa 10:00-17:00", "Tu,Th 09:00-12:00,13:00-17:00", "Su off", "24/7".
 * Regels voor feestdagen (PH/SH) worden overgeslagen.
 *
 * Alles wat we niet zeker kunnen interpreteren (maanden, weeknummers, "Su[1]",
 * zonsopkomst, "open end", opmerkingen) levert `null` op: dan tonen we
 * "Openingstijden onbekend" in plaats van een gok.
 */

const OSM_DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const TIME_RANGE = /^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/

function pad(t: string): string {
  const [h, m] = t.split(':')
  return `${h.padStart(2, '0')}:${m}`
}

function parseDaySelector(selector: string): number[] | null {
  const days = new Set<number>()
  for (const token of selector.split(',')) {
    const tok = token.trim()
    if (tok === 'PH' || tok === 'SH') continue
    const range = /^([A-Z][a-z])-([A-Z][a-z])$/.exec(tok)
    if (range) {
      const a = OSM_DAYS.indexOf(range[1])
      const b = OSM_DAYS.indexOf(range[2])
      if (a < 0 || b < 0) return null
      for (let i = a; ; i = (i + 1) % 7) {
        days.add(i)
        if (i === b) break
      }
      continue
    }
    const single = OSM_DAYS.indexOf(tok)
    if (single < 0) return null
    days.add(single)
  }
  return [...days]
}

function parseTimes(part: string): TimeRange[] | null {
  const p = part.trim().toLowerCase()
  if (p === 'off' || p === 'closed') return []
  const ranges: TimeRange[] = []
  for (const token of part.split(',')) {
    const m = TIME_RANGE.exec(token.trim())
    if (!m || !isValidTime(m[1]) || !isValidTime(m[2])) return null
    ranges.push({ open: pad(m[1]), close: pad(m[2]) })
  }
  return ranges
}

export function parseOsmOpeningHours(raw: string | undefined | null): OpeningHours | null {
  if (!raw) return null
  const value = raw.trim().replace(/\s*-\s*/g, '-').replace(/\s*,\s*/g, ',').replace(/\s+/g, ' ')
  if (!value || value.includes('||') || value.includes('"')) return null

  if (value === '24/7') {
    const weekly = emptyWeek()
    for (const d of DAY_KEYS) weekly[d] = [{ open: '00:00', close: '24:00' }]
    return { weekly, raw }
  }

  const weekly = emptyWeek()
  let anyRule = false
  for (const rawRule of value.split(';')) {
    const rule = rawRule.trim()
    if (!rule) continue
    // Feestdagregels ("PH off", "PH 10:00-16:00", "SH off") nog niet ondersteund: overslaan.
    if (/^(PH|SH)\b/.test(rule)) continue

    const space = rule.indexOf(' ')
    let days: number[] | null
    let times: TimeRange[] | null
    if (/^\d/.test(rule)) {
      days = [0, 1, 2, 3, 4, 5, 6]
      times = parseTimes(rule)
    } else {
      if (space < 0) return null
      days = parseDaySelector(rule.slice(0, space))
      times = parseTimes(rule.slice(space + 1))
    }
    if (!days || !times) return null
    // Latere regels overschrijven eerdere voor dezelfde dagen (OSM-semantiek).
    for (const d of days) weekly[DAY_KEYS[d]] = times
    anyRule = true
  }
  if (!anyRule) return null
  return { weekly, raw }
}
