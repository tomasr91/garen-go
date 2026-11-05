import { getCategory } from '../domain/categories.ts'
import { STATUS_LABEL, statusDetail, type OpeningStatus } from '../domain/openingHours.ts'

/** Kleine herbruikbare onderdelen voor winkelweergave (kaartjes, kaart-popup, detail). */

export function StatusBadge({ status, compact = false }: { status: OpeningStatus; compact?: boolean }) {
  const detail = statusDetail(status)
  return (
    <div className={`status status--${status.kind}`}>
      <span className="status__label">
        <span className="status__dot" aria-hidden />
        {STATUS_LABEL[status.kind]}
      </span>
      {!compact && detail && <span className="status__detail">{detail}</span>}
    </div>
  )
}

export function CategoryTags({ ids }: { ids: string[] }) {
  return (
    <ul className="tags" aria-label="Categorieën">
      {ids.map((id) => {
        const c = getCategory(id)
        if (!c) return null
        return (
          <li key={id} className="tag" style={{ ['--cat' as string]: c.color }}>
            {c.shortLabel}
          </li>
        )
      })}
    </ul>
  )
}
