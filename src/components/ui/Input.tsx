import { cn } from "@/lib/utils";
import type { InputHTMLAttributes } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string | null;
};

export default function Input({ className, label, error, ...props }: Props) {
  return (
    <label className="block">
      {label ? (
        <div className="mb-1 text-xs font-medium text-zinc-600">{label}</div>
      ) : null}
      <input
        className={cn(
          "h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900",
          "placeholder:text-zinc-400",
          "focus:border-zinc-400 focus:outline-none focus:ring-4 focus:ring-zinc-200/60",
          error ? "border-red-300 focus:border-red-400 focus:ring-red-100" : "",
          className,
        )}
        {...props}
      />
      {error ? <div className="mt-1 text-xs text-red-600">{error}</div> : null}
    </label>
  );
}

