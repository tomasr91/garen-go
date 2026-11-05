/* Garen & Go service worker
 * - App-bestanden (HTML, JS, CSS, iconen): uit de cache, op de achtergrond bijgewerkt.
 * - Winkeldata (data/shops.json): eerst netwerk, bij geen verbinding de laatst bekende versie.
 * - Kaarttegels en externe verzoeken: niet gecachet (gebruiksvoorwaarden OSM-tegelserver).
 */
const VERSION = 'v1'
const APP_CACHE = `garen-go-app-${VERSION}`
const DATA_CACHE = `garen-go-data-${VERSION}`
const PRECACHE = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './favicon.svg']

/** Haalt index.html op en cachet ook de daarin genoemde JS/CSS, plus de winkeldata. */
async function precache() {
  const app = await caches.open(APP_CACHE)
  await app.addAll(PRECACHE)
  const html = await (await fetch('./index.html', { cache: 'no-cache' })).text()
  const assets = [...html.matchAll(/(?:src|href)="(\.\/assets\/[^"]+)"/g)].map((m) => m[1])
  await app.addAll(assets)
  const data = await caches.open(DATA_CACHE)
  await data.add('./data/shops.json').catch(() => {})
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => ![APP_CACHE, DATA_CACHE].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // Winkeldata: netwerk eerst.
  if (url.pathname.endsWith('/data/shops.json')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) caches.open(DATA_CACHE).then((c) => c.put(req, res.clone()))
          return res
        })
        .catch(() => caches.match(req, { ignoreVary: true, ignoreSearch: true }).then((r) => r || Response.error())),
    )
    return
  }

  // Navigatie: netwerk eerst (nieuwe versies direct zichtbaar), offline de gecachte pagina.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          caches.open(APP_CACHE).then((c) => c.put('./index.html', res.clone()))
          return res
        })
        .catch(() => caches.match('./index.html', { ignoreVary: true })),
    )
    return
  }

  // Overige app-bestanden: cache, op de achtergrond verversen.
  event.respondWith(
    caches.match(req, { ignoreVary: true }).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res.ok) caches.open(APP_CACHE).then((c) => c.put(req, res.clone()))
          return res
        })
        .catch(() => cached)
      return cached || network
    }),
  )
})
