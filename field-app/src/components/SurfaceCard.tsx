import type { PropsWithChildren } from "react";

type SurfaceCardProps = PropsWithChildren<{
  className?: string;
}>;

export default function SurfaceCard({ children, className = "" }: SurfaceCardProps) {
  return (
    <div
      className={`rounded-[28px] border border-white/70 bg-white/90 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.08)] backdrop-blur ${className}`.trim()}
    >
      {children}
    </div>
  );
}
