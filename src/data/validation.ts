import { getCategory } from '../domain/categories.ts'
import { distanceKm, isInNetherlandsBox } from '../domain/geo.ts'
import { isValidTime } from '../domain/openingHours.ts'
import { normalizeText } from '../domain/shopQuery.ts'
import { DAY_KEYS, type Shop } from '../domain/types.ts'

export interface ValidationResult {
  errors: string[]
  warnings: string[]
}

export function validateShop(shop: Shop, others: Shop[]): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!shop.name.trim()) errors.push('Naam is verplicht.')
  if (!Number.isFinite(shop.lat) || !Number.isFinite(shop.lon)) errors.push('Latitude en longitude zijn verplicht (getallen).')
  else if (!isInNetherlandsBox(shop)) warnings.push('De coördinaten liggen buiten Nederland. Klopt dat?')
  if (shop.categories.length === 0) errors.push('Kies minimaal één categorie.')
  for (const c of shop.categories) if (!getCategory(c)) errors.push(`Onbekende categorie: ${c}`)
  if (shop.postcode && !/^\d{4} ?[A-Z]{2}$/i.test(shop.postcode)) warnings.push('Postcode heeft niet de vorm "1234 AB".')
  if (shop.website && !/^https?:\/\/\S+\.\S+/.test(shop.website)) errors.push('Website moet beginnen met http:// of https://')

  if (shop.openingHours) {
    for (const d of DAY_KEYS) {
      for (const r of shop.openingHours.weekly[d]) {
        if (!isValidTime(r.open) || !isValidTime(r.close)) errors.push(`Ongeldige tijd bij ${d}: ${r.open}–${r.close}`)
      }
    }
  }

  // Dubbele winkels voorkomen.
  const name = normalizeText(shop.name)
  for (const other of others) {
    if (other.id === shop.id) continue
    if (normalizeText(other.name) === name && Number.isFinite(shop.lat) && distanceKm(shop, other) < 0.1) {
      errors.push(`Deze winkel bestaat al: "${other.name}" (${other.city || 'onbekende plaats'}).`)
    }
  }
  return { errors, warnings }
}
