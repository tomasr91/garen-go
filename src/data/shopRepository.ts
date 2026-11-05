import type { Shop, ShopDataset } from '../domain/types.ts'

/**
 * Centrale databron.
 *
 * Eerste versie (alleen frontend):
 *   1. De gepubliceerde basisdata staat in `public/data/shops.json` (in git, dus versiebeheer).
 *   2. Wijzigingen uit het beheerscherm worden als "lokale wijzigingen" in localStorage bewaard
 *      en over de basisdata heen gelegd. Ze gaan dus niet verloren bij herladen.
 *   3. Via "Exporteer shops.json" in beheer maak je van die wijzigingen een nieuwe basisdata
 *      die je in de repo zet; daarna gelden ze voor iedereen.
 *
 * Later: vervang `LocalChangesStorage` door een implementatie die met een API/database praat.
 * De rest van de app gebruikt alleen deze module en merkt daar niets van.
 */

export interface LocalChanges {
  /** Toegevoegde of gewijzigde winkels, op ID. */
  upserts: Record<string, Shop>
  /** Verwijderde winkel-ID's. */
  deleted: string[]
}

export interface ChangesStorage {
  load(): LocalChanges
  save(changes: LocalChanges): void
}

const STORAGE_KEY = 'garen-go:local-changes:v1'

export const emptyChanges = (): LocalChanges => ({ upserts: {}, deleted: [] })

export class LocalChangesStorage implements ChangesStorage {
  private readonly storage: Storage | undefined
  constructor(storage?: Storage) {
    this.storage = storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined)
  }
  load(): LocalChanges {
    try {
      const raw = this.storage?.getItem(STORAGE_KEY)
      if (!raw) return emptyChanges()
      const parsed = JSON.parse(raw) as LocalChanges
      return { upserts: parsed.upserts ?? {}, deleted: parsed.deleted ?? [] }
    } catch {
      return emptyChanges()
    }
  }
  save(changes: LocalChanges): void {
    // Gooit bewust door bij een volle of geblokkeerde opslag, zodat de UI dat kan melden.
    this.storage?.setItem(STORAGE_KEY, JSON.stringify(changes))
  }
}

export async function fetchBaseDataset(url = `${import.meta.env.BASE_URL}data/shops.json`): Promise<ShopDataset> {
  const res = await fetch(url, { cache: 'no-cache' })
  if (!res.ok) throw new Error(`Winkeldata kon niet worden geladen (HTTP ${res.status}).`)
  const data = (await res.json()) as ShopDataset
  if (!Array.isArray(data.shops)) throw new Error('Winkeldata heeft een onverwacht formaat.')
  return data
}

/** Basisdata + lokale wijzigingen = wat de app toont. */
export function applyChanges(base: Shop[], changes: LocalChanges): Shop[] {
  const deleted = new Set(changes.deleted)
  const result: Shop[] = []
  const seen = new Set<string>()
  for (const shop of base) {
    if (deleted.has(shop.id)) continue
    result.push(changes.upserts[shop.id] ?? shop)
    seen.add(shop.id)
  }
  for (const [id, shop] of Object.entries(changes.upserts)) {
    if (!seen.has(id) && !deleted.has(id)) result.push(shop)
  }
  return result
}

export function countChanges(changes: LocalChanges): number {
  return Object.keys(changes.upserts).length + changes.deleted.length
}

export function toDataset(shops: Shop[], attribution?: string): ShopDataset {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    attribution,
    shops: [...shops].sort((a, b) => a.id.localeCompare(b.id)),
  }
}

export function newShopId(): string {
  const uuid =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  return `man-${uuid}`
}
