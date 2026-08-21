import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError } from "./api";

export interface Session {
  sub: number;
  employeeId: number;
  role: "founder" | "hr" | "manager" | "employee";
  perms: string[];
}

export interface Employee {
  id: number;
  employeeCode: string;
  fullName: string;
  email: string;
  phone: string | null;
  employeeType: string;
  department: string | null;
  designation: string | null;
  category: string | null;
  reportingManagerId: number | null;
  dateOfJoining: string;
  confirmationDate: string | null;
  status: string;
}

interface AuthState {
  session: Session | null;
  employee: Employee | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  can: (...keys: string[]) => boolean;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const me = await api.get<{ session: Session; employee: Employee }>("/auth/me");
      setSession(me.session);
      setEmployee(me.employee);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setSession(null);
        setEmployee(null);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function login(email: string, password: string) {
    await api.post("/auth/login", { email, password });
    await refresh();
  }

  async function logout() {
    await api.post("/auth/logout");
    setSession(null);
    setEmployee(null);
  }

  function can(...keys: string[]) {
    if (!session) return false;
    return keys.every((k) => session.perms.includes(k));
  }

  return (
    <AuthContext.Provider value={{ session, employee, loading, login, logout, can, refresh }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
