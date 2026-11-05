import { describe, expect, it } from 'vitest'
import { dedupeEntries, parseRico, parseScheepjes, splitDutchAddress } from './dealerParsers.ts'

const scheepjesHtml = `<table id="storeLocatorOverview">
<tr class="superstores"><td class="name">Voorbeeld Wol &amp; Zo</td><td class="type"><a href="https://x.nl/">Webshop</a><span> &amp; </span><span>winkel</span></td><td class="country">Nederland</td><td class="address">Dorpsstraat 1a, 1234 AB Ergens</td><td class="distance"></td><td class="telephoneNumber"><a href="tel:0123-456789">0123-456789</a></td><td class="website"><a href="https://x.nl/" target="_blank">Bezoek website</a></td></tr>
<tr><td class="name">Alleen Online</td><td class="type">Webshop</td><td class="country">Nederland</td><td class="address">Weg 2, 1234 AB Ergens</td><td class="distance"></td><td class="telephoneNumber"></td><td class="website"></td></tr>
<tr><td class="name">Buitenland</td><td class="type">Winkel</td><td class="country">Duitsland</td><td class="address">Strasse 1, 12345 Berlin</td><td class="distance"></td><td class="telephoneNumber"></td><td class="website"></td></tr>
</table>`

describe('parseScheepjes', () => {
  it('neemt alleen fysieke winkels in Nederland, met adres, telefoon en website', () => {
    const r = parseScheepjes(scheepjesHtml, 'https://www.scheepjes.com/nl/winkels/')
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ name: 'Voorbeeld Wol & Zo', address: 'Dorpsstraat 1a', postcode: '1234 AB', city: 'Ergens',
      phone: '0123-456789', website: 'https://x.nl/', brand: 'Scheepjes', verification: 'unverified' })
    expect(r[0].categories).toContain('wol')
  })
})

describe('parseRico', () => {
  it('leest de ingesloten JSON en markeert als alleen-aanvullen', () => {
    const html = `<script>var stores = [{"position":{"lat":52.1,"lng":5.1},"post":{"post_title":"WOLWINKEL TEST"},"fields":{"address":"MARKT 1","zipcode":"1234 ab","city":"ERGENS","country":"Netherlands"}},{"position":{"lat":48,"lng":11},"post":{"post_title":"X"},"fields":{"country":"Germany","zipcode":"1"}}];
</script>`
    const r = parseRico(html, 'u')
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ name: 'Wolwinkel Test', address: 'Markt 1', postcode: '1234 AB', city: 'Ergens', enrichOnly: true, lat: 52.1, lon: 5.1 })
  })
})

describe('hulpfuncties', () => {
  it('splitst een Nederlands adres', () => {
    expect(splitDutchAddress('Hendrik Droststraat 48, 8121 BJ Olst')).toEqual({ address: 'Hendrik Droststraat 48', postcode: '8121 BJ', city: 'Olst' })
    expect(splitDutchAddress('Bloemgracht 117H, 1016KJ Amsterdam')).toEqual({ address: 'Bloemgracht 117H', postcode: '1016 KJ', city: 'Amsterdam' })
    expect(splitDutchAddress('320 Main Street, CO 81212 Cañon City')).toBeNull()
  })
  it('ontdubbelt op merk, postcode en huisnummer', () => {
    const e = { name: 'A', address: 'Weg 1', postcode: '1234 AB', city: 'X', categories: [], brand: 'Scheepjes' }
    expect(dedupeEntries([e, { ...e, name: 'A (2)' }, { ...e, address: 'Weg 3' }])).toHaveLength(2)
  })
})
