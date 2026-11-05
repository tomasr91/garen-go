import { lazy, Suspense, useEffect, useRef } from 'react'
import { hrefFor, useRoute, type Tab } from './app/router.ts'
import { IconList, IconMap, IconYarn } from './components/Icons.tsx'
import { InstallButton } from './components/InstallApp.tsx'
import { AppStateProvider } from './state/AppState.tsx'
import { ShopStoreProvider, useShopStore } from './state/ShopStore.tsx'
import { MapTab } from './views/MapTab.tsx'
import { ShopDetail } from './views/ShopDetail.tsx'
import { ShopsTab } from './views/ShopsTab.tsx'

// Beheer is los van de publieke interface en wordt pas geladen als je het opent.
const AdminPage = lazy(() => import('./views/admin/AdminPage.tsx').then((m) => ({ default: m.AdminPage })))

export default function App() {
  return (
    <ShopStoreProvider>
      <AppStateProvider>
        <Shell />
      </AppStateProvider>
    </ShopStoreProvider>
  )
}

function Shell() {
  const route = useRoute()
  // Het laatst gekozen tabblad blijft actief onder de winkeldetails.
  const lastTab = useRef<Tab>('winkels')
  if (route.name === 'tab') lastTab.current = route.tab
  const tab = lastTab.current

  useEffect(() => {
    document.title = route.name === 'admin' ? 'Winkelbeheer · Garen & Go' : 'Garen & Go · Handwerkwinkels in Nederland'
  }, [route.name])

  if (route.name === 'admin') {
    return (
      <Suspense fallback={<p className="page-loading">Beheer laden…</p>}>
        <AdminPage />
      </Suspense>
    )
  }

  return (
    <div className={`app app--${tab}`}>
      <header className="topbar">
        <a href={hrefFor.tab('winkels')} className="brand" aria-label="Garen & Go, naar alle winkels">
          <IconYarn className="brand__icon" width={26} height={26} />
          <span className="brand__name">Garen <span className="brand__amp">&amp;</span> Go</span>
        </a>
        <InstallButton />
      </header>

      <main className="main">
        {/* Beide tabbladen blijven geladen zodat scrollpositie en kaartstand behouden blijven. */}
        <section className="tab-panel" hidden={tab !== 'winkels'} aria-label="Winkels">
          <ShopsTab />
          <Footer />
        </section>
        <section className="tab-panel tab-panel--map" hidden={tab !== 'kaart'} aria-label="Kaart">
          <MapTab active={tab === 'kaart'} />
        </section>
      </main>

      <nav className="tabbar" aria-label="Hoofdnavigatie">
        <a href={hrefFor.tab('winkels')} className="tabbar__item" aria-current={tab === 'winkels' ? 'page' : undefined}>
          <IconList width={24} height={24} />
          <span>Winkels</span>
        </a>
        <a href={hrefFor.tab('kaart')} className="tabbar__item" aria-current={tab === 'kaart' ? 'page' : undefined}>
          <IconMap width={24} height={24} />
          <span>Kaart</span>
        </a>
      </nav>

      {route.name === 'shop' && <ShopDetail id={route.id} />}
    </div>
  )
}

function Footer() {
  const { attribution } = useShopStore()
  return (
    <footer className="footer">
      <p>{attribution ?? 'Winkelgegevens © OpenStreetMap-bijdragers (ODbL).'}</p>
      <p>
        Klopt er iets niet of mist er een winkel? Gegevens kunnen onvolledig zijn. ·{' '}
        <a href={hrefFor.admin()}>Winkelbeheer</a>
      </p>
    </footer>
  )
}
