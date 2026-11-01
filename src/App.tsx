import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthContext";
import Layout from "./Layout";
import Login from "./pages/Login";
import NoAccess from "./pages/NoAccess";
import Dashboard from "./pages/Dashboard";
import Production from "./pages/Production";
import StockEntry from "./pages/StockEntry";
import History from "./pages/History";
import AuditLog from "./pages/AuditLog";
import Payroll from "./pages/Payroll";
import Sales from "./pages/Sales";
import SalesEntry from "./pages/SalesEntry";
import type { Role } from "./types";

function RequireRole({ allow, children }: { allow: Role[]; children: JSX.Element }) {
  const { profile } = useAuth();
  if (!profile) return null;
  if (!allow.includes(profile.role)) return <Navigate to="/" replace />;
  return children;
}

function Gate() {
  const { status } = useAuth();

  if (status === "loading") {
    return (
      <div className="centered-page">
        <p className="muted">Loading…</p>
      </div>
    );
  }
  if (status === "signed-out") return <Login />;
  if (status === "no-profile") return <NoAccess />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/production" element={<Production />} />
        <Route path="/history" element={<History />} />
        <Route
          path="/entry"
          element={
            <RequireRole allow={["store"]}>
              <StockEntry />
            </RequireRole>
          }
        />
        <Route
          path="/audit-log"
          element={
            <RequireRole allow={["management"]}>
              <AuditLog />
            </RequireRole>
          }
        />
        <Route
          path="/payroll"
          element={
            <RequireRole allow={["management"]}>
              <Payroll />
            </RequireRole>
          }
        />
        <Route
          path="/sales"
          element={
            <RequireRole allow={["management"]}>
              <Sales />
            </RequireRole>
          }
        />
        <Route
          path="/sales/day/:date"
          element={
            <RequireRole allow={["management"]}>
              <SalesEntry />
            </RequireRole>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </BrowserRouter>
  );
}
