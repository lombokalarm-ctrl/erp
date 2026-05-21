type StatusPillProps = {
  tone?: "green" | "amber" | "rose" | "slate";
  children: string;
};

const toneClass: Record<NonNullable<StatusPillProps["tone"]>, string> = {
  green: "bg-emerald-100 text-emerald-700",
  amber: "bg-amber-100 text-amber-700",
  rose: "bg-rose-100 text-rose-700",
  slate: "bg-zinc-200 text-zinc-700",
};

export default function StatusPill({ tone = "slate", children }: StatusPillProps) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${toneClass[tone]}`}>
      {children}
    </span>
  );
}
