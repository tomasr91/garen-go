import { DAY_KEYS, type DayKey, type OpeningHours, type TimeRange } from './types.ts'

/** Alle tijden worden berekend in de Nederlandse tijdzone, inclusief zomer- en wintertijd. */
export const TIME_ZONE = 'Europe/Amsterdam'
/** Binnen dit aantal minuten voor sluiting tonen we "Sluit binnenkort". */
export const CLOSING_SOON_MINUTES = 30

export const DAY_LABELS: Record<DayKey, string> = {
  mo: 'Maandag',
  tu: 'Dinsdag',
  we: 'Woensdag',
  th: 'Donderdag',
  fr: 'Vrijdag',
  sa: 'Zaterdag',
  su: 'Zondag',
}
const DAY_SHORT: Record<DayKey, string> = { mo: 'ma', tu: 'di', we: 'wo', th: 'do', fr: 'vr', sa: 'za', su: 'zo' }

export interface LocalMoment {
  /** "YYYY-MM-DD" in Amsterdam. */
  date: string
  /** 0 = maandag … 6 = zondag. */
  dayIndex: number
  /** Minuten sinds middernacht (lokale wandkloktijd). */
  minutes: number
}

const partsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  weekday: 'short',
})
const WEEKDAY_INDEX: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }

/** Zet een absoluut tijdstip om naar de Nederlandse lokale datum, weekdag en tijd. */
export function toAmsterdam(now: Date): LocalMoment {
  const p: Record<string, string> = {}
  for (const part of partsFormatter.formatToParts(now)) p[part.type] = part.value
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    dayIndex: WEEKDAY_INDEX[p.weekday],
    minutes: Number(p.hour) * 60 + Number(p.minute),
  }
}

/** Kalenderdag `offset` dagen na `date` ("YYYY-MM-DD"). */
export function addDays(date: string, offset: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + offset)).toISOString().slice(0, 10)
}

export function parseTime(t: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim())
  if (!m) throw new Error(`Ongeldige tijd: ${t}`)
  return Number(m[1]) * 60 + Number(m[2])
}

export function isValidTime(t: string): boolean {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim())
  return !!m && Number(m[1]) <= 24 && Number(m[2]) < 60 && (Number(m[1]) < 24 || Number(m[2]) === 0)
}

export function formatTime(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** Open- en sluitminuut van een tijdvak; sluiting na middernacht krijgt +1440. */
function span(r: TimeRange): [number, number] {
  const o = parseTime(r.open)
  let c = parseTime(r.close)
  if (c <= o) c += 1440
  return [o, c]
}

/** Tijdvakken voor een specifieke kalenderdag, met uitzonderingen boven het weekschema. */
export function rangesForDate(hours: OpeningHours, date: string, dayIndex: number): TimeRange[] {
  const exception = hours.exceptions?.find((e) => e.date === date)
  if (exception) return exception.ranges
  return hours.weekly[DAY_KEYS[dayIndex]] ?? []
}

/** Is er überhaupt een bruikbaar schema? Een week zonder enig tijdvak behandelen we als onbekend. */
export function hasUsableHours(hours: OpeningHours | null | undefined): hours is OpeningHours {
  if (!hours) return false
  return DAY_KEYS.some((d) => (hours.weekly[d]?.length ?? 0) > 0)
}

export type StatusKind = 'open' | 'closing-soon' | 'closed' | 'unknown'

export interface OpeningStatus {
  kind: StatusKind
  /** Bij open: sluitingstijd "HH:MM". */
  closesAt?: string
  /** Bij open: minuten tot sluiting. */
  minutesUntilClose?: number
  /** Bij gesloten: volgende opening. `dayOffset` 0 = vandaag, 1 = morgen, … */
  nextOpen?: { dayOffset: number; dayKey: DayKey; time: string }
}

export function getOpeningStatus(hours: OpeningHours | null | undefined, now: Date): OpeningStatus {
  if (!hasUsableHours(hours)) return { kind: 'unknown' }
  const local = toAmsterdam(now)
  const t = local.minutes

  // Kandidaten die nú open kunnen zijn: tijdvakken van vandaag, en tijdvakken van gisteren die over middernacht lopen.
  let closeIn: number | undefined
  for (const r of rangesForDate(hours, local.date, local.dayIndex)) {
    const [o, c] = span(r)
    if (o <= t && t < c) closeIn = Math.max(closeIn ?? 0, c - t)
  }
  const yDate = addDays(local.date, -1)
  const yIndex = (local.dayIndex + 6) % 7
  for (const r of rangesForDate(hours, yDate, yIndex)) {
    const [, c] = span(r)
    if (c > 1440 && t < c - 1440) closeIn = Math.max(closeIn ?? 0, c - 1440 - t)
  }

  if (closeIn !== undefined) {
    return {
      kind: closeIn <= CLOSING_SOON_MINUTES ? 'closing-soon' : 'open',
      closesAt: formatTime(t + closeIn),
      minutesUntilClose: closeIn,
    }
  }

  // Gesloten: zoek de eerstvolgende opening binnen 8 dagen.
  for (let offset = 0; offset <= 7; offset++) {
    const date = addDays(local.date, offset)
    const dayIndex = (local.dayIndex + offset) % 7
    const opens = rangesForDate(hours, date, dayIndex)
      .map((r) => parseTime(r.open))
      .filter((o) => offset > 0 || o > t)
      .sort((a, b) => a - b)
    if (opens.length > 0) {
      return { kind: 'closed', nextOpen: { dayOffset: offset, dayKey: DAY_KEYS[dayIndex], time: formatTime(opens[0]) } }
    }
  }
  return { kind: 'closed' }
}

export const STATUS_LABEL: Record<StatusKind, string> = {
  open: 'Nu open',
  'closing-soon': 'Sluit binnenkort',
  closed: 'Gesloten',
  unknown: 'Openingstijden onbekend',
}

/** Secundaire regel onder de status, bijv. "Sluit om 17:30" of "Opent morgen om 09:00". */
export function statusDetail(s: OpeningStatus): string | undefined {
  switch (s.kind) {
    case 'open':
      return `Sluit om ${s.closesAt}`
    case 'closing-soon':
      return `Sluit over ${s.minutesUntilClose} ${s.minutesUntilClose === 1 ? 'minuut' : 'minuten'} (${s.closesAt})`
    case 'closed': {
      if (!s.nextOpen) return undefined
      const { dayOffset, dayKey, time } = s.nextOpen
      if (dayOffset === 0) return `Opent vandaag om ${time}`
      if (dayOffset === 1) return `Opent morgen om ${time}`
      return `Opent ${DAY_SHORT[dayKey]} om ${time}`
    }
    default:
      return undefined
  }
}

export function formatRanges(ranges: TimeRange[]): string {
  if (ranges.length === 0) return 'Gesloten'
  return ranges.map((r) => `${r.open}–${r.close}`).join(', ')
}
