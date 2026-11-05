import { describe, expect, it } from 'vitest'
import { defaultEnabledCategoryIds } from './categories.ts'
import { filterShops, matchesQuery, sortShops, withDistance } from './shopQuery.ts'
import type { Shop } from './types.ts'

function shop(id: string, over: Partial<Shop>): Shop {
  return {
    id, name: id, address: '', postcode: '', city: '', lat: 52, lon: 5, categories: ['wol'],
    openingHours: null, assortment: [], active: true, source: { type: 'manual' }, verification: 'verified',
    updatedAt: '2026-01-01', ...over,
  }
}
const a = shop('a', { name: 'De Bol', city: 'Utrecht', postcode: '3511 AB', lat: 52.09, lon: 5.12 })
const b = shop('b', { name: 'Knoop & Co', city: 'Amsterdam', postcode: '1012 JS', lat: 52.37, lon: 4.89, categories: ['fournituren'] })
const c = shop('c', { name: 'Quilthoek', city: 'Groningen', lat: 53.22, lon: 6.57, categories: ['borduur-quilt', 'fournituren'] })
const d = shop('d', { name: 'Gesloten zaak', city: 'Delft', active: false })
const all = [a, b, c, d]

describe('filters', () => {
  it('fournituren staat standaard uit', () => {
    const ids = filterShops(all, { categories: new Set(defaultEnabledCategoryIds()), query: '' }).map((s) => s.id)
    expect(ids).toEqual(['a', 'c'])
  })
  it('fournituren aanzetten voegt die winkels toe', () => {
    const ids = filterShops(all, { categories: new Set([...defaultEnabledCategoryIds(), 'fournituren']), query: '' }).map((s) => s.id)
    expect(ids).toEqual(['a', 'b', 'c'])
  })
  it('uitgeschakelde winkels worden nooit getoond', () => {
    expect(filterShops(all, { categories: new Set(['wol']), query: 'Delft' })).toEqual([])
  })
})

describe('zoeken', () => {
  it('op naam, plaats en postcode', () => {
    expect(matchesQuery(a, 'bol')).toBe(true)
    expect(matchesQuery(a, 'utrecht')).toBe(true)
    expect(matchesQuery(a, '3511ab')).toBe(true)
    expect(matchesQuery(a, '3511 AB')).toBe(true)
    expect(matchesQuery(a, '3511')).toBe(true)
    expect(matchesQuery(a, 'amsterdam')).toBe(false)
  })
  it('negeert accenten en hoofdletters', () => {
    expect(matchesQuery(shop('x', { name: 'Café Crochet' }), 'cafe')).toBe(true)
  })
})

describe('sorteren', () => {
  it('op afstand vanaf de gebruiker', () => {
    const fromAmsterdam = sortShops(withDistance([a, b, c], { lat: 52.37, lon: 4.9 }), 'distance').map((x) => x.shop.id)
    expect(fromAmsterdam).toEqual(['b', 'a', 'c'])
  })
  it('valt zonder locatie terug op plaatsnaam', () => {
    expect(sortShops(withDistance([a, b, c], null), 'distance').map((x) => x.shop.city)).toEqual(['Amsterdam', 'Groningen', 'Utrecht'])
  })
})
