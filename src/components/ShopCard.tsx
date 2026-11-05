import { memo } from 'react'
import { hrefFor } from '../app/router.ts'
import { getCategory } from '../domain/categories.ts'
import { formatDistance, navigationUrl } from '../domain/geo.ts'
import { getOpeningStatus, STATUS_LABEL, statusDetail } from '../domain/openingHours.ts'
import type { Shop } from '../domain/types.ts'
import { IconGlobe, IconNavigate } from './Icons.tsx'

interface Props {
  shop: Shop
  distanceKm?: number
  /** Doorgegeven zodat kaartjes elke minuut opnieuw hun status berekenen. */
  now: Date
}

/** Compact, rustig kaartje: naam en afstand, één statusregel, categorieën als tekst en kleine icoonknoppen. */
function ShopCardImpl({ shop, distanceKm, now }: Props) {
  const status = getOpeningStatus(shop.openingHours, now)
  const detail = statusDetail(status)
  const categories = shop.categories.map((id) => getCategory(id)).filter((c) => !!c)
  return (
    <article className="card">
      <a className="card__main" href={hrefFor.shop(shop.id)}>
        <div className="card__head">
          <h3 className="card__title">{shop.name}</h3>
          {distanceKm !== undefined && (
            <span className="card__distance" title="Hemelsbrede afstand">
              {formatDistance(distanceKm)}
            </span>
          )}
        </div>
        <p className="card__meta">
          <span>{shop.city || 'Plaats onbekend'}</span>
          <span className={`card__status card__status--${status.kind}`}>
            <span className="card__dot" aria-hidden />
            {STATUS_LABEL[status.kind]}
            {detail && <span className="card__status-detail"> · {detail.charAt(0).toLowerCase() + detail.slice(1)}</span>}
          </span>
        </p>
        <p className="card__cats">
          {categories.map((c) => (
            <span key={c.id} className="card__cat" style={{ ['--cat' as string]: c.color }}>
              {c.shortLabel}
            </span>
          ))}
        </p>
      </a>
      <div className="card__icons">
        <a className="icon-link" href={navigationUrl(shop)} target="_blank" rel="noopener noreferrer" aria-label={`Route naar ${shop.name}`} title="Route">
          <IconNavigate width={18} height={18} />
        </a>
        {shop.website && (
          <a className="icon-link" href={shop.website} target="_blank" rel="noopener noreferrer" aria-label={`Website van ${shop.name}`} title="Website">
            <IconGlobe width={18} height={18} />
          </a>
        )}
      </div>
    </article>
  )
}

export const ShopCard = memo(ShopCardImpl)
