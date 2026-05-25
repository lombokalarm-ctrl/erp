import clsx from "clsx";
import { InputHTMLAttributes } from "react";
import { formatNumber } from "@/lib/numberFormat";

type NumericMode = "integer" | "decimal" | "currency";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> & {
  label?: string;
  error?: string | null;
  value: string;
  mode?: NumericMode;
  allowNegative?: boolean;
  onValueChange: (value: string) => void;
};

function sanitizeInteger(raw: string, allowNegative: boolean) {
  const input = raw.replace(/[^\d-]/g, "");
  if (!allowNegative) return input.replace(/-/g, "");
  const negative = input.startsWith("-") ? "-" : "";
  return negative + input.replace(/-/g, "");
}

function sanitizeDecimal(raw: string, allowNegative: boolean) {
  return sanitizeLocalizedNumber(raw, allowNegative);
}

function sanitizeCurrency(raw: string) {
  return sanitizeLocalizedNumber(raw, false, 2);
}

function sanitizeLocalizedNumber(raw: string, allowNegative: boolean, maxFractionDigits?: number) {
  const cleaned = raw.replace(/\s/g, "").replace(/[^\d,.-]/g, "");
  if (!cleaned) return "";

  const negative = allowNegative && cleaned.startsWith("-") ? "-" : "";
  const unsigned = cleaned.replace(/-/g, "");
  const lastComma = unsigned.lastIndexOf(",");
  const lastDot = unsigned.lastIndexOf(".");

  let decimalSeparator = "";
  if (lastComma >= 0 && lastDot >= 0) {
    decimalSeparator = lastComma > lastDot ? "," : ".";
  } else if (lastComma >= 0) {
    decimalSeparator = ",";
  } else if (lastDot >= 0) {
    const dotCount = unsigned.split(".").length - 1;
    const digitsAfter = unsigned.length - lastDot - 1;
    decimalSeparator = dotCount === 1 && digitsAfter > 0 && digitsAfter <= 2 ? "." : "";
  }

  if (!decimalSeparator) {
    return `${negative}${unsigned.replace(/[.,]/g, "")}`;
  }

  const separatorIndex = unsigned.lastIndexOf(decimalSeparator);
  const integerPart = unsigned.slice(0, separatorIndex).replace(/[.,]/g, "");
  let fractionPart = unsigned.slice(separatorIndex + 1).replace(/[.,]/g, "");
  if (maxFractionDigits !== undefined) {
    fractionPart = fractionPart.slice(0, maxFractionDigits);
  }

  const normalizedInteger = integerPart || "0";
  const hasTrailingSeparator = separatorIndex === unsigned.length - 1;
  const decimalPart = fractionPart || hasTrailingSeparator ? `.${fractionPart}` : "";
  return `${negative}${normalizedInteger}${decimalPart}`;
}

function formatCurrencyInput(value: string) {
  if (!value) return "";
  if (value === "-") return value;

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  return formatNumber(numeric, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function formatDecimalInput(value: string) {
  if (!value) return "";
  if (value === "-") return value;
  return value.replace(".", ",");
}

export default function NumericInput({
  className,
  label,
  error,
  value,
  mode = "integer",
  allowNegative = false,
  onValueChange,
  ...props
}: Props) {
  const normalized =
    mode === "currency"
      ? sanitizeCurrency(value)
      : mode === "decimal"
        ? sanitizeDecimal(value, allowNegative)
        : sanitizeInteger(value, allowNegative);

  const display =
    mode === "currency"
      ? formatCurrencyInput(normalized)
      : mode === "decimal"
        ? formatDecimalInput(normalized)
        : normalized;

  return (
    <label className="block">
      {label ? <span className="mb-1 block text-xs font-medium text-zinc-600">{label}</span> : null}
      <input
        {...props}
        type="text"
        inputMode={mode === "integer" ? "numeric" : "decimal"}
        value={display}
        onChange={(e) => {
          const nextRaw = e.target.value;
          const next =
            mode === "currency"
              ? sanitizeCurrency(nextRaw)
              : mode === "decimal"
                ? sanitizeDecimal(nextRaw, allowNegative)
                : sanitizeInteger(nextRaw, allowNegative);
          onValueChange(next);
        }}
        className={clsx(
          "h-10 w-full rounded-lg border bg-white px-3 text-sm outline-none transition focus:ring-2",
          error
            ? "border-red-300 focus:border-red-400 focus:ring-red-100"
            : "border-zinc-200 focus:border-zinc-300 focus:ring-zinc-100",
          className,
        )}
      />
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : null}
    </label>
  );
}
