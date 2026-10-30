// What an account is allowed to do beyond selling. Each right is ticked on its own
// in the staff form, and every admin-only control is gated on exactly one of these.
// The main process checks the same list, so a right here is a right everywhere.

export const ADMIN_RIGHTS = [
  'manage_staff',
  'manage_products',
  'view_reports',
  'manage_bills',
  'manage_settings',
  'manage_backups',
  'approve_discounts_voids',
  'manage_stock',
] as const

export type AdminRight = (typeof ADMIN_RIGHTS)[number]

export const ADMIN_RIGHT_INFO: Record<AdminRight, { label: string; hint: string }> = {
  manage_staff: {
    label: 'Manage staff',
    hint: 'Add people, change their PINs, and switch accounts on or off.',
  },
  manage_products: {
    label: 'Manage products & prices',
    hint: 'Edit product details, buying prices, fraction prices and containers.',
  },
  view_reports: {
    label: 'See reports',
    hint: 'The Reports screen, sales and profit, and past shift reports.',
  },
  manage_bills: {
    label: 'Record monthly bills',
    hint: 'Rent, electricity, water and other bills that come once a month.',
  },
  manage_settings: {
    label: 'Change shop settings',
    hint: 'Shop name, printer, receipts, and the rules staff work under.',
  },
  manage_backups: {
    label: 'Back up & restore data',
    hint: 'Save a copy of the shop data, or load one back.',
  },
  approve_discounts_voids: {
    label: 'Give discounts & void sales',
    hint: 'Apply discounts and cancel sales without asking an admin first.',
  },
  manage_stock: {
    label: 'Approve stock & see take-home',
    hint: 'Approve or reject deliveries staff add, and see what has been taken home.',
  },
}

/** A person who has no rights is a cashier. Anyone with at least one is an admin. */
export function hasRight(user: { rights: readonly AdminRight[] } | null | undefined, right: AdminRight): boolean {
  return !!user && user.rights.includes(right)
}

export function normalizeRights(rights: readonly string[]): AdminRight[] {
  return ADMIN_RIGHTS.filter((right) => rights.includes(right))
}
