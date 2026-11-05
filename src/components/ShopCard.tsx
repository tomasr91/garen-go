import { memo } from 'react'
import { hrefFor } from '../app/router.ts'
import { formatDistance, navigationUrl } from '../domain/geo.ts'
import { getOpeningStatus } from '../domain/openingHours.ts'
import type { Shop } from '../domain/types.ts'
import { IconGlobe, IconNavigate } from './Icons.tsx'
import { CategoryTags, StatusBadge } from './ShopBits.tsx'

interface Props {
  shop: Shop
  distanceKm?: number
  /** Doorgegeven zodat kaartjes elke minuut opnieuw hun status berekenen. */
  now: Date
}

function ShopCardImpl({ shop, distanceKm, now }: Props) {
  const status = getOpeningStatus(shop.openingHours, now)
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
        <p className="card__city">{shop.city || 'Plaats onbekend'}</p>
        <StatusBadge status={status} />
        <CategoryTags ids={shop.categories} />
      </a>
      <div className="card__actions">
        <a className="btn btn--ghost" href={navigationUrl(shop)} target="_blank" rel="noopener noreferrer">
          <IconNavigate width={18} height={18} /> Route
        </a>
        {shop.website && (
          <a className="btn btn--ghost" href={shop.website} target="_blank" rel="noopener noreferrer">
            <IconGlobe width={18} height={18} /> Website
          </a>
        )}
      </div>
    </article>
  )
}

export const ShopCard = memo(ShopCardImpl)
