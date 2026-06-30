import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
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
  autoFocusSearch?: boolean;
  searchInputRef?: MutableRefObject<HTMLInputElement | null> | ((node: HTMLInputElement | null) => void);
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
  autoFocusSearch = false,
  searchInputRef,
}: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const allOptions = useMemo(() => {
    const base = options ?? [];
    return includePlaceholder ? [{ value: "", label: placeholder }, ...base] : base;
  }, [includePlaceholder, options, placeholder]);

  const selectedLabel = useMemo(() => {
    return allOptions.find((opt) => opt.value === value)?.label ?? "";
  }, [allOptions, value]);

  const filteredOptions = useMemo(() => {
    const key = query.trim().toLowerCase();
    if (!key) return allOptions;
    return allOptions.filter((opt) => opt.label.toLowerCase().includes(key));
  }, [allOptions, query]);

  useEffect(() => {
    if (!open) return;
    const onDocumentClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!containerRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocumentClick);
    return () => document.removeEventListener("mousedown", onDocumentClick);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setActiveIndex(0);
  }, [open, query]);

  useEffect(() => {
    setQuery("");
  }, [value]);

  useEffect(() => {
    if (!autoFocusSearch || disabled) return;
    const id = window.requestAnimationFrame(() => {
      searchRef.current?.focus();
      searchRef.current?.select();
      setOpen(true);
    });
    return () => window.cancelAnimationFrame(id);
  }, [autoFocusSearch, disabled]);

  return (
    <div ref={containerRef} className={cn("space-y-1", className)}>
      <input
        ref={(node) => {
          searchRef.current = node;
          if (typeof searchInputRef === "function") {
            searchInputRef(node);
          } else if (searchInputRef && "current" in searchInputRef) {
            searchInputRef.current = node;
          }
        }}
        className={cn(
          "h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900",
          "placeholder:text-zinc-400",
          "focus:border-zinc-400 focus:outline-none focus:ring-4 focus:ring-zinc-200/60",
        )}
        placeholder={searchPlaceholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!disabled) setOpen(true);
        }}
        onFocus={() => {
          if (!disabled) setOpen(true);
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Escape") {
            setOpen(false);
            return;
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActiveIndex((i) => Math.min(i + 1, Math.max(0, filteredOptions.length - 1)));
            return;
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
            setActiveIndex((i) => Math.max(0, i - 1));
            return;
          }
          if (e.key === "Enter") {
            if (!open) {
              setOpen(true);
              return;
            }
            const picked = filteredOptions[activeIndex];
            if (picked) {
              onChange(picked.value);
              setOpen(false);
              setQuery("");
            }
          }
        }}
        disabled={disabled}
      />
      <div className="relative">
        <button
          type="button"
          className={cn(
            "h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-left text-sm",
            "focus:border-zinc-400 focus:outline-none focus:ring-4 focus:ring-zinc-200/60",
            disabled ? "cursor-not-allowed bg-zinc-100 text-zinc-500" : "cursor-pointer",
            selectClassName,
          )}
          onClick={() => {
            if (disabled) return;
            setOpen((v) => !v);
            if (!open) {
              requestAnimationFrame(() => searchRef.current?.focus());
            }
          }}
          disabled={disabled}
        >
          <span className={cn(!value ? "text-zinc-400" : "text-zinc-900")}>
            {value ? selectedLabel : placeholder}
          </span>
        </button>

        {open ? (
          <div className="absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg">
            <div className="max-h-72 overflow-auto py-1">
              {filteredOptions.length === 0 ? (
                <div className="px-3 py-2 text-xs text-zinc-500">{emptyText}</div>
              ) : (
                filteredOptions.map((opt, idx) => (
                  <button
                    key={`${opt.value}:${idx}`}
                    type="button"
                    className={cn(
                      "w-full px-3 py-2 text-left text-sm",
                      idx === activeIndex ? "bg-zinc-100" : "bg-white hover:bg-zinc-50",
                      opt.value === value ? "font-semibold text-zinc-900" : "text-zinc-700",
                    )}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    {opt.label}
                  </button>
                ))
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
