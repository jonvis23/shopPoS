// Every timestamp the shop sees — on screen, on receipts, on the printed price
// list — goes through here. The till is read at a glance by people who think in
// "quarter past two in the afternoon", not "14:15", so the clock is always 12-hour
// with an AM/PM marker. Keeping the formatters in one module is what stops half
// the app drifting back to the browser's locale default.
//
// Date and time use different locales on purpose: en-GB gives the unambiguous
// day-month-year order ("8 Aug 2026" can't be misread the way "08/08" can), while
// en-US is what reliably renders an uppercase "AM"/"PM" rather than "am"/"pm".

type DateInput = Date | string | number

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

const dayFormatter = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})

const timeFormatter = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})

const timeWithSecondsFormatter = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
  hour12: true,
})

function toDate(value: DateInput): Date | null {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** "8 Aug 2026" */
export function formatDate(value: DateInput): string {
  const date = toDate(value)
  return date ? dateFormatter.format(date) : '—'
}

/** "2:45 PM" */
export function formatTime(value: DateInput): string {
  const date = toDate(value)
  return date ? timeFormatter.format(date) : '—'
}

/** "2:45:09 PM" — for the running header clock, where seconds show it's live. */
export function formatTimeWithSeconds(value: DateInput): string {
  const date = toDate(value)
  return date ? timeWithSecondsFormatter.format(date) : '—'
}

/** "8 Aug 2026, 2:45 PM" — the default for any logged/recorded moment. */
export function formatDateTime(value: DateInput): string {
  const date = toDate(value)
  if (!date) return '—'
  return `${dateFormatter.format(date)}, ${timeFormatter.format(date)}`
}

/** "Fri 8 Aug, 2:45 PM" — compact form for the top bar. */
export function formatShortDateTime(value: DateInput): string {
  const date = toDate(value)
  if (!date) return '—'
  return `${dayFormatter.format(date).replace(',', '')}, ${timeFormatter.format(date)}`
}

/** "2 PM" / "12 AM" — hour buckets on the analytics chart. */
export function formatHour(hour: number): string {
  const normalized = ((hour % 24) + 24) % 24
  const suffix = normalized < 12 ? 'AM' : 'PM'
  const display = normalized % 12 === 0 ? 12 : normalized % 12
  return `${display} ${suffix}`
}
