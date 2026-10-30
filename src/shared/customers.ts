// Customers are stored as the name typed at the till, not as rows in a table, so
// "Mama Njeri" and "mama  njeri" would otherwise be two people with two debts.
// Every lookup and grouping goes through this key; the spelling shown is
// whichever the shop used first.

export function normalizeCustomerName(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}

export function customerKey(name: string): string {
  return normalizeCustomerName(name).toLowerCase()
}
