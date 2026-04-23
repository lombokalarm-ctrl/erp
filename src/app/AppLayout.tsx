import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useMemo, useState } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import { useSettingsStore } from "@/stores/settingsStore";
import Button from "@/components/ui/Button";

type NavItem = {
  to: string;
  label: string;
  icon: React.ReactNode;
  anyPerm?: string[];
};

type NavGroup = {
  groupLabel: string;
  anyPerm?: string[];
  items: NavItem[];
};

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const user = useAuthStore((s) => s.user);
  const hasAnyPermission = useAuthStore((s) => s.hasAnyPermission);
  const logout = useAuthStore((s) => s.logout);
  const companyName = useSettingsStore((s) => s.company?.name);
  const fetchCompany = useSettingsStore((s) => s.fetchCompany);

  useMemo(() => {
    fetchCompany();
  }, [fetchCompany]);

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
          { to: "/delivery-orders", label: "Surat Jalan (DO)", icon: <Truck className="h-4 w-4" />, anyPerm: ["delivery_orders:read"] },
        ]
      },
      {
        groupLabel: "Keuangan",
        items: [
          { to: "/invoices", label: "Invoice", icon: <FileText className="h-4 w-4" />, anyPerm: ["invoices:read"] },
          { to: "/payments", label: "Pembayaran", icon: <Wallet className="h-4 w-4" />, anyPerm: ["payments:read"] },
          { to: "/receivables", label: "Piutang", icon: <LineChart className="h-4 w-4" />, anyPerm: ["invoices:read", "reports:read"] },
        ]
      },
      {
        groupLabel: "Laporan",
        items: [
          { to: "/store-analysis", label: "Analisa Toko", icon: <Building2 className="h-4 w-4" />, anyPerm: ["reports:read"] },
          { to: "/collection-report", label: "Laporan Pembayaran", icon: <Wallet className="h-4 w-4" />, anyPerm: ["reports:read"] },
          { to: "/sales-report", label: "Laporan Penjualan", icon: <LineChart className="h-4 w-4" />, anyPerm: ["reports:read"] },
          { to: "/return-report", label: "Laporan Retur", icon: <RotateCcw className="h-4 w-4" />, anyPerm: ["reports:read"] },
          { to: "/profit-loss", label: "Laporan Rugi Laba", icon: <Calculator className="h-4 w-4" />, anyPerm: ["reports:read"] },
          { to: "/promo-report", label: "Laporan Promo & Diskon", icon: <Tag className="h-4 w-4" />, anyPerm: ["reports:read"] },
          { to: "/sales-performance", label: "Kinerja Sales", icon: <LineChart className="h-4 w-4" />, anyPerm: ["reports:read"] },
        ]
      },
      {
        groupLabel: "Pengaturan",
        items: [
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
            <div className="hidden text-right md:block">
              <div className="text-sm font-medium">{user?.fullName ?? "-"}</div>
              <div className="text-xs text-zinc-500">{user?.role ?? "-"}</div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
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
