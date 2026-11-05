import { describe, expect, it } from 'vitest'
import { distanceKm, formatDistance } from './geo.ts'

describe('distanceKm', () => {
  it('berekent Utrecht–Amsterdam (Dom → Dam) ≈ 35 km', () => {
    const d = distanceKm({ lat: 52.0907, lon: 5.1214 }, { lat: 52.3731, lon: 4.8926 })
    expect(d).toBeGreaterThan(34)
    expect(d).toBeLessThan(36)
  })
  it('is 0 voor hetzelfde punt', () => {
    expect(distanceKm({ lat: 52, lon: 5 }, { lat: 52, lon: 5 })).toBe(0)
  })
})

describe('formatDistance', () => {
  it('formatteert in het Nederlands', () => {
    expect(formatDistance(0.35)).toBe('350 m')
    expect(formatDistance(2.44)).toBe('2,4 km')
    expect(formatDistance(38.2)).toBe('38 km')
  })
})
