import { useEffect, useRef } from 'react'
import { goBack, hrefFor } from '../app/router.ts'
import { IconBack, IconGlobe, IconNavigate, IconPhone } from '../components/Icons.tsx'
import { CategoryTags, StatusBadge } from '../components/ShopBits.tsx'
import { distanceKm, formatDistance, navigationUrl } from '../domain/geo.ts'
import { DAY_LABELS, formatRanges, getOpeningStatus, toAmsterdam } from '../domain/openingHours.ts'
import { DAY_KEYS, type Shop } from '../domain/types.ts'
import { addBaseLayer, L, shopIcon } from '../map/leaflet.ts'
import { useAppState } from '../state/AppState.tsx'
import { useShopStore } from '../state/ShopStore.tsx'

export function ShopDetail({ id }: { id: string }) {
  const { shops, status } = useShopStore()
  const { now, location } = useAppState()
  const shop = shops.find((s) => s.id === id)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && goBack(hrefFor.tab('winkels'))
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="detail" role="dialog" aria-modal="true" aria-labelledby="detail-title">
      <header className="detail__bar">
        <button ref={closeRef} type="button" className="icon-btn" onClick={() => goBack(hrefFor.tab('winkels'))} aria-label="Terug">
          <IconBack />
        </button>
        <span className="detail__bar-title">Winkel</span>
      </header>
      {status === 'loading' && <p className="detail__body">Laden…</p>}
      {status !== 'loading' && (!shop || !shop.active) && (
        <div className="detail__body empty">
          <h2 id="detail-title">Winkel niet gevonden</h2>
          <p>Deze winkel bestaat niet (meer) of is tijdelijk uitgeschakeld.</p>
          <a className="btn btn--primary" href={hrefFor.tab('winkels')}>
            Naar alle winkels
          </a>
        </div>
      )}
      {shop && shop.active && <DetailContent shop={shop} now={now} distance={location ? distanceKm(location, shop) : undefined} />}
    </div>
  )
}

function DetailContent({ shop, now, distance }: { shop: Shop; now: Date; distance?: number }) {
  const status = getOpeningStatus(shop.openingHours, now)
  const today = DAY_KEYS[toAmsterdam(now).dayIndex]
  const cityLine = [shop.postcode, shop.city].filter(Boolean).join(' ')

  return (
    <div className="detail__body">
      <h1 id="detail-title" className="detail__title">{shop.name}</h1>
      <p className="card__city">
        {shop.city || 'Plaats onbekend'}
        {distance !== undefined && <> · <span title="Hemelsbrede afstand">{formatDistance(distance)} hemelsbreed</span></>}
      </p>
      <StatusBadge status={status} />
      <CategoryTags ids={shop.categories} />

      <div className="detail__actions">
        <a className="btn btn--primary btn--lg" href={navigationUrl(shop)} target="_blank" rel="noopener noreferrer">
          <IconNavigate /> Navigeer
        </a>
        {shop.website && (
          <a className="btn btn--ghost btn--lg" href={shop.website} target="_blank" rel="noopener noreferrer">
            <IconGlobe /> Website
          </a>
        )}
        {shop.phone && (
          <a className="btn btn--ghost btn--lg" href={`tel:${shop.phone.replace(/[^\d+]/g, '')}`}>
            <IconPhone /> Bellen
          </a>
        )}
      </div>

      <section className="detail__section">
        <h2>Adres</h2>
        {shop.address || cityLine ? (
          <address>
            {shop.address || <span className="muted">Straat onbekend</span>}
            <br />
            {cityLine || <span className="muted">Postcode en plaats onbekend</span>}
          </address>
        ) : (
          <p className="muted">Adres onbekend. De locatie op de kaart is wel bekend.</p>
        )}
        <MiniMap shop={shop} />
      </section>

      <section className="detail__section">
        <h2>Openingstijden</h2>
        {shop.openingHours ? (
          <table className="hours">
            <tbody>
              {DAY_KEYS.map((d) => (
                <tr key={d} className={d === today ? 'hours--today' : undefined}>
                  <th scope="row">{DAY_LABELS[d]}</th>
                  <td>{formatRanges(shop.openingHours!.weekly[d])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">
            Openingstijden onbekend. Kijk op de website of bel de winkel voordat je gaat.
          </p>
        )}
        {shop.openingHours && (
          <p className="hint">Feestdagen en vakanties kunnen afwijken. Controleer bij twijfel de website van de winkel.</p>
        )}
      </section>

      <section className="detail__section">
        <h2>Contact</h2>
        <dl className="facts">
          <dt>Website</dt>
          <dd>
            {shop.website ? (
              <a href={shop.website} target="_blank" rel="noopener noreferrer">
                {shop.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
              </a>
            ) : (
              <span className="muted">Niet bekend</span>
            )}
          </dd>
          <dt>Telefoon</dt>
          <dd>{shop.phone ? <a href={`tel:${shop.phone.replace(/[^\d+]/g, '')}`}>{shop.phone}</a> : <span className="muted">Niet bekend</span>}</dd>
        </dl>
      </section>

      <section className="detail__section">
        <h2>Assortiment</h2>
        {shop.assortment.length ? (
          <ul className="assortment">
            {shop.assortment.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        ) : (
          <p className="muted">Nog geen informatie over het assortiment.</p>
        )}
      </section>

      <p className="source">
        {shop.verification === 'verified' ? 'Gegevens gecontroleerd. ' : 'Gegevens nog niet handmatig gecontroleerd. '}
        {shop.source.type === 'osm' && (
          <>
            Bron:{' '}
            <a href={shop.source.url} target="_blank" rel="noopener noreferrer">
              OpenStreetMap
            </a>
            {shop.source.checkedAt && ` (gecontroleerd op ${shop.source.checkedAt})`}.
          </>
        )}
      </p>
    </div>
  )
}

function MiniMap({ shop }: { shop: Shop }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current) return
    const map = L.map(ref.current, { zoomControl: false, attributionControl: true, dragging: !L.Browser.mobile, scrollWheelZoom: false })
      .setView([shop.lat, shop.lon], 16)
    addBaseLayer(map)
    L.marker([shop.lat, shop.lon], { icon: shopIcon(shop, true), keyboard: false }).addTo(map)
    return () => {
      map.remove()
    }
  }, [shop])
  return <div ref={ref} className="minimap" aria-label={`Locatie van ${shop.name} op de kaart`} role="img" />
}
