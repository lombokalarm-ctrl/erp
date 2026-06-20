import { Home, Truck, Users, ReceiptText, RefreshCcw, ClipboardList, LogOut, Wifi, WifiOff } from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import SurfaceCard from "@/components/SurfaceCard";
import StatusPill from "@/components/StatusPill";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useAuthStore } from "@/stores/authStore";
import { useFieldStore } from "@/stores/fieldStore";

const links = [
  { to: "/home", icon: Home, label: "Home" },
  { to: "/customers", icon: Users, label: "Pelanggan" },
  { to: "/sales-orders", icon: ClipboardList, label: "SO" },
  { to: "/deliveries", icon: Truck, label: "Antar" },
  { to: "/visits", icon: ReceiptText, label: "Visit" },
  { to: "/sync", icon: RefreshCcw, label: "Sync" },
];

export default function FieldLayout() {
  const navigate = useNavigate();
  const isOnline = useOnlineStatus();
  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);
  const orderDrafts = useFieldStore((state) => state.orderDrafts);
  const visitDrafts = useFieldStore((state) => state.visitDrafts);
  const pendingCount = orderDrafts.length + visitDrafts.length;

  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_top,#d9f99d_0%,#f7f5ef_28%,#f3f4f6_100%)] pb-28">
      <div className="mx-auto max-w-md px-4 pb-6 pt-4">
        <SurfaceCard className="rounded-[32px] !border-emerald-700/40 !bg-[linear-gradient(135deg,#052e16,#14532d_62%,#4d7c0f)] px-5 py-4 !text-white">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.24em] text-emerald-200">Madani Field</div>
              <div className="mt-3 text-xs font-medium text-emerald-200">Pengguna aktif</div>
              <div className="mt-1 text-xl font-semibold">{user?.fullName || "Pengguna Lapangan"}</div>
              <div className="mt-1 text-sm text-emerald-100">{user?.role || "Sales / Driver"}</div>
            </div>
            <button
              type="button"
              onClick={() => {
                logout();
                navigate("/login");
              }}
              className="inline-flex items-center gap-2 rounded-2xl border border-emerald-100/60 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-white"
            >
              <LogOut className="h-4 w-4" />
              <span>Logout</span>
            </button>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isOnline ? <Wifi className="h-4 w-4 text-emerald-200" /> : <WifiOff className="h-4 w-4 text-amber-300" />}
              <span className="text-sm text-emerald-50">{isOnline ? "Online" : "Offline ringan"}</span>
            </div>
            <StatusPill tone={pendingCount ? "amber" : "green"}>
              {pendingCount ? `${orderDrafts.length} SO • ${visitDrafts.length} visit` : "Semua sinkron"}
            </StatusPill>
          </div>
        </SurfaceCard>

        <main className="mt-4">
          <Outlet />
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-md px-4 pb-4">
        <div className="grid grid-cols-6 gap-2 rounded-[28px] border border-white/80 bg-white/95 p-2 shadow-[0_18px_36px_rgba(15,23,42,0.12)] backdrop-blur">
          {links.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 rounded-2xl px-1 py-2 text-[11px] font-medium transition ${
                  isActive ? "bg-emerald-950 text-white" : "text-zinc-500 hover:bg-zinc-100"
                }`
              }
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
