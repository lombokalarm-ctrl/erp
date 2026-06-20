export function formatCurrency(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(numeric) ? numeric : 0);
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const dateOnly = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    return `${dateOnly[3]}-${dateOnly[2]}-${dateOnly[1]}`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return `${pad2(parsed.getDate())}-${pad2(parsed.getMonth() + 1)}-${parsed.getFullYear()}`;
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return formatDate(value);
  return `${formatDate(value)} ${pad2(parsed.getHours())}:${pad2(parsed.getMinutes())}`;
}

export function generateLocalId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
