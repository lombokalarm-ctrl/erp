import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

type Option = {
  value: string;
  label: string;
};

type Props = {
  value: string;
  options: Option[];
  onChange: (nextValue: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
  selectClassName?: string;
  includePlaceholder?: boolean;
  emptyText?: string;
};

export default function SearchableSelect({
  value,
  options,
  onChange,
  placeholder = "Pilih data",
  searchPlaceholder = "Cari...",
  disabled,
  className,
  selectClassName,
  includePlaceholder = true,
  emptyText = "Data tidak ditemukan",
}: Props) {
  const [query, setQuery] = useState("");

  const filteredOptions = useMemo(() => {
    const key = query.trim().toLowerCase();
    if (!key) return options;
    return options.filter((opt) => opt.label.toLowerCase().includes(key));
  }, [options, query]);

  return (
    <div className={cn("space-y-1", className)}>
      <input
        className={cn(
          "h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900",
          "placeholder:text-zinc-400",
          "focus:border-zinc-400 focus:outline-none focus:ring-4 focus:ring-zinc-200/60",
        )}
        placeholder={searchPlaceholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        disabled={disabled}
      />
      <select
        className={cn(
          "h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm",
          selectClassName,
        )}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        {includePlaceholder ? <option value="">{placeholder}</option> : null}
        {filteredOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {filteredOptions.length === 0 ? <div className="text-xs text-zinc-500">{emptyText}</div> : null}
    </div>
  );
}
