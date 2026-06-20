function pad2(value: number) {
  return String(value).padStart(2, "0")
}

function formatDateParts(day: number, month: number, year: number) {
  return `${pad2(day)}-${pad2(month)}-${year}`
}

function parseDateOnly(value: string) {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  }
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "-"

  const dateOnly = parseDateOnly(value)
  if (dateOnly) {
    return formatDateParts(dateOnly.day, dateOnly.month, dateOnly.year)
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value)
  return formatDateParts(parsed.getDate(), parsed.getMonth() + 1, parsed.getFullYear())
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "-"

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return formatDate(value)
  }

  return `${formatDateParts(parsed.getDate(), parsed.getMonth() + 1, parsed.getFullYear())} ${pad2(parsed.getHours())}:${pad2(parsed.getMinutes())}`
}
