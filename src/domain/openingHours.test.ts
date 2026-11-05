import { describe, expect, it } from 'vitest'
import { getOpeningStatus, statusDetail, toAmsterdam } from './openingHours.ts'
import { emptyWeek, type OpeningHours } from './types.ts'

function hours(partial: Partial<OpeningHours['weekly']>, exceptions?: OpeningHours['exceptions']): OpeningHours {
  return { weekly: { ...emptyWeek(), ...partial }, exceptions }
}
const weekdays = hours({
  mo: [{ open: '09:00', close: '17:30' }],
  tu: [{ open: '09:00', close: '17:30' }],
  we: [{ open: '09:00', close: '17:30' }],
  th: [{ open: '09:00', close: '12:00' }, { open: '13:00', close: '17:30' }],
  fr: [{ open: '09:00', close: '17:30' }],
  sa: [{ open: '10:00', close: '17:00' }],
})

// Donderdag 5 november 2026, wintertijd (UTC+1).
const thu = (hhmm: string) => new Date(`2026-11-05T${hhmm}:00+01:00`)

describe('toAmsterdam', () => {
  it('houdt rekening met wintertijd', () => {
    expect(toAmsterdam(new Date('2026-11-05T15:00:00Z'))).toEqual({ date: '2026-11-05', dayIndex: 3, minutes: 16 * 60 })
  })
  it('houdt rekening met zomertijd', () => {
    // 1 juli 2026 is een woensdag; 10:00 UTC = 12:00 in Amsterdam.
    expect(toAmsterdam(new Date('2026-07-01T10:00:00Z'))).toEqual({ date: '2026-07-01', dayIndex: 2, minutes: 12 * 60 })
  })
  it('wisselt van dag rond middernacht lokaal, niet UTC', () => {
    // 23:30 UTC op 5 nov = 00:30 op vrijdag 6 nov in Amsterdam.
    expect(toAmsterdam(new Date('2026-11-05T23:30:00Z')).dayIndex).toBe(4)
  })
})

describe('getOpeningStatus', () => {
  it('is open midden op de dag', () => {
    const s = getOpeningStatus(weekdays, thu('14:00'))
    expect(s).toMatchObject({ kind: 'open', closesAt: '17:30', minutesUntilClose: 210 })
    expect(statusDetail(s)).toBe('Sluit om 17:30')
  })
  it('sluit binnenkort binnen 30 minuten', () => {
    const s = getOpeningStatus(weekdays, thu('17:05'))
    expect(s).toMatchObject({ kind: 'closing-soon', minutesUntilClose: 25 })
    expect(statusDetail(s)).toBe('Sluit over 25 minuten (17:30)')
  })
  it('precies 30 minuten voor sluiting telt als binnenkort', () => {
    expect(getOpeningStatus(weekdays, thu('17:00')).kind).toBe('closing-soon')
    expect(getOpeningStatus(weekdays, thu('16:59')).kind).toBe('open')
  })
  it('is gesloten in de middagpauze en weet wanneer hij weer opent', () => {
    const s = getOpeningStatus(weekdays, thu('12:30'))
    expect(s.kind).toBe('closed')
    expect(statusDetail(s)).toBe('Opent vandaag om 13:00')
  })
  it('is gesloten op het sluitingstijdstip', () => {
    const s = getOpeningStatus(weekdays, thu('17:30'))
    expect(s.kind).toBe('closed')
    expect(statusDetail(s)).toBe('Opent morgen om 09:00')
  })
  it('slaat gesloten dagen over bij de volgende opening', () => {
    // Zaterdag 7 nov 18:00 → zondag dicht → maandag 09:00.
    const s = getOpeningStatus(weekdays, new Date('2026-11-07T18:00:00+01:00'))
    expect(statusDetail(s)).toBe('Opent ma om 09:00')
  })
  it('ondersteunt openingstijden over middernacht', () => {
    const late = hours({ fr: [{ open: '20:00', close: '02:00' }] })
    // Zaterdag 01:00 valt nog in het tijdvak van vrijdag.
    expect(getOpeningStatus(late, new Date('2026-11-07T01:00:00+01:00'))).toMatchObject({ kind: 'open', closesAt: '02:00' })
    expect(getOpeningStatus(late, new Date('2026-11-07T01:45:00+01:00')).kind).toBe('closing-soon')
    expect(getOpeningStatus(late, new Date('2026-11-07T02:00:00+01:00')).kind).toBe('closed')
    expect(getOpeningStatus(late, new Date('2026-11-06T23:00:00+01:00')).kind).toBe('open')
  })
  it('geeft onbekend zonder openingstijden en verzint niets', () => {
    expect(getOpeningStatus(null, thu('14:00'))).toEqual({ kind: 'unknown' })
    expect(getOpeningStatus(hours({}), thu('14:00'))).toEqual({ kind: 'unknown' })
  })
  it('gebruikt uitzonderingen boven het weekschema', () => {
    const h = hours(weekdays.weekly, [{ date: '2026-11-05', ranges: [], reason: 'Vakantie' }])
    expect(getOpeningStatus(h, thu('14:00')).kind).toBe('closed')
  })
  it('werkt ook in zomertijd', () => {
    // Woensdag 1 juli 2026 15:20 UTC = 17:20 lokaal → sluit over 10 min.
    expect(getOpeningStatus(weekdays, new Date('2026-07-01T15:20:00Z'))).toMatchObject({ kind: 'closing-soon', minutesUntilClose: 10 })
  })
})
