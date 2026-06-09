function toFiniteNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

type CurrencyFormatOptions = {
  includeSymbol?: boolean;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
};

export function formatNumber(
  value: number | string | null | undefined,
  options?: Intl.NumberFormatOptions,
): string {
  const numeric = toFiniteNumber(value);
  if (numeric === null) return "-";
  return new Intl.NumberFormat("id-ID", options).format(numeric);
}

export function formatQuantity(
  value: number | string | null | undefined,
  options?: Pick<CurrencyFormatOptions, "minimumFractionDigits" | "maximumFractionDigits">,
): string {
  const numeric = toFiniteNumber(value);
  if (numeric === null) return "-";

  const hasFraction = !Number.isInteger(numeric);
  return new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: options?.minimumFractionDigits ?? 0,
    maximumFractionDigits: options?.maximumFractionDigits ?? (hasFraction ? 2 : 0),
  }).format(numeric);
}

export function formatCurrency(
  value: number | string | null | undefined,
  options?: CurrencyFormatOptions,
): string {
  const numeric = toFiniteNumber(value);
  const includeSymbol = options?.includeSymbol ?? true;
  const minimumFractionDigits = options?.minimumFractionDigits ?? 0;
  const maximumFractionDigits = options?.maximumFractionDigits ?? 2;
  const formatted = new Intl.NumberFormat("id-ID", {
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(numeric ?? 0);

  return includeSymbol ? `Rp\u00A0${formatted}` : formatted;
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

export function formatPercent(value: number | string | null | undefined, maximumFractionDigits = 2): string {
  const numeric = toFiniteNumber(value);
  if (numeric === null) return "-";
  return `${new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(numeric)}%`;
}
