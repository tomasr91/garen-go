/**
 * Centraal winkelmodel van Garen & Go.
 *
 * Dit model is bewust los van UI en opslag gehouden zodat het later 1-op-1
 * naar een database-tabel of API-contract kan worden vertaald.
 */

/** Dagen in de vaste volgorde maandag t/m zondag. */
export const DAY_KEYS = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'] as const
export type DayKey = (typeof DAY_KEYS)[number]

/** Tijdvak binnen een dag in "HH:MM". Als `close` <= `open` loopt het door over middernacht. */
export interface TimeRange {
  open: string
  close: string
}

/**
 * Wekelijkse openingstijden. Een lege array betekent: die dag gesloten.
 * Alle zeven dagen zijn altijd aanwezig, zodat "gesloten" en "onbekend" niet verward worden.
 */
export type WeeklyHours = Record<DayKey, TimeRange[]>

/**
 * Afwijkende openingstijden op een specifieke datum (feestdag, vakantie, tijdelijk).
 * `ranges: []` betekent gesloten op die datum.
 */
export interface OpeningException {
  /** Datum in "YYYY-MM-DD" (Nederlandse kalenderdag). */
  date: string
  ranges: TimeRange[]
  reason?: string
}

export interface OpeningHours {
  weekly: WeeklyHours
  exceptions?: OpeningException[]
  /** Oorspronkelijke notatie uit de bron, bijv. de OSM `opening_hours`-tag. */
  raw?: string
  /** Toelichting voor bezoekers, bijv. "In de zomer afwijkende tijden, bel vooraf." */
  note?: string
  /** Als de tijden automatisch van de website van de winkel komen: waar en wanneer. */
  source?: { url: string; method: string; retrievedAt: string }
}

export type SourceType = 'osm' | 'manual' | 'import'

export interface ShopSource {
  type: SourceType
  /** Bijv. "node/123456" voor OpenStreetMap. */
  ref?: string
  url?: string
  /** Datum waarop de bron de gegevens voor het laatst controleerde, indien bekend. */
  checkedAt?: string
}

/**
 * - `verified`: handmatig gecontroleerd (bestaat, fysieke winkel, relevant assortiment).
 * - `unverified`: overgenomen uit een openbare bron, nog niet handmatig gecontroleerd.
 */
export type VerificationStatus = 'verified' | 'unverified'

export interface Shop {
  /** Stabiel ID, bijv. "osm-node-123456" of "man-<uuid>". Verandert nooit. */
  id: string
  name: string
  /** Straat + huisnummer. */
  address: string
  postcode: string
  city: string
  lat: number
  lon: number
  /** Categorie-ID's (zie categories.ts). Een winkel kan meerdere categorieën hebben. */
  categories: string[]
  /** `null` = openingstijden onbekend of niet betrouwbaar te interpreteren. */
  openingHours: OpeningHours | null
  website?: string
  phone?: string
  /** Assortiment / specialisaties, als losse labels. */
  assortment: string[]
  active: boolean
  source: ShopSource
  verification: VerificationStatus
  /** Interne opmerkingen, bijv. wat nog gecontroleerd moet worden. */
  notes?: string
  /** ISO-datum/tijd van de laatste wijziging. */
  updatedAt: string

  // Uitbreidingspunten voor later (nog niet in gebruik in de UI):
  photos?: string[]
}

/** Het bestandsformaat van public/data/shops.json. */
export interface ShopDataset {
  version: 1
  generatedAt: string
  attribution?: string
  shops: Shop[]
}

export function emptyWeek(): WeeklyHours {
  return { mo: [], tu: [], we: [], th: [], fr: [], sa: [], su: [] }
}
