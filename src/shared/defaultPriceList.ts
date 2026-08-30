// The shop's catalog exactly as the owner has it arranged — every product, its
// category, its retail and wholesale price per kg, its bag size and the level it
// should warn at. Every fresh install seeds itself from this (see seedDefaults in
// main/database.ts), so a new till opens with the shop's own sorting rather than
// ~60 products and a dozen categories to retype.
//
// Deliberately NOT included: stock and buying price. Both start at zero and are
// captured by the first Add Stock, because bags and costs are what a new till
// cannot know — inventing them would make it lie about the store from day one.
export interface DefaultPriceListItem {
  name: string
  /** Category name; created on first use. null leaves the product uncategorised. */
  category: string | null
  retailPricePerKg: number
  wholesalePricePerKg: number
  weightPerBag: number
  minStockAlertKg: number
  /** Omitted means active. Products the owner has retired ship deactivated. */
  isActive?: boolean
}

export const DEFAULT_PRICE_LIST: DefaultPriceListItem[] = [
  // BEANS
  { name: 'Army Green', category: 'BEANS', retailPricePerKg: 120, wholesalePricePerKg: 120, weightPerBag: 90, minStockAlertKg: 90 },
  { name: 'Butter Beans Black', category: 'BEANS', retailPricePerKg: 180, wholesalePricePerKg: 180, weightPerBag: 90, minStockAlertKg: 90 },
  { name: 'Butter Beans White', category: 'BEANS', retailPricePerKg: 200, wholesalePricePerKg: 200, weightPerBag: 90, minStockAlertKg: 90 },
  { name: 'Gituru', category: 'BEANS', retailPricePerKg: 110, wholesalePricePerKg: 110, weightPerBag: 90, minStockAlertKg: 90 },
  { name: 'Kakunzu (Uganda)', category: 'BEANS', retailPricePerKg: 120, wholesalePricePerKg: 120, weightPerBag: 90, minStockAlertKg: 90 },
  { name: 'Kakunzu (Ukambani)', category: 'BEANS', retailPricePerKg: 120, wholesalePricePerKg: 120, weightPerBag: 90, minStockAlertKg: 90 },
  { name: 'Mwezi Moja', category: 'BEANS', retailPricePerKg: 110, wholesalePricePerKg: 110, weightPerBag: 90, minStockAlertKg: 90 },
  { name: 'Mwitemania', category: 'BEANS', retailPricePerKg: 100, wholesalePricePerKg: 90, weightPerBag: 90, minStockAlertKg: 90 },
  { name: 'Njahe', category: 'BEANS', retailPricePerKg: 75, wholesalePricePerKg: 70, weightPerBag: 90, minStockAlertKg: 90 },
  { name: 'Nyayo', category: 'BEANS', retailPricePerKg: 100, wholesalePricePerKg: 95, weightPerBag: 90, minStockAlertKg: 90 },
  { name: 'Roscoco', category: 'BEANS', retailPricePerKg: 110, wholesalePricePerKg: 110, weightPerBag: 90, minStockAlertKg: 90 },
  { name: 'Roscoco Ndogo', category: 'BEANS', retailPricePerKg: 120, wholesalePricePerKg: 120, weightPerBag: 90, minStockAlertKg: 90 },
  { name: 'Rosecoco', category: 'BEANS', retailPricePerKg: 170, wholesalePricePerKg: 140, weightPerBag: 90, minStockAlertKg: 100 },
  { name: 'Saitoti', category: 'BEANS', retailPricePerKg: 110, wholesalePricePerKg: 110, weightPerBag: 90, minStockAlertKg: 90 },
  { name: 'Wairimu', category: 'BEANS', retailPricePerKg: 90, wholesalePricePerKg: 85, weightPerBag: 90, minStockAlertKg: 90 },
  { name: 'Yellow (Duara)', category: 'BEANS', retailPricePerKg: 100, wholesalePricePerKg: 95, weightPerBag: 90, minStockAlertKg: 90 },

  // Flour
  { name: 'Maize Flour (Unga Dola)', category: 'Flour', retailPricePerKg: 75, wholesalePricePerKg: 68, weightPerBag: 90, minStockAlertKg: 150, isActive: false },
  { name: 'Wheat Flour (Ngano)', category: 'Flour', retailPricePerKg: 90, wholesalePricePerKg: 82, weightPerBag: 50, minStockAlertKg: 100 },

  // General
  { name: 'Chick Peas', category: 'General', retailPricePerKg: 120, wholesalePricePerKg: 120, weightPerBag: 90, minStockAlertKg: 90 },
  { name: 'Gunia', category: 'General', retailPricePerKg: 20, wholesalePricePerKg: 20, weightPerBag: 90, minStockAlertKg: 90 },
  { name: 'Khaki', category: 'General', retailPricePerKg: 120, wholesalePricePerKg: 120, weightPerBag: 90, minStockAlertKg: 90 },
  { name: 'Kunde [R]', category: 'General', retailPricePerKg: 90, wholesalePricePerKg: 80, weightPerBag: 90, minStockAlertKg: 90 },
  { name: 'Kunde [W]', category: 'General', retailPricePerKg: 105, wholesalePricePerKg: 105, weightPerBag: 90, minStockAlertKg: 90 },
  { name: 'Lentils Kamande', category: 'General', retailPricePerKg: 165, wholesalePricePerKg: 165, weightPerBag: 90, minStockAlertKg: 90 },
  { name: 'Mbaazi', category: 'General', retailPricePerKg: 95, wholesalePricePerKg: 90, weightPerBag: 90, minStockAlertKg: 90 },
  { name: 'Minji', category: 'General', retailPricePerKg: 130, wholesalePricePerKg: 125, weightPerBag: 90, minStockAlertKg: 90 },
  { name: 'Mixed', category: 'General', retailPricePerKg: 100, wholesalePricePerKg: 100, weightPerBag: 90, minStockAlertKg: 90 },
  { name: 'Muhogo', category: 'General', retailPricePerKg: 80, wholesalePricePerKg: 80, weightPerBag: 90, minStockAlertKg: 90 },
  { name: 'Njugu Kubwa', category: 'General', retailPricePerKg: 205, wholesalePricePerKg: 205, weightPerBag: 90, minStockAlertKg: 90 },
  { name: 'Njugu Ndogo', category: 'General', retailPricePerKg: 210, wholesalePricePerKg: 210, weightPerBag: 90, minStockAlertKg: 90 },
  { name: 'Simsim', category: 'General', retailPricePerKg: 210, wholesalePricePerKg: 210, weightPerBag: 90, minStockAlertKg: 90 },
  { name: 'Soya', category: 'General', retailPricePerKg: 110, wholesalePricePerKg: 110, weightPerBag: 90, minStockAlertKg: 90 },
  { name: 'Split Lentils', category: 'General', retailPricePerKg: 90, wholesalePricePerKg: 90, weightPerBag: 90, minStockAlertKg: 90 },
  { name: 'Terere', category: 'General', retailPricePerKg: 115, wholesalePricePerKg: 110, weightPerBag: 90, minStockAlertKg: 90 },
  { name: 'Unga Mawele', category: 'General', retailPricePerKg: 90, wholesalePricePerKg: 90, weightPerBag: 90, minStockAlertKg: 90 },
  { name: 'Unga Wimbi', category: 'General', retailPricePerKg: 120, wholesalePricePerKg: 120, weightPerBag: 90, minStockAlertKg: 90 },
  { name: 'Yellow', category: 'General', retailPricePerKg: 110, wholesalePricePerKg: 105, weightPerBag: 90, minStockAlertKg: 90, isActive: false },

  // Grains
  { name: 'Mawele', category: 'Grains', retailPricePerKg: 100, wholesalePricePerKg: 100, weightPerBag: 90, minStockAlertKg: 90 },
  { name: 'Millet (Wimbi)', category: 'Grains', retailPricePerKg: 140, wholesalePricePerKg: 128, weightPerBag: 90, minStockAlertKg: 80 },
  { name: 'Mtama', category: 'Grains', retailPricePerKg: 80, wholesalePricePerKg: 80, weightPerBag: 90, minStockAlertKg: 90 },
  { name: 'Ngano', category: 'Grains', retailPricePerKg: 75, wholesalePricePerKg: 70, weightPerBag: 90, minStockAlertKg: 90 },
  { name: 'Sorghum (Mtama)', category: 'Grains', retailPricePerKg: 100, wholesalePricePerKg: 92, weightPerBag: 90, minStockAlertKg: 100 },
  { name: 'Wimbi', category: 'Grains', retailPricePerKg: 120, wholesalePricePerKg: 120, weightPerBag: 90, minStockAlertKg: 90 },
  { name: 'Yellow Beans', category: 'Grains', retailPricePerKg: 110, wholesalePricePerKg: 105, weightPerBag: 90, minStockAlertKg: 150 },

  // KUKU
  { name: 'KuKu feed', category: 'KUKU', retailPricePerKg: 30, wholesalePricePerKg: 30, weightPerBag: 90, minStockAlertKg: 90 },
  { name: 'Njenga', category: 'KUKU', retailPricePerKg: 65, wholesalePricePerKg: 65, weightPerBag: 90, minStockAlertKg: 90 },

  // MAIZE
  { name: 'Maize', category: 'MAIZE', retailPricePerKg: 50, wholesalePricePerKg: 45, weightPerBag: 90, minStockAlertKg: 90 },
  { name: 'Maize Yellow', category: 'MAIZE', retailPricePerKg: 65, wholesalePricePerKg: 65, weightPerBag: 90, minStockAlertKg: 90 },
  { name: 'Muthokoi', category: 'MAIZE', retailPricePerKg: 65, wholesalePricePerKg: 65, weightPerBag: 90, minStockAlertKg: 90 },
  { name: 'Popcorn', category: 'MAIZE', retailPricePerKg: 175, wholesalePricePerKg: 175, weightPerBag: 90, minStockAlertKg: 90 },

  // Ndengu
  { name: 'Cotton', category: 'Ndengu', retailPricePerKg: 120, wholesalePricePerKg: 115, weightPerBag: 90, minStockAlertKg: 90 },
  { name: 'Makueni', category: 'Ndengu', retailPricePerKg: 125, wholesalePricePerKg: 120, weightPerBag: 90, minStockAlertKg: 90 },
  { name: 'Ndengu', category: 'Ndengu', retailPricePerKg: 200, wholesalePricePerKg: 185, weightPerBag: 90, minStockAlertKg: 80 },
  { name: 'Ndengu Special', category: 'Ndengu', retailPricePerKg: 110, wholesalePricePerKg: 110, weightPerBag: 90, minStockAlertKg: 90 },
  { name: 'Nylon', category: 'Ndengu', retailPricePerKg: 120, wholesalePricePerKg: 115, weightPerBag: 90, minStockAlertKg: 90 },

  // Rice
  { name: 'Basmatt', category: 'Rice', retailPricePerKg: 140, wholesalePricePerKg: 140, weightPerBag: 90, minStockAlertKg: 90 },
  { name: 'Biryiani', category: 'Rice', retailPricePerKg: 100, wholesalePricePerKg: 100, weightPerBag: 90, minStockAlertKg: 90 },
  { name: 'Pishori', category: 'Rice', retailPricePerKg: 165, wholesalePricePerKg: 160, weightPerBag: 90, minStockAlertKg: 90 },
  { name: 'Pishori Rice (Mwea)', category: 'Rice', retailPricePerKg: 165, wholesalePricePerKg: 160, weightPerBag: 50, minStockAlertKg: 100 },
  { name: 'Sindano', category: 'Rice', retailPricePerKg: 155, wholesalePricePerKg: 140, weightPerBag: 50, minStockAlertKg: 100 },

  // UJI
  { name: 'UJI Ndimu', category: 'UJI', retailPricePerKg: 80, wholesalePricePerKg: 75, weightPerBag: 90, minStockAlertKg: 90 },
  { name: 'UJI Plain', category: 'UJI', retailPricePerKg: 75, wholesalePricePerKg: 70, weightPerBag: 90, minStockAlertKg: 90 },

  // Uncategorised
  { name: 'Baazi', category: null, retailPricePerKg: 95, wholesalePricePerKg: 90, weightPerBag: 90, minStockAlertKg: 100, isActive: false },
]

// Seeded so the category chips exist even before the products land. Derived from
// the list itself rather than hand-maintained, so a category can never ship empty
// and none can be forgotten.
export const DEFAULT_CATEGORIES: string[] = [
  ...new Set(DEFAULT_PRICE_LIST.map((item) => item.category).filter((name): name is string => Boolean(name))),
].sort((a, b) => a.localeCompare(b))
