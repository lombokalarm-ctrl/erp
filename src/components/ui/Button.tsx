import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
};

export default function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: Props) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/60",
        "disabled:cursor-not-allowed disabled:opacity-60",
        size === "sm" ? "h-8 px-2.5" : "h-10 px-3.5",
        variant === "primary" &&
          "bg-zinc-900 text-zinc-50 hover:bg-zinc-800 active:bg-zinc-950",
        variant === "secondary" &&
          "bg-zinc-100 text-zinc-900 hover:bg-zinc-200 active:bg-zinc-300",
        variant === "ghost" &&
          "bg-transparent text-zinc-900 hover:bg-zinc-100 active:bg-zinc-200",
        variant === "danger" &&
          "bg-red-600 text-white hover:bg-red-500 active:bg-red-700",
        className,
      )}
      {...props}
    />
  );
}

