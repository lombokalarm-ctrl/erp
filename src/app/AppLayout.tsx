import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  LayoutDashboard,
  Users,
  Package,
  Boxes,
  ShoppingCart,
  FileText,
  Wallet,
  LineChart,
  Building2,
  Truck,
  ClipboardList,
  Shield,
  Menu,
  LogOut,
  ChevronDown,
  ChevronRight,
  Tag,
  Calculator,
  RotateCcw,
  Building,
  ShieldAlert,
  KeyRound,
  Bell,
  Search,
  Ruler,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import { useSettingsStore } from "@/stores/settingsStore";
import Button from "@/components/ui/Button";
import { apiFetch } from "@/api/client";

type NavItem = {
  to: string;
  label: string;
  icon: React.ReactNode;
  anyPerm?: string[];
  matchMode?: "exact" | "prefix";
};

type NavGroup = {
  groupLabel: string;
  anyPerm?: string[];
  items: NavItem[];
};

type NotificationItem = {
  id: string;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string | null;
  payload?: {
    invoiceId?: string;
  };
  isRead: boolean;
  createdAt: string;
};

type GlobalSearchItem = {
  id: string;
  module: "customers" | "products" | "suppliers" | "sales-orders" | "invoices" | "credit-notes";
  title: string;
  subtitle: string;
  status?: string;
  url: string;
};

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<GlobalSearchItem[]>([]);
  const notifPanelRef = useRef<HTMLDivElement | null>(null);
  const searchPanelRef = useRef<HTMLDivElement | null>(null);
  const user = useAuthStore((s) => s.user);
  const hasAnyPermission = useAuthStore((s) => s.hasAnyPermission);
  const logout = useAuthStore((s) => s.logout);
  const companyName = useSettingsStore((s) => s.company?.name);
  const fetchCompany = useSettingsStore((s) => s.fetchCompany);

  useMemo(() => {
    fetchCompany();
  }, [fetchCompany]);

  const fetchNotifications = async () => {
    if (!user) return;
    setNotifLoading(true);
    try {
      const res = await apiFetch<{
        data: NotificationItem[];
        meta?: { unreadCount?: number };
      }>("/api/v1/notifications?page=1&pageSize=8");
      setNotifications(res.data ?? []);
      setUnreadCount(res.meta?.unreadCount ?? 0);
    } catch {
      // Ignore fetch error in layout to avoid blocking primary navigation
    } finally {
      setNotifLoading(false);
    }
  };

  const handleMarkRead = async (notification: NotificationItem) => {
    try {
      await apiFetch(`/api/v1/notifications/${notification.id}/read`, {
        method: "POST",
      });
      await fetchNotifications();
      const invoiceId = notification.payload?.invoiceId ?? notification.entityId;
      if (notification.entityType === "invoice" && invoiceId) {
        navigate(`/invoices/${invoiceId}`);
        setNotifOpen(false);
      }
    } catch {
      // no-op
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await apiFetch("/api/v1/notifications/read-all", { method: "POST" });
      await fetchNotifications();
    } catch {
      // no-op
    }
  };

  const fetchGlobalSearch = async (q: string) => {
    const query = q.trim();
    if (query.length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    try {
      const res = await apiFetch<{ data: GlobalSearchItem[] }>(
        `/api/v1/search?q=${encodeURIComponent(query)}&limit=4`,
      );
      setSearchResults(res.data ?? []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    void fetchNotifications();
    const handle = setInterval(() => {
      void fetchNotifications();
    }, 60_000);
    return () => clearInterval(handle);
  }, [user]);

  useEffect(() => {
    if (!notifOpen) return;
    const onDocumentClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!notifPanelRef.current?.contains(target)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocumentClick);
    return () => document.removeEventListener("mousedown", onDocumentClick);
  }, [notifOpen]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!searchOpen) return;
    if (query.length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    const handle = setTimeout(() => {
      void fetchGlobalSearch(query);
    }, 250);
    return () => clearTimeout(handle);
  }, [searchQuery, searchOpen]);

  useEffect(() => {
    if (!searchOpen) return;
    const onDocumentClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!searchPanelRef.current?.contains(target)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocumentClick);
    return () => document.removeEventListener("mousedown", onDocumentClick);
  }, [searchOpen]);

  const groups: NavGroup[] = useMemo(
    () => [
      {
        groupLabel: "Menu Utama",
        items: [
          { to: "/dashboard", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
        ]
      },
      {
        groupLabel: "Master Data",
        anyPerm: ["master_data:read"],
        items: [
          { to: "/customers", label: "Pelanggan", icon: <Users className="h-4 w-4" />, anyPerm: ["customers:read"] },
          { to: "/regions", label: "Wilayah", icon: <Building className="h-4 w-4" />, anyPerm: ["customers:read"] },
          { to: "/products", label: "Produk", icon: <Package className="h-4 w-4" />, anyPerm: ["products:read"] },
          { to: "/uoms", label: "Satuan (UOM)", icon: <Ruler className="h-4 w-4" />, anyPerm: ["products:read"] },
          { to: "/promos", label: "Promo & Diskon", icon: <Tag className="h-4 w-4" />, anyPerm: ["products:read", "sales_orders:write"] },
          { to: "/suppliers", label: "Supplier", icon: <Truck className="h-4 w-4" />, anyPerm: ["suppliers:read"] },
        ]
      },
      {
        groupLabel: "Transaksi Gudang",
        items: [
          { to: "/inventory", label: "Inventory", icon: <Boxes className="h-4 w-4" />, anyPerm: ["inventory:read"] },
          { to: "/purchase-orders", label: "Purchase Order", icon: <ClipboardList className="h-4 w-4" />, anyPerm: ["purchasing:read"] },
          { to: "/goods-receipts", label: "Penerimaan (GRN)", icon: <ClipboardList className="h-4 w-4" />, anyPerm: ["purchasing:read"] },
          { to: "/returns", label: "Retur Barang", icon: <RotateCcw className="h-4 w-4" />, anyPerm: ["inventory:write"] },
        ]
      },
      {
        groupLabel: "Transaksi Penjualan",
        items: [
          { to: "/sales-orders", label: "Sales Order", icon: <ShoppingCart className="h-4 w-4" />, anyPerm: ["sales_orders:read"] },
          { to: "/sales-orders/approvals", label: "Approval SO", icon: <ShieldAlert className="h-4 w-4" />, anyPerm: ["sales_orders:approve"] },
          { to: "/delivery-orders", label: "Surat Jalan (DO)", icon: <Truck className="h-4 w-4" />, anyPerm: ["sales_orders:read"] },
        ]
      },
      {
        groupLabel: "Keuangan",
        items: [
          { to: "/invoices", label: "Invoice", icon: <FileText className="h-4 w-4" />, anyPerm: ["invoices:read"], matchMode: "prefix" },
          { to: "/payments", label: "Pembayaran", icon: <Wallet className="h-4 w-4" />, anyPerm: ["payments:read"] },
          { to: "/credit-notes", label: "Note Kredit", icon: <FileText className="h-4 w-4" />, anyPerm: ["invoices:read", "reports:read"] },
          { to: "/receivables", label: "Piutang", icon: <LineChart className="h-4 w-4" />, anyPerm: ["invoices:read", "reports:read"] },
        ]
      },
      {
        groupLabel: "Laporan",
        items: [
          { to: "/store-analysis", label: "Analisa Toko", icon: <Building2 className="h-4 w-4" />, anyPerm: ["reports:read"] },
          { to: "/collection-report", label: "Laporan Pembayaran", icon: <Wallet className="h-4 w-4" />, anyPerm: ["reports:read"] },
          { to: "/sales-report", label: "Laporan Penjualan", icon: <LineChart className="h-4 w-4" />, anyPerm: ["reports:read"] },
          { to: "/purchase-report", label: "Laporan Pembelian", icon: <ClipboardList className="h-4 w-4" />, anyPerm: ["reports:read"] },
          { to: "/stock-report", label: "Laporan Stok", icon: <Boxes className="h-4 w-4" />, anyPerm: ["reports:read"] },
          { to: "/return-report", label: "Laporan Retur", icon: <RotateCcw className="h-4 w-4" />, anyPerm: ["reports:read"] },
          { to: "/profit-loss", label: "Laporan Rugi Laba", icon: <Calculator className="h-4 w-4" />, anyPerm: ["reports:read"] },
          { to: "/promo-report", label: "Laporan Promo & Diskon", icon: <Tag className="h-4 w-4" />, anyPerm: ["reports:read"] },
          { to: "/sales-performance", label: "Kinerja Sales", icon: <LineChart className="h-4 w-4" />, anyPerm: ["reports:read"] },
        ]
      },
      {
        groupLabel: "Pengaturan",
        items: [
          { to: "/change-password", label: "Ganti Password", icon: <KeyRound className="h-4 w-4" /> },
          { to: "/company-settings", label: "Profil Perusahaan", icon: <Building className="h-4 w-4" />, anyPerm: ["users:write"] },
          { to: "/users", label: "Pengguna", icon: <Users className="h-4 w-4" />, anyPerm: ["users:read"] },
          { to: "/roles", label: "Role & Akses", icon: <Shield className="h-4 w-4" />, anyPerm: ["users:write"] },
          { to: "/audit-logs", label: "Audit Log", icon: <ClipboardList className="h-4 w-4" />, anyPerm: ["users:read"] },
        ]
      }
    ],
    [],
  );

  const visibleGroups = useMemo(() => {
    return groups
      .filter(g => !g.anyPerm || hasAnyPermission(g.anyPerm))
      .map(g => ({
        groupLabel: g.groupLabel,
        anyPerm: g.anyPerm,
        items: g.items.filter(i => !i.anyPerm || hasAnyPermission(i.anyPerm))
      }))
      .filter(g => g.items.length > 0);
  }, [groups, hasAnyPermission]);

  return (
    <div className="min-h-dvh bg-zinc-50 text-zinc-900">
      <div className="sticky top-0 z-30 border-b border-zinc-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-screen-2xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <button
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 md:hidden"
              onClick={() => setOpen((v) => !v)}
              aria-label="Menu"
              type="button"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-zinc-900 text-white">
                <span className="text-sm font-semibold">{companyName ? companyName.charAt(0).toUpperCase() : 'E'}</span>
              </div>
              <div className="leading-tight">
                <div className="text-sm font-semibold">{companyName || "ERP System"}</div>
                <div className="text-xs text-zinc-500">Operasional end-to-end</div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative hidden w-[420px] lg:block" ref={searchPanelRef}>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
                <input
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setSearchOpen(true);
                  }}
                  onFocus={() => setSearchOpen(true)}
                  placeholder="Cari customer, produk, SO, invoice..."
                  className="w-full rounded-lg border border-zinc-200 bg-white py-2 pl-9 pr-3 text-sm outline-none ring-zinc-300 transition focus:ring-2"
                />
              </div>
              {searchOpen && (
                <div className="absolute left-0 right-0 z-40 mt-2 rounded-xl border border-zinc-200 bg-white p-2 shadow-xl">
                  {searchQuery.trim().length < 2 ? (
                    <div className="px-2 py-5 text-center text-xs text-zinc-500">
                      Ketik minimal 2 karakter untuk mulai pencarian.
                    </div>
                  ) : searchLoading ? (
                    <div className="px-2 py-5 text-center text-xs text-zinc-500">Mencari...</div>
                  ) : searchResults.length === 0 ? (
                    <div className="px-2 py-5 text-center text-xs text-zinc-500">Tidak ada hasil.</div>
                  ) : (
                    <div className="max-h-80 space-y-1 overflow-auto">
                      {searchResults.map((item) => (
                        <button
                          key={`${item.module}:${item.id}`}
                          className="w-full rounded-lg border border-zinc-200 px-2 py-2 text-left transition hover:bg-zinc-50"
                          onClick={() => {
                            navigate(item.url);
                            setSearchOpen(false);
                          }}
                          type="button"
                        >
                          <div className="text-xs font-semibold text-zinc-900">{item.title}</div>
                          <div className="mt-0.5 text-[11px] text-zinc-500">
                            {item.subtitle}
                            {item.status ? ` • ${item.status}` : ""}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="relative" ref={notifPanelRef}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const next = !notifOpen;
                  setNotifOpen(next);
                  if (next) void fetchNotifications();
                }}
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </Button>
              {notifOpen && (
                <div className="absolute right-0 z-40 mt-2 w-[360px] rounded-xl border border-zinc-200 bg-white p-3 shadow-xl">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-sm font-semibold">Notifikasi</div>
                    <button
                      className="text-xs font-medium text-zinc-600 hover:text-zinc-900"
                      onClick={() => void handleMarkAllRead()}
                      type="button"
                    >
                      Tandai semua dibaca
                    </button>
                  </div>
                  {notifLoading ? (
                    <div className="py-6 text-center text-sm text-zinc-500">Memuat notifikasi...</div>
                  ) : notifications.length === 0 ? (
                    <div className="py-6 text-center text-sm text-zinc-500">Tidak ada notifikasi aktif.</div>
                  ) : (
                    <div className="max-h-80 space-y-2 overflow-auto">
                      {notifications.map((item) => (
                        <button
                          key={item.id}
                          className={cn(
                            "w-full rounded-lg border p-2 text-left transition hover:bg-zinc-50",
                            item.isRead ? "border-zinc-200" : "border-amber-300 bg-amber-50/40"
                          )}
                          onClick={() => void handleMarkRead(item)}
                          type="button"
                        >
                          <div className="text-xs font-semibold text-zinc-900">{item.title}</div>
                          <div className="mt-1 text-xs text-zinc-600">{item.message}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="hidden text-right md:block">
              <div className="text-sm font-medium">{user?.fullName ?? "-"}</div>
              <div className="text-xs text-zinc-500">{user?.role ?? "-"}</div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                try {
                  await apiFetch("/api/v1/auth/logout", { method: "POST" });
                } catch {
                  // ignore logout API failure
                }
                logout();
                navigate("/login");
              }}
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Keluar</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-screen-2xl grid-cols-1 md:grid-cols-[260px_1fr]">
        <aside
          className={cn(
            "border-r border-zinc-200 bg-white md:sticky md:top-14 md:h-[calc(100dvh-56px)]",
            open ? "block" : "hidden md:block",
          )}
        >
          <nav className="p-3">
            <div className="space-y-1">
              {visibleGroups.map((g) => (
                <NavGroupMenu
                  key={g.groupLabel}
                  group={g}
                  currentPath={location.pathname}
                  onItemClick={() => setOpen(false)}
                />
              ))}
            </div>
          </nav>
        </aside>

        <main className="min-w-0 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function NavGroupMenu({
  group,
  currentPath,
  onItemClick,
}: {
  group: NavGroup;
  currentPath: string;
  onItemClick: () => void;
}) {
  const isActiveGroup = group.items.some((i) => currentPath.startsWith(i.to));
  const [isOpen, setIsOpen] = useState(isActiveGroup);

  return (
    <div className="mb-1">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wider text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800"
      >
        <span>{group.groupLabel}</span>
        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
      <div
        className={cn(
          "overflow-hidden transition-all duration-200 ease-in-out",
          isOpen ? "mt-1 max-h-[500px]" : "max-h-0"
        )}
      >
        <div className="space-y-1 pl-2">
          {group.items.map((i) => (
            <NavLink
              key={i.to}
              to={i.to}
              end={i.matchMode !== "prefix"}
              onClick={onItemClick}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition",
                  isActive
                    ? "bg-zinc-900 text-white"
                    : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
                )
              }
            >
              {i.icon}
              <span>{i.label}</span>
            </NavLink>
          ))}
        </div>
      </div>
    </div>
  );
}
