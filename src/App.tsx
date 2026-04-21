import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { useEffect } from "react";
import RequireAuth from "@/app/RequireAuth";
import AppLayout from "@/app/AppLayout";
import { useAuthStore } from "@/stores/authStore";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Customers from "@/pages/Customers";
import Products from "@/pages/Products";
import SalesOrders from "@/pages/SalesOrders";
import ApprovalOrders from "@/pages/ApprovalOrders";
import Invoices from "@/pages/Invoices";
import InvoiceDetail from "@/pages/InvoiceDetail";
import Payments from "@/pages/Payments";
import Receivables from "@/pages/Receivables";
import StoreAnalysis from "@/pages/StoreAnalysis";
import ReturnReport from "@/pages/ReturnReport";
import Users from "@/pages/Users";
import Roles from "@/pages/Roles";
import Promos from "@/pages/Promos";
import AuditLogs from "@/pages/AuditLogs";
import CompanySettings from "@/pages/CompanySettings";
import Suppliers from "@/pages/Suppliers";
import Inventory from "@/pages/Inventory";
import PurchaseOrders from "@/pages/PurchaseOrders";
import GoodsReceipts from "@/pages/GoodsReceipts";
import Returns from "@/pages/Returns";
import DeliveryOrders from "@/pages/DeliveryOrders";
import SalesPerformance from "@/pages/SalesPerformance";
import SalesReport from "@/pages/SalesReport";
import CollectionReport from "@/pages/CollectionReport";
import PromoReport from "@/pages/PromoReport";
import ProfitLossReport from "@/pages/ProfitLossReport";

export default function App() {
  const hydrate = useAuthStore((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="customers" element={<Customers />} />
          <Route path="products" element={<Products />} />
          <Route path="suppliers" element={<Suppliers />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="purchase-orders" element={<PurchaseOrders />} />
          <Route path="goods-receipts" element={<GoodsReceipts />} />
          <Route path="returns" element={<Returns />} />
          <Route path="sales-orders" element={<SalesOrders />} />
          <Route path="sales-orders/approvals" element={<ApprovalOrders />} />
          <Route path="delivery-orders" element={<DeliveryOrders />} />
          <Route path="invoices" element={<Invoices />} />
          <Route path="invoices/:id" element={<InvoiceDetail />} />
          <Route path="payments" element={<Payments />} />
          <Route path="receivables" element={<Receivables />} />
          <Route path="store-analysis" element={<StoreAnalysis />} />
          <Route path="users" element={<Users />} />
          <Route path="sales-performance" element={<SalesPerformance />} />
          <Route path="sales-report" element={<SalesReport />} />
          <Route path="return-report" element={<ReturnReport />} />
          <Route path="profit-loss" element={<ProfitLossReport />} />
          <Route path="promo-report" element={<PromoReport />} />
          <Route path="collection-report" element={<CollectionReport />} />
          <Route path="roles" element={<Roles />} />
          <Route path="company-settings" element={<CompanySettings />} />
          <Route path="promos" element={<Promos />} />
          <Route path="audit-logs" element={<AuditLogs />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Router>
  );
}
