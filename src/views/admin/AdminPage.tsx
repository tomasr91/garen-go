import { useMemo, useRef, useState } from 'react'
import { hrefFor } from '../../app/router.ts'
import { IconBack, IconPlus } from '../../components/Icons.tsx'
import { CATEGORIES, getCategory } from '../../domain/categories.ts'
import { matchesQuery } from '../../domain/shopQuery.ts'
import type { Shop } from '../../domain/types.ts'
import { downloadFile, shopsFromCsv, shopsFromJson, shopsToCsv } from '../../data/importExport.ts'
import { newShopId, toDataset } from '../../data/shopRepository.ts'
import { validateShop } from '../../data/validation.ts'
import { useShopStore } from '../../state/ShopStore.tsx'
import { ShopForm } from './ShopForm.tsx'

type ListFilter = 'all' | 'inactive' | 'unverified' | 'no-hours' | 'changed'

function blankShop(): Shop {
  return {
    id: newShopId(),
    name: '',
    address: '',
    postcode: '',
    city: '',
    lat: NaN,
    lon: NaN,
    categories: CATEGORIES.filter((c) => c.defaultEnabled).slice(0, 1).map((c) => c.id),
    openingHours: null,
    assortment: [],
    active: true,
    source: { type: 'manual' },
    verification: 'verified',
    updatedAt: new Date().toISOString(),
  }
}

const STORAGE_ERROR = 'Opslaan in deze browser is mislukt (opslag vol of geblokkeerd). Exporteer je wijzigingen om ze niet kwijt te raken.'

export function AdminPage() {
  const store = useShopStore()
  const [editing, setEditing] = useState<{ shop: Shop; isNew: boolean } | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ListFilter>('all')
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [limit, setLimit] = useState(50)
  const fileInput = useRef<HTMLInputElement>(null)

  const list = useMemo(() => {
    return store.shops
      .filter((s) => matchesQuery(s, query))
      .filter((s) => {
        switch (filter) {
          case 'inactive': return !s.active
          case 'unverified': return s.verification !== 'verified'
          case 'no-hours': return !s.openingHours
          case 'changed': return store.isLocallyChanged(s.id)
          default: return true
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'nl'))
  }, [store, query, filter])

  const tryStore = (fn: () => void, ok: string): boolean => {
    try {
      fn()
      setMessage({ kind: 'ok', text: ok })
      return true
    } catch {
      setMessage({ kind: 'error', text: STORAGE_ERROR })
      return false
    }
  }

  const exportJson = () => {
    downloadFile('shops.json', JSON.stringify(toDataset(store.shops, store.attribution), null, 1) + '\n', 'application/json')
  }

  const onImport = async (file: File) => {
    const text = await file.text()
    const result = file.name.toLowerCase().endsWith('.csv') ? shopsFromCsv(text) : shopsFromJson(text)
    const accepted: Shop[] = []
    const problems = [...result.errors]
    for (const shop of result.shops) {
      const v = validateShop(shop, [...store.shops, ...accepted])
      if (v.errors.length) problems.push(`${shop.name || shop.id}: ${v.errors.join(' ')}`)
      else accepted.push(shop)
    }
    if (accepted.length) tryStore(() => store.saveShops(accepted), '')
    setMessage({
      kind: problems.length ? 'error' : 'ok',
      text: `${accepted.length} winkel(s) geïmporteerd.${problems.length ? ` ${problems.length} probleem/problemen: ${problems.slice(0, 5).join(' · ')}${problems.length > 5 ? ' …' : ''}` : ''}`,
    })
  }

  if (editing) {
    return (
      <div className="admin">
        <ShopForm
          initial={editing.shop}
          isNew={editing.isNew}
          allShops={store.shops}
          onCancel={() => setEditing(null)}
          onSave={(shop) => {
            try {
              store.saveShop(shop)
            } catch {
              return STORAGE_ERROR
            }
            setMessage({ kind: 'ok', text: `“${shop.name}” is opgeslagen.` })
            setEditing(null)
            return null
          }}
        />
      </div>
    )
  }

  return (
    <div className="admin">
      <header className="admin__head">
        <a className="icon-btn" href={hrefFor.tab('winkels')} aria-label="Terug naar de app">
          <IconBack />
        </a>
        <h1>Winkelbeheer</h1>
        <button type="button" className="btn btn--primary" onClick={() => setEditing({ shop: blankShop(), isNew: true })}>
          <IconPlus width={18} height={18} /> Nieuwe winkel
        </button>
      </header>

      <section className="admin__panel">
        <p>
          <strong>{store.shops.length}</strong> winkels in totaal ·{' '}
          <strong>{store.shops.filter((s) => s.verification === 'verified').length}</strong> gecontroleerd ·{' '}
          <strong>{store.shops.filter((s) => !s.active).length}</strong> uitgeschakeld
        </p>
        <p className="hint">
          Wijzigingen worden bewaard in deze browser{store.localChangeCount > 0 && <> (<strong>{store.localChangeCount}</strong> lokale wijziging(en))</>}.
          Om ze voor iedereen te publiceren: exporteer <code>shops.json</code> en vervang daarmee <code>public/data/shops.json</code> in de repository.
        </p>
        <div className="admin__tools">
          <button type="button" className="btn btn--ghost" onClick={exportJson}>Exporteer shops.json</button>
          <button type="button" className="btn btn--ghost" onClick={() => downloadFile('winkels.csv', shopsToCsv(store.shops), 'text/csv')}>
            Exporteer CSV
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => fileInput.current?.click()}>Importeer JSON/CSV</button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,.csv,application/json,text/csv"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void onImport(f)
              e.target.value = ''
            }}
          />
          {store.localChangeCount > 0 && (
            <button
              type="button"
              className="btn btn--danger-ghost"
              onClick={() => {
                if (confirm(`Alle ${store.localChangeCount} lokale wijziging(en) weggooien? Dit kan niet ongedaan worden gemaakt.`)) {
                  tryStore(() => store.discardLocalChanges(), 'Lokale wijzigingen weggegooid.')
                }
              }}
            >
              Lokale wijzigingen weggooien
            </button>
          )}
        </div>
      </section>

      {message && (
        <div className={`alert ${message.kind === 'ok' ? 'alert--ok' : 'alert--error'}`} role="status">
          {message.text}
          <button type="button" className="link-btn" onClick={() => setMessage(null)}>Sluiten</button>
        </div>
      )}

      <div className="admin__filters">
        <input type="search" placeholder="Zoek op naam, plaats of postcode" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Zoek winkels" />
        <select value={filter} onChange={(e) => setFilter(e.target.value as ListFilter)} aria-label="Toon">
          <option value="all">Alle winkels</option>
          <option value="unverified">Nog te controleren</option>
          <option value="no-hours">Zonder openingstijden</option>
          <option value="inactive">Uitgeschakeld</option>
          <option value="changed">Lokaal gewijzigd</option>
        </select>
      </div>
      <p className="hint">{list.length} resultaten</p>

      {store.status === 'loading' && <p>Laden…</p>}
      <ul className="admin-list">
        {list.slice(0, limit).map((s) => (
          <li key={s.id} className={`admin-row${s.active ? '' : ' admin-row--inactive'}`}>
            <div className="admin-row__main">
              <strong>{s.name}</strong>
              <span className="muted">
                {[s.address, s.postcode, s.city].filter(Boolean).join(', ') || 'Adres onbekend'}
              </span>
              <span className="admin-row__meta">
                {s.categories.map((c) => getCategory(c)?.shortLabel ?? c).join(' · ')}
                {' · '}
                {s.verification === 'verified' ? '✓ gecontroleerd' : 'te controleren'}
                {!s.openingHours && ' · geen openingstijden'}
                {!s.active && ' · uitgeschakeld'}
                {store.isLocallyChanged(s.id) && ' · lokaal gewijzigd'}
              </span>
              {s.notes && <span className="admin-row__notes">{s.notes}</span>}
            </div>
            <div className="admin-row__actions">
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing({ shop: s, isNew: false })}>
                Bewerken
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => tryStore(() => store.saveShop({ ...s, active: !s.active }), s.active ? `“${s.name}” uitgeschakeld.` : `“${s.name}” weer actief.`)}
              >
                {s.active ? 'Uitschakelen' : 'Inschakelen'}
              </button>
              {store.isLocallyChanged(s.id) && store.baseShops.some((b) => b.id === s.id) && (
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => tryStore(() => store.revertShop(s.id), `Wijzigingen aan “${s.name}” teruggedraaid.`)}>
                  Terugdraaien
                </button>
              )}
              <button
                type="button"
                className="btn btn--danger-ghost btn--sm"
                onClick={() => {
                  if (confirm(`“${s.name}” definitief verwijderen? Tip: met uitschakelen kun je hem later terugzetten.`)) {
                    tryStore(() => store.deleteShop(s.id), `“${s.name}” verwijderd.`)
                  }
                }}
              >
                Verwijderen
              </button>
            </div>
          </li>
        ))}
      </ul>
      {list.length > limit && (
        <button type="button" className="btn btn--ghost btn--block" onClick={() => setLimit((l) => l + 100)}>
          Toon meer ({list.length - limit} over)
        </button>
      )}
    </div>
  )
}
