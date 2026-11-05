import { useEffect, useRef, useState } from 'react'
import { IconClose, IconPlus } from '../../components/Icons.tsx'
import { CATEGORIES } from '../../domain/categories.ts'
import { DAY_LABELS } from '../../domain/openingHours.ts'
import { NETHERLANDS_CENTER } from '../../domain/geo.ts'
import { DAY_KEYS, emptyWeek, type DayKey, type Shop, type TimeRange } from '../../domain/types.ts'
import { validateShop } from '../../data/validation.ts'
import { addBaseLayer, L, shopIcon } from '../../map/leaflet.ts'

interface Props {
  initial: Shop
  isNew: boolean
  allShops: Shop[]
  onSave(shop: Shop): string | null
  onCancel(): void
}

type Draft = Omit<Shop, 'lat' | 'lon' | 'assortment'> & { lat: string; lon: string; assortment: string }

const toDraft = (s: Shop): Draft => ({
  ...s,
  lat: Number.isFinite(s.lat) ? String(s.lat) : '',
  lon: Number.isFinite(s.lon) ? String(s.lon) : '',
  assortment: s.assortment.join(', '),
})

function fromDraft(d: Draft): Shop {
  return {
    ...d,
    name: d.name.trim(),
    address: d.address.trim(),
    postcode: d.postcode.trim().toUpperCase().replace(/^(\d{4})\s*([A-Z]{2})$/, '$1 $2'),
    city: d.city.trim(),
    lat: d.lat.trim() === '' ? NaN : Number(d.lat.replace(',', '.')),
    lon: d.lon.trim() === '' ? NaN : Number(d.lon.replace(',', '.')),
    website: d.website?.trim() || undefined,
    phone: d.phone?.trim() || undefined,
    notes: d.notes?.trim() || undefined,
    assortment: d.assortment.split(',').map((s) => s.trim()).filter(Boolean),
  }
}

export function ShopForm({ initial, isNew, allShops, onSave, onCancel }: Props) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial))
  const [errors, setErrors] = useState<string[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }))

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const shop = fromDraft(draft)
    const result = validateShop(shop, allShops)
    setErrors(result.errors)
    setWarnings(result.warnings)
    if (result.errors.length) return
    const saveError = onSave(shop)
    if (saveError) setErrors([saveError])
  }

  const hours = draft.openingHours
  const setDay = (day: DayKey, ranges: TimeRange[]) =>
    set('openingHours', { ...(hours ?? { weekly: emptyWeek() }), weekly: { ...(hours?.weekly ?? emptyWeek()), [day]: ranges } })

  return (
    <form className="admin-form" onSubmit={submit} noValidate>
      <div className="admin-form__head">
        <h2>{isNew ? 'Nieuwe winkel' : `Bewerk: ${initial.name}`}</h2>
        <button type="button" className="icon-btn" onClick={onCancel} aria-label="Annuleren">
          <IconClose />
        </button>
      </div>

      {errors.length > 0 && (
        <div className="alert alert--error" role="alert">
          <ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      )}
      {warnings.length > 0 && errors.length === 0 && (
        <div className="alert alert--warn" role="status">
          <ul>{warnings.map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      )}

      <fieldset>
        <legend>Basisgegevens</legend>
        <label className="field">
          <span>Winkelnaam *</span>
          <input value={draft.name} onChange={(e) => set('name', e.target.value)} required />
        </label>
        <label className="field">
          <span>Adres (straat en huisnummer)</span>
          <input value={draft.address} onChange={(e) => set('address', e.target.value)} autoComplete="off" />
        </label>
        <div className="field-row">
          <label className="field">
            <span>Postcode</span>
            <input value={draft.postcode} onChange={(e) => set('postcode', e.target.value)} placeholder="1234 AB" />
          </label>
          <label className="field">
            <span>Plaats</span>
            <input value={draft.city} onChange={(e) => set('city', e.target.value)} />
          </label>
        </div>
        <div className="field-row">
          <label className="field">
            <span>Website</span>
            <input type="url" value={draft.website ?? ''} onChange={(e) => set('website', e.target.value)} placeholder="https://" />
          </label>
          <label className="field">
            <span>Telefoon</span>
            <input type="tel" value={draft.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span>Assortiment / specialisaties (komma-gescheiden)</span>
          <input value={draft.assortment} onChange={(e) => set('assortment', e.target.value)} placeholder="Wol, Breinaalden, Workshops" />
        </label>
      </fieldset>

      <fieldset>
        <legend>Categorieën *</legend>
        <div className="checks">
          {CATEGORIES.map((c) => (
            <label key={c.id} className="check">
              <input
                type="checkbox"
                checked={draft.categories.includes(c.id)}
                onChange={(e) =>
                  set('categories', e.target.checked ? [...draft.categories, c.id] : draft.categories.filter((x) => x !== c.id))
                }
              />
              <span className="chip__dot" style={{ ['--cat' as string]: c.color }} /> {c.label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Locatie *</legend>
        <p className="hint">Klik op de kaart om de locatie te kiezen, of vul de coördinaten in.</p>
        <LocationPicker
          lat={Number(draft.lat.replace(',', '.'))}
          lon={Number(draft.lon.replace(',', '.'))}
          onPick={(lat, lon) => setDraft((d) => ({ ...d, lat: lat.toFixed(6), lon: lon.toFixed(6) }))}
        />
        <div className="field-row">
          <label className="field">
            <span>Latitude</span>
            <input inputMode="decimal" value={draft.lat} onChange={(e) => set('lat', e.target.value)} placeholder="52.0907" />
          </label>
          <label className="field">
            <span>Longitude</span>
            <input inputMode="decimal" value={draft.lon} onChange={(e) => set('lon', e.target.value)} placeholder="5.1214" />
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Openingstijden</legend>
        <label className="check">
          <input
            type="checkbox"
            checked={hours === null}
            onChange={(e) => set('openingHours', e.target.checked ? null : { weekly: emptyWeek() })}
          />
          Openingstijden onbekend
        </label>
        {hours && (
          <div className="hours-editor">
            {DAY_KEYS.map((d) => (
              <DayEditor key={d} day={d} ranges={hours.weekly[d]} onChange={(r) => setDay(d, r)} />
            ))}
            <label className="field">
              <span>Toelichting voor bezoekers (optioneel)</span>
              <input
                value={hours.note ?? ''}
                onChange={(e) => set('openingHours', { ...hours, note: e.target.value || undefined })}
                placeholder="Bijv. In de zomer afwijkende tijden, bel vooraf"
              />
            </label>
            {hours.raw && <p className="hint">Oorspronkelijke notatie uit de bron: <code>{hours.raw}</code></p>}
          </div>
        )}
      </fieldset>

      <fieldset>
        <legend>Status</legend>
        <label className="check">
          <input type="checkbox" checked={draft.active} onChange={(e) => set('active', e.target.checked)} />
          Actief (zichtbaar in de app)
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={draft.verification === 'verified'}
            onChange={(e) => set('verification', e.target.checked ? 'verified' : 'unverified')}
          />
          Gegevens handmatig gecontroleerd
        </label>
        <label className="field">
          <span>Interne notities</span>
          <textarea rows={3} value={draft.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
        </label>
      </fieldset>

      <div className="admin-form__foot">
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          Annuleren
        </button>
        <button type="submit" className="btn btn--primary">
          Opslaan
        </button>
      </div>
    </form>
  )
}

function DayEditor({ day, ranges, onChange }: { day: DayKey; ranges: TimeRange[]; onChange(r: TimeRange[]): void }) {
  const closed = ranges.length === 0
  return (
    <div className="day-editor">
      <span className="day-editor__label">{DAY_LABELS[day]}</span>
      <div className="day-editor__ranges">
        {closed && <span className="muted">Gesloten</span>}
        {ranges.map((r, i) => (
          <span key={i} className="range">
            <input
              type="time"
              aria-label={`${DAY_LABELS[day]} open`}
              value={r.open}
              onChange={(e) => onChange(ranges.map((x, j) => (j === i ? { ...x, open: e.target.value } : x)))}
            />
            –
            <input
              type="time"
              aria-label={`${DAY_LABELS[day]} sluit`}
              value={r.close === '24:00' ? '23:59' : r.close}
              onChange={(e) => onChange(ranges.map((x, j) => (j === i ? { ...x, close: e.target.value } : x)))}
            />
            <button type="button" className="icon-btn icon-btn--sm" onClick={() => onChange(ranges.filter((_, j) => j !== i))} aria-label="Tijdvak verwijderen">
              <IconClose width={16} height={16} />
            </button>
          </span>
        ))}
        <button
          type="button"
          className="link-btn"
          onClick={() => onChange([...ranges, ranges.length ? { open: '13:00', close: '17:00' } : { open: '09:00', close: '17:30' }])}
        >
          <IconPlus width={16} height={16} /> {closed ? 'Open' : 'Tijdvak'}
        </button>
      </div>
    </div>
  )
}

function LocationPicker({ lat, lon, onPick }: { lat: number; lon: number; onPick(lat: number, lon: number): void }) {
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const pickRef = useRef(onPick)
  pickRef.current = onPick
  const valid = Number.isFinite(lat) && Number.isFinite(lon)

  useEffect(() => {
    if (!ref.current) return
    const map = L.map(ref.current, { scrollWheelZoom: false }).setView(
      valid ? [lat, lon] : [NETHERLANDS_CENTER.lat, NETHERLANDS_CENTER.lon],
      valid ? 16 : 7,
    )
    addBaseLayer(map)
    map.on('click', (e: L.LeafletMouseEvent) => pickRef.current(e.latlng.lat, e.latlng.lng))
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!valid) {
      markerRef.current?.remove()
      markerRef.current = null
      return
    }
    if (!markerRef.current) {
      markerRef.current = L.marker([lat, lon], {
        icon: shopIcon({ categories: [] } as unknown as Shop, true),
        draggable: true,
      }).addTo(map)
      markerRef.current.on('dragend', () => {
        const p = markerRef.current!.getLatLng()
        pickRef.current(p.lat, p.lng)
      })
    } else markerRef.current.setLatLng([lat, lon])
  }, [lat, lon, valid])

  return <div ref={ref} className="minimap minimap--picker" />
}
