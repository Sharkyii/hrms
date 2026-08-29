import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { api } from "../api";
import { Icon } from "./Icon";
import { initials } from "../initials";

interface NavItem {
  to: string;
  label: string;
  icon: Parameters<typeof Icon>[0]["name"];
  show: boolean;
  count?: number;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

interface ApprovalCounts {
  pendingLeaveRequests: number;
  pendingAttendanceExceptions: number;
}

export function Layout() {
  const { session, employee, can, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState<ApprovalCounts | null>(null);

  useEffect(() => {
    if (can("analytics.view_all")) {
      api
        .get<{ approvals: ApprovalCounts }>("/analytics/overview")
        .then((d) => setCounts(d.approvals))
        .catch(() => {});
    } else if (can("attendance.view_team")) {
      api
        .get<{ approvals: ApprovalCounts }>("/analytics/team-overview")
        .then((d) => setCounts(d.approvals))
        .catch(() => {});
    }
  }, []);

  const groups: NavGroup[] = [
    {
      label: "Overview",
      items: [
        { to: "/", label: "Dashboard", icon: "dashboard", show: true },
        { to: "/employees", label: "Employees", icon: "employees", show: true },
        { to: "/org-chart", label: "Org Chart", icon: "employees", show: true },
      ],
    },
    {
      label: "Time & Leave",
      items: [
        { to: "/attendance", label: "Attendance", icon: "attendance", show: true },
        { to: "/exceptions", label: "Exceptions", icon: "exceptions", show: can("attendance.approve_team"), count: counts?.pendingAttendanceExceptions },
        { to: "/leave", label: "Leave", icon: "leave", show: true, count: counts?.pendingLeaveRequests },
        { to: "/biometric", label: "Biometric Import", icon: "biometric", show: can("biometric.import") },
        { to: "/retailer-visits", label: "Retailer Visits", icon: "attendance", show: true },
      ],
    },
    {
      label: "Performance & Pay",
      items: [
        { to: "/payroll", label: "Payroll", icon: "payroll", show: true },
        { to: "/kra", label: "Performance", icon: "kra", show: true },
      ],
    },
    {
      label: "Administration",
      items: [
        { to: "/assets", label: "Assets", icon: "assets", show: true },
        { to: "/policies", label: "Policies", icon: "policies", show: true },
        { to: "/queries", label: "Queries", icon: "queries", show: true },
        { to: "/exit", label: "Exit", icon: "exit", show: true },
        { to: "/access", label: "Access & Roles", icon: "access", show: can("employee.manage") },
      ],
    },
  ];

  const sidebarContent = (
    <>
      <div className="brand">
        <span className="mark">H</span>
        <h1>HRMS</h1>
      </div>
      <nav>
        {groups.map((group) => {
          const visible = group.items.filter((i) => i.show);
          if (visible.length === 0) return null;
          return (
            <div className="nav-group" key={group.label}>
              <div className="nav-group-label">{group.label}</div>
              {visible.map((i) => (
                <NavLink key={i.to} to={i.to} end={i.to === "/"} className={({ isActive }) => (isActive ? "active" : "")} onClick={() => setOpen(false)}>
                  <Icon name={i.icon} />
                  {i.label}
                  {!!i.count && <span className="nav-count">{i.count}</span>}
                </NavLink>
              ))}
            </div>
          );
        })}
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
