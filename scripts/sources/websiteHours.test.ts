import { describe, expect, it } from 'vitest'
import { robotsRuleMatches, siteDomain } from './websiteHours.ts'

describe('robotsRuleMatches', () => {
  it('blokkeert niet de hele site door een wildcardregel', () => {
    expect(robotsRuleMatches('/*?sort=', '/')).toBe(false)
    expect(robotsRuleMatches('/*?sort=', '/collections?sort=asc')).toBe(true)
    expect(robotsRuleMatches('/wp-admin/', '/')).toBe(false)
    expect(robotsRuleMatches('/', '/contact')).toBe(true)
    expect(robotsRuleMatches('/*.pdf$', '/a.pdf')).toBe(true)
    expect(robotsRuleMatches('/*.pdf$', '/a.pdf?x')).toBe(false)
  })
})

describe('siteDomain', () => {
  it('slaat sociale media over', () => {
    expect(siteDomain('https://www.facebook.com/winkel')).toBeNull()
    expect(siteDomain('https://www.mikilon.nl/c-1/')).toBe('mikilon.nl')
  })
})
