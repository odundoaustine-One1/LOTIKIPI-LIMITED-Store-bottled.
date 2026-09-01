import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "./AuthContext";
import type { Role } from "./types";

const NAV_BY_ROLE: Record<Role, { to: string; label: string }[]> = {
  management: [
    { to: "/", label: "Dashboard" },
    { to: "/production", label: "Production" },
    { to: "/history", label: "History" },
    { to: "/audit-log", label: "Audit Log" },
    { to: "/payroll", label: "Payroll" },
  ],
  store: [
    { to: "/", label: "Dashboard" },
    { to: "/entry", label: "Stock Entry" },
    { to: "/production", label: "Production" },
    { to: "/history", label: "History" },
  ],
  production: [
    { to: "/", label: "Dashboard" },
    { to: "/production", label: "Production" },
    { to: "/history", label: "History" },
  ],
};

export default function Layout() {
  const { profile, signOutUser } = useAuth();
  if (!profile) return null;
  const links = NAV_BY_ROLE[profile.role] ?? NAV_BY_ROLE.production;

  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="brand">
          <img
            src="/lotikipi-logo.png"
            alt=""
            className="brand-logo"
            onError={(e) => (e.currentTarget.style.display = "none")}
          />
          <span>Lotikipi Water</span>
        </span>
        <div className="header-right">
          <span className="muted hide-sm">{profile.email}</span>
          <button className="link-btn" onClick={() => signOutUser()}>
            Sign out
          </button>
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
      <nav className="app-nav">
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.to === "/"} className={({ isActive }) => (isActive ? "active" : "")}>
            {l.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
