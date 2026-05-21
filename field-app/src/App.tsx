import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import FieldLayout from "@/app/FieldLayout";
import RequireAuth from "@/app/RequireAuth";
import { useAuthStore } from "@/stores/authStore";
import LoginPage from "@/pages/LoginPage";
import HomePage from "@/pages/HomePage";
import CustomersPage from "@/pages/CustomersPage";
import CustomerDetailPage from "@/pages/CustomerDetailPage";
import SalesOrderPage from "@/pages/SalesOrderPage";
import DeliveriesPage from "@/pages/DeliveriesPage";
import VisitsPage from "@/pages/VisitsPage";
import ReceivablesPage from "@/pages/ReceivablesPage";
import SyncPage from "@/pages/SyncPage";
import { useFieldStore } from "@/stores/fieldStore";

export default function App() {
  const hydrate = useAuthStore((state) => state.hydrate);
  const hydrateDrafts = useFieldStore((state) => state.hydrate);

  useEffect(() => {
    hydrate();
    hydrateDrafts();
  }, [hydrate, hydrateDrafts]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <FieldLayout />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="/home" replace />} />
          <Route path="home" element={<HomePage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="customers/:customerId" element={<CustomerDetailPage />} />
          <Route path="sales-order/new" element={<SalesOrderPage />} />
          <Route path="deliveries" element={<DeliveriesPage />} />
          <Route path="visits" element={<VisitsPage />} />
          <Route path="receivables/:customerId" element={<ReceivablesPage />} />
          <Route path="sync" element={<SyncPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
