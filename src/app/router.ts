import { useEffect, useState } from 'react'

/**
 * Minimale hash-router. Hash-URL's werken op GitHub Pages zonder serverconfiguratie.
 *   #/winkels        tabblad Winkels (standaard)
 *   #/kaart          tabblad Kaart
 *   #/winkel/<id>    winkeldetails (als laag boven het actieve tabblad)
 *   #/beheer         winkelbeheer (los van de publieke interface)
 */
export type Tab = 'winkels' | 'kaart'
export type Route =
  | { name: 'tab'; tab: Tab }
  | { name: 'shop'; id: string }
  | { name: 'admin' }

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#\/?/, '')
  const [first, ...rest] = path.split('/')
  if (first === 'kaart') return { name: 'tab', tab: 'kaart' }
  if (first === 'winkel' && rest.length) return { name: 'shop', id: decodeURIComponent(rest.join('/')) }
  if (first === 'beheer') return { name: 'admin' }
  return { name: 'tab', tab: 'winkels' }
}

export const hrefFor = {
  tab: (tab: Tab) => `#/${tab}`,
  shop: (id: string) => `#/winkel/${encodeURIComponent(id)}`,
  admin: () => '#/beheer',
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash))
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

let internalNavigations = 0
if (typeof window !== 'undefined') window.addEventListener('hashchange', () => internalNavigations++)

/** Terug naar de vorige pagina binnen de app; bij een direct geopende link naar `fallback`. */
export function goBack(fallback: string) {
  if (internalNavigations > 0) window.history.back()
  else window.location.hash = fallback
}
