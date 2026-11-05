import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Shop } from '../domain/types.ts'
import {
  applyChanges,
  countChanges,
  emptyChanges,
  fetchBaseDataset,
  LocalChangesStorage,
  type ChangesStorage,
  type LocalChanges,
} from '../data/shopRepository.ts'

interface ShopStoreValue {
  status: 'loading' | 'ready' | 'error'
  error?: string
  /** Alle winkels (ook inactieve), basisdata + lokale wijzigingen. */
  shops: Shop[]
  baseShops: Shop[]
  attribution?: string
  generatedAt?: string
  localChangeCount: number
  saveShop(shop: Shop): void
  saveShops(shops: Shop[]): void
  deleteShop(id: string): void
  discardLocalChanges(): void
  /** Lokale wijziging voor één winkel terugdraaien. */
  revertShop(id: string): void
  isLocallyChanged(id: string): boolean
  reload(): void
}

const ShopStoreContext = createContext<ShopStoreValue | null>(null)

export function ShopStoreProvider({ children, storage }: { children: ReactNode; storage?: ChangesStorage }) {
  const store = useRef<ChangesStorage>(storage ?? new LocalChangesStorage())
  const [base, setBase] = useState<{ shops: Shop[]; attribution?: string; generatedAt?: string }>({ shops: [] })
  const [status, setStatus] = useState<ShopStoreValue['status']>('loading')
  const [error, setError] = useState<string>()
  const [changes, setChanges] = useState<LocalChanges>(() => store.current.load())
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    fetchBaseDataset()
      .then((data) => {
        if (cancelled) return
        setBase({ shops: data.shops, attribution: data.attribution, generatedAt: data.generatedAt })
        setStatus('ready')
      })
      .catch((err: Error) => {
        if (cancelled) return
        setError(err.message)
        setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const changesRef = useRef(changes)
  /** Eerst opslaan, dan pas de status bijwerken. Lukt opslaan niet, dan gooit dit en blijft alles ongewijzigd. */
  const commit = useCallback((update: (c: LocalChanges) => LocalChanges) => {
    const next = update(changesRef.current)
    store.current.save(next)
    changesRef.current = next
    setChanges(next)
  }, [])

  const saveShops = useCallback(
    (list: Shop[]) =>
      commit((c) => {
        const upserts = { ...c.upserts }
        const ids = new Set(list.map((s) => s.id))
        for (const s of list) upserts[s.id] = { ...s, updatedAt: new Date().toISOString() }
        return { upserts, deleted: c.deleted.filter((id) => !ids.has(id)) }
      }),
    [commit],
  )

  const value = useMemo<ShopStoreValue>(() => {
    const baseIds = new Set(base.shops.map((s) => s.id))
    return {
      status,
      error,
      shops: applyChanges(base.shops, changes),
      baseShops: base.shops,
      attribution: base.attribution,
      generatedAt: base.generatedAt,
      localChangeCount: countChanges(changes),
      saveShop: (shop) => saveShops([shop]),
      saveShops,
      deleteShop: (id) =>
        commit((c) => {
          const upserts = { ...c.upserts }
          delete upserts[id]
          // Alleen basiswinkels hoeven als "verwijderd" onthouden te worden.
          return { upserts, deleted: baseIds.has(id) ? [...new Set([...c.deleted, id])] : c.deleted }
        }),
      discardLocalChanges: () => commit(() => emptyChanges()),
      revertShop: (id) =>
        commit((c) => {
          const upserts = { ...c.upserts }
          delete upserts[id]
          return { upserts, deleted: c.deleted.filter((d) => d !== id) }
        }),
      isLocallyChanged: (id) => id in changes.upserts || changes.deleted.includes(id),
      reload: () => setReloadKey((k) => k + 1),
    }
  }, [base, changes, status, error, commit, saveShops])

  return <ShopStoreContext.Provider value={value}>{children}</ShopStoreContext.Provider>
}

export function useShopStore(): ShopStoreValue {
  const ctx = useContext(ShopStoreContext)
  if (!ctx) throw new Error('useShopStore buiten ShopStoreProvider')
  return ctx
}
