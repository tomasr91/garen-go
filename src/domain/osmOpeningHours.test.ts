import { describe, expect, it } from 'vitest'
import { parseOsmOpeningHours } from './osmOpeningHours.ts'

describe('parseOsmOpeningHours', () => {
  it('leest een gewoon winkelschema', () => {
    const h = parseOsmOpeningHours('Tu-Fr 09:30-17:30; Sa 09:30-17:00')!
    expect(h.weekly.mo).toEqual([])
    expect(h.weekly.tu).toEqual([{ open: '09:30', close: '17:30' }])
    expect(h.weekly.sa).toEqual([{ open: '09:30', close: '17:00' }])
    expect(h.weekly.su).toEqual([])
  })
  it('leest meerdere tijdvakken en daglijsten', () => {
    const h = parseOsmOpeningHours('Mo,We 9:00-12:00,13:00-17:00; Su off')!
    expect(h.weekly.mo).toEqual([{ open: '09:00', close: '12:00' }, { open: '13:00', close: '17:00' }])
    expect(h.weekly.we).toHaveLength(2)
    expect(h.weekly.tu).toEqual([])
  })
  it('latere regels overschrijven eerdere', () => {
    const h = parseOsmOpeningHours('Mo-Sa 09:00-18:00; We 09:00-12:00')!
    expect(h.weekly.we).toEqual([{ open: '09:00', close: '12:00' }])
    expect(h.weekly.th).toEqual([{ open: '09:00', close: '18:00' }])
  })
  it('slaat feestdagregels over', () => {
    expect(parseOsmOpeningHours('Mo-Fr 10:00-17:00; PH off')!.weekly.fr).toEqual([{ open: '10:00', close: '17:00' }])
    expect(parseOsmOpeningHours('Mo-Sa 10:00-17:00; Su,PH off')!.weekly.su).toEqual([])
  })
  it('accepteert spaties rond streepjes', () => {
    expect(parseOsmOpeningHours('Mo - Fr 09:00 - 17:00')!.weekly.mo).toEqual([{ open: '09:00', close: '17:00' }])
  })
  it('geeft null bij notaties die we niet zeker kunnen lezen', () => {
    for (const raw of ['Jan-Mar Mo-Fr 10:00-16:00', 'Mo-Fr 09:00+', 'Su[1] 12:00-17:00', 'op afspraak', 'Mo-Fr 09:00-17:00 "behalve vakantie"', '']) {
      expect(parseOsmOpeningHours(raw), raw).toBeNull()
    }
  })
  it('accepteert een komma als regelscheiding', () => {
    expect(parseOsmOpeningHours('Tu-Fr 09:30-18:00, Sa 09:30-17:00')!.weekly.sa).toEqual([{ open: '09:30', close: '17:00' }])
  })
  it('ondersteunt 24/7', () => {
    expect(parseOsmOpeningHours('24/7')!.weekly.su).toEqual([{ open: '00:00', close: '24:00' }])
  })
})
