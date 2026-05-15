export function localDateKey(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function dateFromKey(dateKey: string): Date {
  return new Date(`${dateKey}T12:00:00`)
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

export function weekDatesFor(date = new Date()): string[] {
  const monday = new Date(date)
  monday.setHours(12, 0, 0, 0)
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  return Array.from({ length: 7 }, (_, index) => localDateKey(addDays(monday, index)))
}

export function formatDateKey(
  dateKey: string,
  options: Intl.DateTimeFormatOptions,
  locale = 'en-US',
): string {
  return dateFromKey(dateKey).toLocaleDateString(locale, options)
}

export function previousDateKey(dateKey: string): string {
  return localDateKey(addDays(dateFromKey(dateKey), -1))
}
