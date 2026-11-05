import { describe, expect, it } from 'vitest'
import { dedupeShops, fillMissingCity, mapOsmElement } from './mapping.ts'

const now = '2026-11-05T00:00:00.000Z'

describe('mapOsmElement', () => {
  it('zet een wolwinkel om met stabiel ID en adres', () => {
    const r = mapOsmElement({ type: 'node', id: 42, lat: 52.1, lon: 5.1, tags: {
      shop: 'wool', name: 'Breiwinkel X', 'addr:street': 'Hoofdstraat', 'addr:housenumber': '1',
      'addr:postcode': '1234ab', 'addr:city': 'Ergens', opening_hours: 'Mo-Fr 09:00-17:00', website: 'example.nl',
    } }, now)
    if (!('shop' in r)) throw new Error('verwacht een winkel')
    expect(r.shop).toMatchObject({ id: 'osm-node-42', address: 'Hoofdstraat 1', postcode: '1234 AB', city: 'Ergens',
      categories: ['wol'], website: 'https://example.nl', verification: 'unverified' })
    expect(r.shop.openingHours?.weekly.mo).toEqual([{ open: '09:00', close: '17:00' }])
  })
  it('voegt categorieën toe op basis van de naam', () => {
    const r = mapOsmElement({ type: 'way', id: 1, center: { lat: 52, lon: 5 }, tags: { shop: 'fabric', name: 'Quilt & Stof' } }, now)
    expect('shop' in r && r.shop.categories.sort()).toEqual(['borduur-quilt', 'handwerk'])
  })
  it('laat hobbywinkels zonder handwerkaanwijzing weg', () => {
    expect(mapOsmElement({ type: 'node', id: 2, lat: 52, lon: 5, tags: { shop: 'craft', name: 'Schildersbenodigdheden Jan' } }, now)).toHaveProperty('skipped')
    expect(mapOsmElement({ type: 'node', id: 3, lat: 52, lon: 5, tags: { shop: 'craft', name: 'Hobby & Garen' } }, now)).toHaveProperty('shop')
  })
  it('laat gordijnwinkels en naamloze winkels weg', () => {
    expect(mapOsmElement({ type: 'node', id: 4, lat: 52, lon: 5, tags: { shop: 'fabric', name: 'Gordijnenhuis' } }, now)).toHaveProperty('skipped')
    expect(mapOsmElement({ type: 'node', id: 5, lat: 52, lon: 5, tags: { shop: 'wool' } }, now)).toHaveProperty('skipped')
  })
  it('markeert onleesbare openingstijden als te controleren', () => {
    const r = mapOsmElement({ type: 'node', id: 6, lat: 52, lon: 5, tags: { shop: 'wool', name: 'W', opening_hours: 'op afspraak' } }, now)
    expect('shop' in r && r.shop.openingHours).toBeNull()
    expect('shop' in r && r.shop.notes).toContain('niet automatisch te lezen')
  })
})

describe('dedupeShops', () => {
  it('voegt dezelfde winkel op (bijna) dezelfde plek samen', () => {
    const base = mapOsmElement({ type: 'node', id: 7, lat: 52, lon: 5, tags: { shop: 'wool', name: 'De Bol' } }, now)
    const dup = mapOsmElement({ type: 'way', id: 8, center: { lat: 52.0001, lon: 5.0001 }, tags: { shop: 'haberdashery', name: 'De Bol', opening_hours: 'Mo 09:00-12:00' } }, now)
    if (!('shop' in base) || !('shop' in dup)) throw new Error()
    const out = dedupeShops([base.shop, dup.shop])
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('osm-way-8')
    expect(out[0].categories.sort()).toEqual(['fournituren', 'wol'])
  })
})

describe('fillMissingCity', () => {
  it('neemt de dichtstbijzijnde woonplaats binnen 5 km', () => {
    const r = mapOsmElement({ type: 'node', id: 9, lat: 52.0, lon: 5.0, tags: { shop: 'wool', name: 'W' } }, now)
    if (!('shop' in r)) throw new Error()
    expect(fillMissingCity(r.shop, [{ name: 'Dichtbij', lat: 52.01, lon: 5.0 }, { name: 'Ver', lat: 52.3, lon: 5 }]).city).toBe('Dichtbij')
    expect(fillMissingCity(r.shop, [{ name: 'Ver', lat: 52.3, lon: 5 }]).city).toBe('')
  })
})
