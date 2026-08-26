import { useEffect, useState, useRef } from "react";
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

interface NodePosition {
  x: number;
  y: number;
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

// Calculate node positions for tree layout
function calculatePositions(nodes: OrgNode[], x = 0, y = 0, xGap = 200, yGap = 150): Map<number, NodePosition> {
  const positions = new Map<number, NodePosition>();

  function traverse(node: OrgNode, x: number, y: number, xGap: number) {
    positions.set(node.id, { x, y });

    if (node.children.length > 0) {
      const childWidth = xGap * node.children.length;
      const startX = x - childWidth / 2 + xGap / 2;
      node.children.forEach((child, i) => {
        traverse(child, startX + i * xGap, y + yGap, xGap * 0.8);
      });
    }
  }

  nodes.forEach((root, i) => {
    traverse(root, x + i * 400, y, xGap);
  });

  return positions;
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

interface OrgCardProps {
  node: OrgNode;
  position: NodePosition;
  canAdd: boolean;
  canRemove: boolean;
  onAdd: (managerId: number) => void;
  onRemove: (empId: number, empName: string) => void;
}

const OrgCard = ({ node, position, canAdd, canRemove, onAdd, onRemove }: OrgCardProps) => {
  return (
    <div
      className="org-card-absolute"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
    >
      <div className="org-card">
        <div className="avatar-chip">{initials(node.fullName)}</div>
        <div className="info">
          <div className="name">{node.fullName}</div>
          <div className="role">{node.designation || "Employee"}</div>
          <div className="dept">{node.department || "General"}</div>
        </div>
        {(canAdd || canRemove) && <div className="org-actions">
          {canAdd && <button title="Add report" onClick={() => onAdd(node.id)} className="icon-btn add"><Icon name="add" /></button>}
          {canRemove && <button title="Offboard" onClick={() => onRemove(node.id, node.fullName)} className="icon-btn danger"><Icon name="delete" /></button>}
        </div>}
      </div>
    </div>
  );
};

// Render all nodes recursively
function renderNodes(node: OrgNode, positions: Map<number, NodePosition>, canAdd: boolean, canRemove: boolean, onAdd: (id: number) => void, onRemove: (id: number, name: string) => void): React.ReactNode[] {
  const elements: React.ReactNode[] = [];
  const pos = positions.get(node.id);
  if (pos) {
    elements.push(
      <OrgCard key={node.id} node={node} position={pos} canAdd={canAdd} canRemove={canRemove} onAdd={onAdd} onRemove={onRemove} />
    );
  }
  node.children.forEach((child) => {
    elements.push(...renderNodes(child, positions, canAdd, canRemove, onAdd, onRemove));
  });
  return elements;
}

// Draw SVG lines connecting parent to children
function renderConnections(node: OrgNode, positions: Map<number, NodePosition>): React.ReactNode[] {
  const elements: React.ReactNode[] = [];
  const parentPos = positions.get(node.id);

  if (parentPos && node.children.length > 0) {
    node.children.forEach((child) => {
      const childPos = positions.get(child.id);
      if (childPos) {
        const parentCenterX = parentPos.x + 80;
        const parentBottomY = parentPos.y + 110;
        const childCenterX = childPos.x + 80;
        const childTopY = childPos.y;

        elements.push(
          <line key={`line-${node.id}-${child.id}`} x1={parentCenterX} y1={parentBottomY} x2={childCenterX} y2={childTopY} className="org-connection" />
        );
      }
    });
  }

  node.children.forEach((child) => {
    elements.push(...renderConnections(child, positions));
  });

  return elements;
}

export function OrgChart() {
  const { can } = useAuth();
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [showAddModal, setShowAddModal] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

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

  const tree = buildTree(employees);
  const positions = calculatePositions(tree);

  async function handleAdd(managerId: number) {
    setShowAddModal(managerId);
  }

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

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((z) => Math.max(0.5, Math.min(2.5, z * factor)));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 2 || e.ctrlKey) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  if (loading) return <div style={{ padding: 40 }}><Spinner /></div>;

  // Calculate bounding box for SVG
  let minX = 0, maxX = 0, minY = 0, maxY = 0;
  positions.forEach(({ x, y }) => {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x + 160);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y + 110);
  });

  const svgWidth = maxX - minX + 100;
  const svgHeight = maxY - minY + 100;

  const nodes = tree.flatMap((root) => renderNodes(root, positions, canAdd, canRemove, handleAdd, handleRemove));
  const connections = tree.flatMap((root) => renderConnections(root, positions));

  return (
    <div>
      <div className="page-header">
        <h1>Organization Chart</h1>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button className="btn secondary" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>Reset</button>
          <span style={{ fontSize: "12px", color: "var(--muted)" }}>Zoom: {(zoom * 100).toFixed(0)}%</span>
          {canAdd && <button className="btn" onClick={() => setShowAddModal(null)}>
            <Icon name="add" /> Add Root
          </button>}
        </div>
      </div>

      {showAddModal !== null && (
        <AddEmployeeModal
          managerId={showAddModal === null ? null : showAddModal}
          onClose={() => setShowAddModal(null)}
          onSuccess={() => {
            setShowAddModal(null);
            load();
          }}
          departments={departments}
        />
      )}

      <div className="card" style={{ padding: 0, height: "600px", position: "relative", overflow: "hidden" }}>
        <div
          ref={containerRef}
          className="org-canvas"
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{
            width: "100%",
            height: "100%",
            overflow: "hidden",
            cursor: isDragging ? "grabbing" : "grab",
            position: "relative",
          }}
        >
          <div
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "top left",
              position: "absolute",
              left: 0,
              top: 0,
            }}
          >
            <svg
              width={svgWidth}
              height={svgHeight}
              style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}
            >
              {connections}
            </svg>
            {nodes.map((node) => node)}
          </div>

          <div style={{ position: "absolute", bottom: "10px", left: "10px", fontSize: "11px", color: "var(--muted)", pointerEvents: "none" }}>
            Scroll to zoom • Ctrl+Drag to pan
          </div>
        </div>
      </div>
    </div>
  );
}
