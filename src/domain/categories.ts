/**
 * Categorieën zijn configuratie, geen harde typen: een nieuwe categorie toevoegen
 * is een kwestie van een regel aan deze lijst toevoegen.
 */
export interface Category {
  id: string
  /** Volledige naam (filters, beheer). */
  label: string
  /** Korte naam (winkelkaartjes). */
  shortLabel: string
  /** Staat het filter standaard aan? */
  defaultEnabled: boolean
  /** Kleur voor markers en labels. */
  color: string
  emoji: string
}

export const CATEGORIES: Category[] = [
  { id: 'wol', label: 'Wol- en garenwinkels', shortLabel: 'Wol & garen', defaultEnabled: true, color: '#b4532f', emoji: '🧶' },
  { id: 'handwerk', label: 'Handwerkwinkels', shortLabel: 'Handwerk', defaultEnabled: true, color: '#5b7a52', emoji: '🪡' },
  { id: 'fournituren', label: 'Fourniturenwinkels', shortLabel: 'Fournituren', defaultEnabled: false, color: '#4a6a85', emoji: '🧵' },
  { id: 'borduur-quilt', label: 'Borduur- en quiltwinkels', shortLabel: 'Borduren & quilten', defaultEnabled: true, color: '#8a4f7d', emoji: '🪢' },
  { id: 'hobby', label: 'Creatieve hobbywinkels', shortLabel: 'Hobby', defaultEnabled: true, color: '#a4801c', emoji: '✂️' },
]

const byId = new Map(CATEGORIES.map((c) => [c.id, c]))

export function getCategory(id: string): Category | undefined {
  return byId.get(id)
}

export function defaultEnabledCategoryIds(): string[] {
  return CATEGORIES.filter((c) => c.defaultEnabled).map((c) => c.id)
}

/** Kleur van de eerste bekende categorie van een winkel (voor markers). */
export function primaryColor(categoryIds: string[]): string {
  for (const id of categoryIds) {
    const c = byId.get(id)
    if (c) return c.color
  }
  return '#7a6e64'
}
