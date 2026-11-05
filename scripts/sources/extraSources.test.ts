import { describe, expect, it } from 'vitest'
import type { Shop } from '../../src/domain/types.ts'
import { entryToShop, isSameBusiness, isSameShop, mergeExtra, streetMatches } from './extraSources.ts'

const now = '2026-11-05T00:00:00.000Z'
const osm: Shop = {
  id: 'osm-node-1', name: 'Wolwinkel De Bol', address: 'Straat 1', postcode: '1234 AB', city: 'X', lat: 52, lon: 5,
  categories: ['wol'], openingHours: null, assortment: ['Wol en garen'], active: true,
  source: { type: 'osm', ref: 'node/1' }, verification: 'unverified', updatedAt: now,
}

describe('entryToShop', () => {
  it('zet een handmatige regel om, met stabiel ID en toelichting', () => {
    const s = entryToShop({ name: "Mikilon's Workshops", address: 'H. Droststraat 48a', postcode: '8121 BJ', city: 'Olst', lat: 52.33, lon: 6.11,
      categories: ['wol'], opening_hours: 'Tu-Fr 13:00-17:30; Sa 09:30-16:00', hours_note: 'Zomer: bellen', verification: 'verified' }, 'manual', 'src', now)!
    expect(s.id).toBe('src-mikilon-s-workshops-8121bj')
    expect(s.openingHours?.weekly.sa).toEqual([{ open: '09:30', close: '16:00' }])
    expect(s.openingHours?.note).toBe('Zomer: bellen')
    expect(s.verification).toBe('verified')
  })
})

describe('isSameShop', () => {
  it('herkent dezelfde winkel op postcode en naam', () => {
    expect(isSameShop(osm, { name: 'De Bol', postcode: '1234AB', lat: 52.01, lon: 5 })).toBe(true)
  })
  it('ziet verschillende winkels in dezelfde straat als verschillend', () => {
    expect(isSameShop(osm, { name: 'Stoffenhuis Jansen', postcode: '1234 AB', lat: 52.0005, lon: 5 })).toBe(false)
  })
})

describe('mergeExtra', () => {
  const dealer = entryToShop({ name: 'De Bol', address: 'Straat 1', postcode: '1234 AB', city: 'X', lat: 52, lon: 5, categories: ['wol'], brand: 'Scheepjes' }, 'import', 'dlr', now)!
  it('een verkooppunt verrijkt een bestaande winkel in plaats van een dubbele toe te voegen', () => {
    const { shops, report } = mergeExtra([osm], [dealer], 'enrich-or-add')
    expect(shops).toHaveLength(1)
    expect(shops[0].assortment).toContain('Verkooppunt Scheepjes')
    expect(report.enrichedExisting).toBe(1)
  })
  it('een handmatige winkel vervangt de OSM-versie', () => {
    const manual = { ...dealer, id: 'src-de-bol', verification: 'verified' as const }
    const { shops } = mergeExtra([osm], [manual], 'replace')
    expect(shops).toHaveLength(1)
    expect(shops[0].id).toBe('src-de-bol')
  })
  it('voegt een onbekende winkel toe', () => {
    const other = { ...dealer, id: 'dlr-x', name: 'Garenhuis', postcode: '9999 ZZ', lat: 53, lon: 6 }
    expect(mergeExtra([osm], [other], 'enrich-or-add').shops).toHaveLength(2)
    expect(mergeExtra([osm], [other], 'enrich-only').shops).toHaveLength(1)
  })
})

describe('dubbele winkels met afwijkend adres in de bron', () => {
  const base = { categories: ['wol'], openingHours: null, assortment: [], active: true, verification: 'unverified' as const, updatedAt: now }
  const osmDol: Shop = { ...base, id: 'osm-node-2678765967', name: 'Dol-op-Wol', address: 'Kleine Overstraat 6', postcode: '7411 JL', city: 'Deventer',
    lat: 52.252609, lon: 6.157006, phone: '+31 570 769 084', website: 'https://dolopwol.com/', source: { type: 'osm' } }
  const scheepjesDol: Shop = { ...base, id: 'dlr-dol-op-wol-7411rj', name: 'Dol-op-Wol', address: 'Kleine Overstraat 6', postcode: '7411 RJ', city: 'Deventer',
    lat: 52.2558938, lon: 6.15627387, phone: '0570 - 76 90 84', website: 'https://dolopwol.com/291-scheepjes', assortment: ['Verkooppunt Scheepjes'],
    source: { type: 'import', ref: 'verkooppunt:Scheepjes' } }

  it('herkent Dol-op-Wol als dezelfde winkel ondanks andere postcode en 370 m afstand', () => {
    expect(isSameBusiness(osmDol, scheepjesDol)).toBe(true)
    const { shops } = mergeExtra([osmDol], [scheepjesDol], 'enrich-or-add')
    expect(shops).toHaveLength(1)
    expect(shops[0].assortment).toContain('Verkooppunt Scheepjes')
    expect(shops[0].notes ?? '').not.toContain('controleer welk adres')
  })
  it('zet een controlepunt bij een verhuisde winkel (zelfde naam en website, ander adres)', () => {
    const moved = { ...scheepjesDol, address: 'Andere Straat 1', postcode: '7411 AA', phone: undefined, lat: 52.26, lon: 6.16 }
    const { shops } = mergeExtra([osmDol], [moved], 'enrich-or-add')
    expect(shops).toHaveLength(1)
    expect(shops[0].notes).toContain('Scheepjes noemt adres Andere Straat 1')
  })
  it('voegt zaken met dezelfde naam maar zonder ander gemeenschappelijk kenmerk niet samen', () => {
    const other = { ...scheepjesDol, address: 'Markt 1', phone: '0101234567', website: 'https://anders.nl', lat: 52.27, lon: 6.17 }
    expect(isSameBusiness(osmDol, other)).toBe(false)
  })
})

describe('streetMatches', () => {
  it('accepteert afkortingen, maar geen andere straat', () => {
    expect(streetMatches('H. Droststraat 48a', 'Hendrik Droststraat')).toBe(true)
    expect(streetMatches('Kleine Overstraat 6', 'Kleine Overstraat')).toBe(true)
    expect(streetMatches('Kleine Overstraat 6', 'Brink')).toBe(false)
  })
})
