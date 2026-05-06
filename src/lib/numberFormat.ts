function toFiniteNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function formatNumber(
  value: number | string | null | undefined,
  options?: Intl.NumberFormatOptions,
): string {
  const numeric = toFiniteNumber(value);
  if (numeric === null) return "-";
  return new Intl.NumberFormat("id-ID", options).format(numeric);
}

export function formatCurrency(value: number | string | null | undefined): string {
  const numeric = toFiniteNumber(value);
  if (numeric === null) return "Rp\u00A00";
  return `Rp\u00A0${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(numeric)}`;
}

export function formatCurrencyCompact(value: number | string | null | undefined): string {
  const numeric = toFiniteNumber(value);
  if (numeric === null) return "Rp0";
  return `Rp${new Intl.NumberFormat("id-ID", {
    notation: "compact",
    compactDisplay: "short",
    maximumFractionDigits: 1,
  }).format(numeric)}`;
}
