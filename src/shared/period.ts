// Pure date-range math shared between main (previous-period comparisons) and
// renderer (period picker). No DOM/window dependency, safe to import from either process.

export type PeriodPresetKey = 'today' | 'yesterday' | 'thisWeek' | 'thisMonth' | 'lastMonth'

export interface PeriodRange {
  fromISO: string
  toISO: string
}

export interface LocalRange {
  from: Date
  to: Date
}

export const PERIOD_PRESET_LABELS: Record<PeriodPresetKey, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  thisWeek: 'This Week',
  thisMonth: 'This Month',
  lastMonth: 'Last Month',
}

export const PERIOD_PRESET_ORDER: PeriodPresetKey[] = ['today', 'yesterday', 'thisWeek', 'thisMonth', 'lastMonth']

export function toSqliteTimestamp(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ')
}

// SQLite's CURRENT_TIMESTAMP produces "YYYY-MM-DD HH:MM:SS" in UTC, with no
// timezone marker. JS's Date parser treats a string in that shape as *local*
// time (no 'Z', no 'T' even), so `new Date(row.created_at)` silently mislabels
// a UTC value as local — every displayed time is off by the machine's UTC
// offset (3 hours early, for a shop running in Nairobi/EAT). Tagging it with
// 'Z' before it ever reaches a consumer makes `new Date(...)` and
// `.toLocaleString()` do the UTC->local conversion correctly everywhere.
export function toIsoUtc(sqliteTimestamp: string): string
export function toIsoUtc(sqliteTimestamp: string | null): string | null
export function toIsoUtc(sqliteTimestamp: string | null): string | null {
  if (!sqliteTimestamp) return sqliteTimestamp
  return `${sqliteTimestamp.replace(' ', 'T')}Z`
}

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function endOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}

function startOfWeek(date: Date): Date {
  const d = startOfDay(date)
  const day = d.getDay()
  const diff = day === 0 ? 6 : day - 1 // Monday-start week
  d.setDate(d.getDate() - diff)
  return d
}

export function presetLocalRange(key: PeriodPresetKey, now: Date = new Date()): LocalRange {
  switch (key) {
    case 'yesterday': {
      const y = new Date(now)
      y.setDate(y.getDate() - 1)
      return { from: startOfDay(y), to: endOfDay(y) }
    }
    case 'thisWeek':
      return { from: startOfWeek(now), to: now }
    case 'thisMonth':
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now }
    case 'lastMonth': {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const to = new Date(now.getFullYear(), now.getMonth(), 0)
      return { from: startOfDay(from), to: endOfDay(to) }
    }
    case 'today':
    default:
      return { from: startOfDay(now), to: now }
  }
}

export function customLocalRange(fromDateStr: string, toDateStr: string): LocalRange {
  const [fy, fm, fd] = fromDateStr.split('-').map(Number)
  const [ty, tm, td] = toDateStr.split('-').map(Number)
  return {
    from: new Date(fy, fm - 1, fd, 0, 0, 0, 0),
    to: new Date(ty, tm - 1, td, 23, 59, 59, 999),
  }
}

export function toPeriodRange(local: LocalRange): PeriodRange {
  return { fromISO: toSqliteTimestamp(local.from), toISO: toSqliteTimestamp(local.to) }
}

export function formatLocalDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function expectedLocalDateKeys(local: LocalRange): string[] {
  const cursor = startOfDay(local.from)
  const end = startOfDay(local.to)
  const days: string[] = []
  while (cursor <= end) {
    days.push(formatLocalDate(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return days
}

// Shifts a range back by its own duration, for previous-period comparisons.
// Operates purely on the UTC-normalized ISO strings so it works in the main process too.
export function shiftRangeBack(range: PeriodRange): PeriodRange {
  const fromMs = Date.parse(`${range.fromISO.replace(' ', 'T')}Z`)
  const toMs = Date.parse(`${range.toISO.replace(' ', 'T')}Z`)
  const duration = Math.max(0, toMs - fromMs)
  return {
    fromISO: toSqliteTimestamp(new Date(fromMs - duration)),
    toISO: toSqliteTimestamp(new Date(fromMs)),
  }
}
