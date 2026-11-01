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
import { APP_NAME, IS_SALES_APP } from "./lib/appMode";

document.title = IS_SALES_APP ? "Lotikipi Water — Sales Register" : "Lotikipi Water — Stock Tracker";

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
  if (IS_SALES_APP) return <SalesRoutes />;

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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

function SalesOnlyGate({ children }: { children: JSX.Element }) {
  const { profile, signOutUser } = useAuth();
  if (profile?.role === "management") return children;
  return (
    <div className="centered-page">
      <div className="card">
        <h1>{APP_NAME}</h1>
        <p className="muted">
          The sales register is for management accounts only. Signed in as <strong>{profile?.email}</strong>.
        </p>
        <button onClick={() => signOutUser()}>Sign out</button>
      </div>
    </div>
  );
}

function SalesRoutes() {
  return (
    <SalesOnlyGate>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/sales" element={<Sales />} />
          <Route path="/sales/day/:date" element={<SalesEntry />} />
          <Route path="*" element={<Navigate to="/sales" replace />} />
        </Route>
      </Routes>
    </SalesOnlyGate>
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
