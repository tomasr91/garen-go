import { describe, expect, it } from 'vitest'
import { candidateLinks, extractOpeningHours } from './hoursParser.ts'

const ld = (obj: unknown) => `<html><head><script type="application/ld+json">${JSON.stringify(obj)}</script></head><body></body></html>`

describe('schema.org JSON-LD', () => {
  it('leest openingHoursSpecification', () => {
    const r = extractOpeningHours(ld({
      '@type': 'Store',
      openingHoursSpecification: [
        { dayOfWeek: ['https://schema.org/Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens: '13:00', closes: '17:30' },
        { dayOfWeek: 'Saturday', opens: '09:30:00', closes: '16:00:00' },
      ],
    }))!
    expect(r.method).toBe('schema.org')
    expect(r.weekly.tu).toEqual([{ open: '13:00', close: '17:30' }])
    expect(r.weekly.sa).toEqual([{ open: '09:30', close: '16:00' }])
    expect(r.weekly.mo).toEqual([])
  })
  it('leest openingHours-tekst in OSM/schema-notatie', () => {
    const r = extractOpeningHours(ld({ '@type': 'LocalBusiness', openingHours: ['Mo-Fr 09:00-17:30', 'Sa 09:00-17:00'] }))!
    expect(r.weekly.fr).toEqual([{ open: '09:00', close: '17:30' }])
  })
  it('kiest bij meerdere vestigingen het blok met de juiste postcode, anders niets', () => {
    const html = ld({ '@graph': [
      { '@type': 'Store', address: { postalCode: '1111 AA' }, openingHoursSpecification: [{ dayOfWeek: ['Monday', 'Tuesday', 'Wednesday'], opens: '09:00', closes: '17:00' }] },
      { '@type': 'Store', address: { postalCode: '2222 BB' }, openingHoursSpecification: [{ dayOfWeek: ['Monday', 'Tuesday', 'Wednesday'], opens: '10:00', closes: '18:00' }] },
    ] })
    expect(extractOpeningHours(html, '2222BB')!.weekly.mo).toEqual([{ open: '10:00', close: '18:00' }])
    expect(extractOpeningHours(html)).toBeNull()
  })
  it('negeert een standaardwaarde van een thema (elke dag dezelfde tijden)', () => {
    expect(extractOpeningHours(ld({ openingHours: ['Mo,Tu,We,Th,Fr,Sa,Su 09:00-17:00'] }))).toBeNull()
  })
  it('wijst onzinnige tijden af', () => {
    expect(extractOpeningHours(ld({ openingHoursSpecification: [{ dayOfWeek: ['Monday', 'Tuesday', 'Friday'], opens: '02:00', closes: '03:00' }] }))).toBeNull()
  })
})

describe('Nederlandse tekst', () => {
  it('leest een gangbaar blok met t/m en "uur"', () => {
    const html = `<footer><h3>Openingstijden</h3><p>Maandag gesloten<br>Dinsdag t/m vrijdag 13.00 – 17.30 uur<br>Zaterdag 9.30 - 16.00 uur<br>Zondag gesloten</p><p>Bel 0570-561384</p></footer>`
    const r = extractOpeningHours(html)!
    expect(r.method).toBe('tekst')
    expect(r.weekly.mo).toEqual([])
    expect(r.weekly.we).toEqual([{ open: '13:00', close: '17:30' }])
    expect(r.weekly.sa).toEqual([{ open: '09:30', close: '16:00' }])
  })
  it('leest een tabel met afkortingen en een middagpauze', () => {
    const html = `<h2>Onze openingstijden</h2><table><tr><td>Ma:</td><td>gesloten</td></tr><tr><td>Di - Vr:</td><td>9:00-12:30 en 13:30-17:30</td></tr><tr><td>Za:</td><td>10:00-16:00</td></tr></table>`
    const r = extractOpeningHours(html)!
    expect(r.weekly.th).toEqual([{ open: '09:00', close: '12:30' }, { open: '13:30', close: '17:30' }])
    expect(r.weekly.su).toEqual([])
  })
  it('negeert dagen en tijden zonder kopje "openingstijden" (bijv. een workshopagenda)', () => {
    expect(extractOpeningHours('<p>Workshop haken: zaterdag 10:00-12:00, dinsdag 19:00-21:00, donderdag 19:00-21:00</p>')).toBeNull()
  })
  it('geeft niets bij tegenstrijdige roosters of zomer/wintertijden', () => {
    expect(extractOpeningHours('<p>Openingstijden: di t/m vr 10.00-17.00, za 10-16</p><p>Openingstijden: di t/m vr 9.00-18.00, za 10-16</p>')).toBeNull()
    expect(extractOpeningHours('<p>Openingstijden (zomertijden): di t/m za 10-17</p>')).toBeNull()
  })
  it('heeft minimaal drie dagen nodig', () => {
    expect(extractOpeningHours('<p>Openingstijden: zaterdag 10:00-16:00</p>')).toBeNull()
  })
  it('laat een dubbel getoond, identiek rooster wel toe', () => {
    const blk = '<p>Openingstijden<br>wo t/m vr 10:00-17:00<br>za 10:00-16:00</p>'
    expect(extractOpeningHours(blk + blk)!.weekly.we).toEqual([{ open: '10:00', close: '17:00' }])
  })
})

describe('candidateLinks', () => {
  it('vindt contact- en openingstijdenpagina’s op hetzelfde domein', () => {
    const html = '<a href="/contact">Contact</a><a href="https://facebook.com/x">FB</a><a href="/info/openingstijden">Tijden</a><a href="/shop">Shop</a>'
    expect(candidateLinks(html, 'https://www.winkel.nl/')).toEqual(['https://www.winkel.nl/info/openingstijden', 'https://www.winkel.nl/contact'])
  })
})
