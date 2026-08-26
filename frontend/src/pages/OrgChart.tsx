import { useEffect, useState } from "react";
import { api, ApiError } from "../api";
import type { Employee } from "../auth";
import { Spinner } from "../components/Spinner";
import { useToast } from "../components/Toast";
import { useConfirm } from "../components/ConfirmDialog";
import { Icon } from "../components/Icon";
import { initials } from "../initials";
import { useAuth } from "../auth";

interface OrgNode extends Employee {
  children: OrgNode[];
}

function buildTree(employees: Employee[]): OrgNode[] {
  const nodeMap = new Map<number, OrgNode>();
  const roots: OrgNode[] = [];

  employees.forEach((emp) => {
    nodeMap.set(emp.id, { ...emp, children: [] });
  });

  employees.forEach((emp) => {
    const node = nodeMap.get(emp.id);
    if (node) {
      if (emp.reportingManagerId && nodeMap.has(emp.reportingManagerId)) {
        nodeMap.get(emp.reportingManagerId)?.children.push(node);
      } else {
        roots.push(node);
      }
    }
  });

  return roots;
}

interface AddEmployeeModalProps {
  managerId: number | null;
  onClose: () => void;
  onSuccess: () => void;
  departments: string[];
}

function AddEmployeeModal({ managerId, onClose, onSuccess, departments }: AddEmployeeModalProps) {
  const toast = useToast();
  const [form, setForm] = useState({
    employeeCode: "",
    fullName: "",
    email: "",
    phone: "",
    employeeType: "office_laptop",
    department: departments[0] || "",
    designation: "",
    dateOfJoining: new Date().toISOString().split("T")[0],
  });
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!form.employeeCode.trim() || !form.fullName.trim() || !form.email.trim()) {
      toast.error("Employee code, name, and email are required.");
      return;
    }
    setLoading(true);
    try {
      const payload: any = {
        employeeCode: form.employeeCode,
        fullName: form.fullName,
        email: form.email,
        employeeType: form.employeeType,
        dateOfJoining: form.dateOfJoining,
        ...(form.phone ? { phone: form.phone } : {}),
        ...(form.department ? { department: form.department } : {}),
        ...(form.designation ? { designation: form.designation } : {}),
        ...(managerId ? { reportingManagerId: managerId } : {}),
      };
      await api.post("/employees", payload);
      toast.success("Employee added to org chart.");
      onSuccess();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to add employee");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add Employee</h2>
          <button className="close" onClick={onClose}><Icon name="close" /></button>
        </div>
        <div className="modal-body">
          <div className="form-row">
            <div className="field">
              <label>Employee Code *</label>
              <input value={form.employeeCode} onChange={(e) => setForm({ ...form, employeeCode: e.target.value })} placeholder="e.g., EMP001" />
            </div>
            <div className="field">
              <label>Full Name *</label>
              <input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder="e.g., John Doe" />
            </div>
          </div>
          <div className="form-row">
            <div className="field">
              <label>Email *</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="field">
              <label>Phone</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          <div className="form-row">
            <div className="field">
              <label>Type</label>
              <select value={form.employeeType} onChange={(e) => setForm({ ...form, employeeType: e.target.value })}>
                <option value="office_laptop">Office (Laptop)</option>
                <option value="office_no_laptop">Office (No Laptop)</option>
                <option value="contract">Contract</option>
                <option value="field">Field</option>
                <option value="wfh">Work From Home</option>
                <option value="no_smartphone">No Smartphone</option>
              </select>
            </div>
            <div className="field">
              <label>Department</label>
              <select value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}>
                <option value="">Select department</option>
                {departments.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="field">
              <label>Designation</label>
              <input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
            </div>
            <div className="field">
              <label>Joining Date</label>
              <input type="date" value={form.dateOfJoining} onChange={(e) => setForm({ ...form, dateOfJoining: e.target.value })} />
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn secondary" onClick={onClose} disabled={loading}>Cancel</button>
          <button className="btn" onClick={submit} disabled={loading}>{loading ? "Adding..." : "Add Employee"}</button>
        </div>
      </div>
    </div>
  );
}

const OrgTreeNode = ({ node, canAdd, canRemove, onRefresh, onRemove, departments }: { node: OrgNode; canAdd: boolean; canRemove: boolean; onRefresh: () => void; onRemove: (empId: number, empName: string) => void; departments: string[] }) => {
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div className="org-tree-node">
      <div className="org-card">
        <div className="avatar-chip">{initials(node.fullName)}</div>
        <div className="info">
          <div className="name">{node.fullName}</div>
          <div className="role">{node.designation || "Employee"}</div>
          <div className="dept">{node.department || "General"}</div>
        </div>
        {(canAdd || canRemove) && <div className="org-actions">
          {canAdd && <button title="Add report" onClick={() => setShowAdd(true)} className="icon-btn"><Icon name="add" /></button>}
          {canRemove && <button title="Remove/Offboard" onClick={() => onRemove(node.id, node.fullName)} className="icon-btn danger"><Icon name="delete" /></button>}
        </div>}
      </div>
      {showAdd && (
        <AddEmployeeModal
          managerId={node.id}
          onClose={() => setShowAdd(false)}
          onSuccess={() => {
            setShowAdd(false);
            onRefresh();
          }}
          departments={departments}
        />
      )}
      {node.children.length > 0 && (
        <div className="org-tree-children">
          {node.children.map((child) => (
            <OrgTreeNode key={child.id} node={child} canAdd={canAdd} canRemove={canRemove} onRefresh={onRefresh} onRemove={onRemove} departments={departments} />
          ))}
        </div>
      )}
    </div>
  );
};

export function OrgChart() {
  const { can } = useAuth();
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [showAddRoot, setShowAddRoot] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();
  const canAdd = can("employee.manage");
  const canRemove = can("employee.manage") || can("exit.manage");

  async function load() {
    const data = await api.get<Employee[]>("/employees");
    setEmployees(data.filter((e) => e.status === "active"));
    const depts = [...new Set(data.map((e) => e.department).filter((department): department is string => Boolean(department)))].sort();
    setDepartments(depts);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleRemove(empId: number, empName: string) {
    const ok = await confirm({
      title: "Remove Employee",
      message: `Start offboarding process for ${empName}? They will be moved to the Exit section.`,
      confirmLabel: "Start Offboarding",
    });
    if (!ok) return;
    try {
      await api.post("/exit/requests", {
        employeeId: empId,
        resignationDate: new Date().toISOString().split("T")[0],
        lastWorkingDay: new Date().toISOString().split("T")[0],
        reason: "Offboarding initiated from org chart",
      });
      toast.success(`Offboarding started for ${empName}.`);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to start offboarding");
    }
  }

  const tree = buildTree(employees);

  if (loading) return <div style={{ padding: 40 }}><Spinner /></div>;

  return (
    <div>
      <div className="page-header">
        <h1>Organization Chart</h1>
        {canAdd && <button className="btn" onClick={() => setShowAddRoot(true)}>
          <Icon name="add" /> Add Root Employee
        </button>}
      </div>
      {showAddRoot && (
        <AddEmployeeModal
          managerId={null}
          onClose={() => setShowAddRoot(false)}
          onSuccess={() => {
            setShowAddRoot(false);
            load();
          }}
          departments={departments}
        />
      )}
      <div className="card" style={{ overflowX: "auto", padding: "40px 20px" }}>
        <div className="org-chart-container">
          {tree.length === 0 ? (
            <p className="empty">No employees in organization yet.</p>
          ) : (
            tree.map((root) => (
              <OrgTreeNode
                key={root.id}
                node={root}
                canAdd={canAdd}
                canRemove={canRemove}
                onRefresh={load}
                onRemove={handleRemove}
                departments={departments}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
