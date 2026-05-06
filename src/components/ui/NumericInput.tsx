import clsx from "clsx";
import { InputHTMLAttributes } from "react";

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
  const normalized = raw.replace(/,/g, ".");
  const input = normalized.replace(/[^\d.-]/g, "");
  const negative = allowNegative && input.startsWith("-") ? "-" : "";
  const unsigned = input.replace(/-/g, "");
  const [head, ...tail] = unsigned.split(".");
  const decimal = tail.length ? `.${tail.join("")}` : "";
  return `${negative}${head}${decimal}`;
}

function sanitizeCurrency(raw: string) {
  return raw.replace(/\D/g, "");
}

function formatCurrency(digits: string) {
  if (!digits) return "";
  return new Intl.NumberFormat("id-ID").format(Number(digits));
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

  const display = mode === "currency" ? formatCurrency(normalized) : normalized;

  return (
    <label className="block">
      {label ? <span className="mb-1 block text-xs font-medium text-zinc-600">{label}</span> : null}
      <input
        {...props}
        type="text"
        inputMode={mode === "decimal" ? "decimal" : "numeric"}
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
