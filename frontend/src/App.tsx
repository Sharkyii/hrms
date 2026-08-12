import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { Employees } from "./pages/Employees";
import { Exceptions } from "./pages/Exceptions";
import { Leave } from "./pages/Leave";
import { Biometric } from "./pages/Biometric";
import { Payroll } from "./pages/Payroll";
import { Kra } from "./pages/Kra";
import { Assets } from "./pages/Assets";
import { Policies } from "./pages/Policies";
import { Queries } from "./pages/Queries";
import { Recruitment } from "./pages/Recruitment";
import { Exit } from "./pages/Exit";
import { Access } from "./pages/Access";
import { Profile } from "./pages/Profile";

function ProtectedLayout() {
  const { session, loading } = useAuth();
  if (loading) return <div className="login-page">Loading...</div>;
  if (!session) return <Navigate to="/login" replace />;
  return <Layout />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/employees" element={<Employees />} />
        <Route path="/exceptions" element={<Exceptions />} />
        <Route path="/leave" element={<Leave />} />
        <Route path="/biometric" element={<Biometric />} />
        <Route path="/payroll" element={<Payroll />} />
        <Route path="/kra" element={<Kra />} />
        <Route path="/assets" element={<Assets />} />
        <Route path="/policies" element={<Policies />} />
        <Route path="/queries" element={<Queries />} />
        <Route path="/recruitment" element={<Recruitment />} />
        <Route path="/exit" element={<Exit />} />
        <Route path="/access" element={<Access />} />
        <Route path="/profile" element={<Profile />} />
      </Route>
    </Routes>
  );
}
