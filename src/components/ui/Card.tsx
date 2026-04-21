import { cn } from "@/lib/utils";
import type { PropsWithChildren } from "react";

export default function Card({
  className,
  children,
}: PropsWithChildren<{ className?: string }>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-zinc-200 bg-white shadow-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}

