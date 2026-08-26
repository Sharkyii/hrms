import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { Icon } from "./Icon";
import { initials } from "../initials";

interface NavItem {
  to: string;
  label: string;
  icon: Parameters<typeof Icon>[0]["name"];
  show: boolean;
}

export function Layout() {
  const { session, employee, can, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const items: NavItem[] = [
    { to: "/", label: "Dashboard", icon: "dashboard", show: true },
    { to: "/employees", label: "Employees", icon: "employees", show: true },
    { to: "/org-chart", label: "Org Chart", icon: "employees", show: true },
    { to: "/attendance", label: "Attendance", icon: "attendance", show: true },
    { to: "/exceptions", label: "Exceptions", icon: "exceptions", show: can("attendance.approve_team") },
    { to: "/leave", label: "Leave", icon: "leave", show: true },
    { to: "/biometric", label: "Biometric Import", icon: "biometric", show: can("biometric.import") },
    { to: "/payroll", label: "Payroll", icon: "payroll", show: true },
    { to: "/kra", label: "Performance", icon: "kra", show: true },
    { to: "/assets", label: "Assets", icon: "assets", show: true },
    { to: "/policies", label: "Policies", icon: "policies", show: true },
    { to: "/queries", label: "Queries", icon: "queries", show: true },
    { to: "/retailer-visits", label: "Retailer Visits", icon: "attendance", show: true },
    { to: "/exit", label: "Exit", icon: "exit", show: true },
    { to: "/access", label: "Access & Roles", icon: "access", show: can("employee.manage") },
  ];

  const sidebarContent = (
    <>
      <div className="brand">
        <span className="mark">H</span>
        <h1>HRMS</h1>
      </div>
      <nav>
        {items.filter((i) => i.show).map((i) => (
          <NavLink key={i.to} to={i.to} end={i.to === "/"} className={({ isActive }) => (isActive ? "active" : "")} onClick={() => setOpen(false)}>
            <Icon name={i.icon} />
            {i.label}
          </NavLink>
        ))}
      </nav>
      <div className="footer">
        <NavLink to="/profile" className="user-row" style={{ textDecoration: "none" }} onClick={() => setOpen(false)}>
          <span className="avatar">{initials(employee?.fullName)}</span>
          <div>
            <div className="name">{employee?.fullName}</div>
            <div className="role">{session?.role}</div>
          </div>
        </NavLink>
        <div className="footer-actions">
          <button
            className="btn secondary"
            onClick={async () => {
              await logout();
              navigate("/login");
            }}
          >
            <Icon name="logout" /> Log out
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="app-shell">
      <div className="topbar">
        <button aria-label="Menu" onClick={() => setOpen((o) => !o)}>
          <Icon name={open ? "close" : "menu"} />
        </button>
        <strong>HRMS</strong>
        <span className="avatar">{initials(employee?.fullName)}</span>
      </div>
      <nav className={`sidebar ${open ? "open" : ""}`}>{sidebarContent}</nav>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
