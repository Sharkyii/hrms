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

// Calculate node positions for tree layout with better spacing
function calculatePositions(nodes: OrgNode[], x = 50, y = 50, xGap = 280, yGap = 180): Map<number, NodePosition> {
  const positions = new Map<number, NodePosition>();
  const cardWidth = 160;

  function getTreeWidth(node: OrgNode, xGap: number): number {
    if (node.children.length === 0) return cardWidth;
    const childrenWidth = node.children.reduce((sum, child) => sum + getTreeWidth(child, xGap * 0.85), 0);
    return Math.max(cardWidth, childrenWidth + (node.children.length - 1) * (xGap * 0.3));
  }

  function traverse(node: OrgNode, centerX: number, y: number, xGap: number) {
    positions.set(node.id, { x: centerX - cardWidth / 2, y });

    if (node.children.length > 0) {
      const totalChildWidth = node.children.reduce((sum, child) => sum + getTreeWidth(child, xGap * 0.85), 0);
      const spacing = xGap * 0.4;
      const totalSpacing = spacing * (node.children.length - 1);
      const totalWidth = totalChildWidth + totalSpacing;
      const startX = centerX - totalWidth / 2;

      let currentX = startX;
      node.children.forEach((child) => {
        const childTreeWidth = getTreeWidth(child, xGap * 0.85);
        const childCenterX = currentX + childTreeWidth / 2;
        traverse(child, childCenterX, y + yGap, xGap * 0.85);
        currentX += childTreeWidth + spacing;
      });
    }
  }

  nodes.forEach((root, i) => {
    const rootTreeWidth = getTreeWidth(root, xGap);
    const startX = x + i * (rootTreeWidth + 100);
    traverse(root, startX + rootTreeWidth / 2, y, xGap);
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
  onDrag: (empId: number, newPos: NodePosition) => void;
  customPositions?: Map<number, NodePosition>;
}

const OrgCard = ({ node, position, canAdd, canRemove, onAdd, onRemove, onDrag, customPositions }: OrgCardProps) => {
  const [isDraggingCard, setIsDraggingCard] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const actualPos = customPositions?.get(node.id) || position;

  const handleCardMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    setIsDraggingCard(true);
    setDragOffset({
      x: e.clientX - actualPos.x,
      y: e.clientY - actualPos.y,
    });
  };

  const handleCardMouseMove = (e: React.MouseEvent) => {
    if (isDraggingCard) {
      onDrag(node.id, {
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y,
      });
    }
  };

  const handleCardMouseUp = () => {
    setIsDraggingCard(false);
  };

  return (
    <div
      className="org-card-absolute"
      style={{
        left: `${actualPos.x}px`,
        top: `${actualPos.y}px`,
        cursor: isDraggingCard ? "grabbing" : "grab",
      }}
      onMouseDown={handleCardMouseDown}
      onMouseMove={handleCardMouseMove}
      onMouseUp={handleCardMouseUp}
      onMouseLeave={handleCardMouseUp}
    >
      <div className="org-card" style={{ pointerEvents: "auto" }}>
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
function renderNodes(
  node: OrgNode,
  positions: Map<number, NodePosition>,
  canAdd: boolean,
  canRemove: boolean,
  onAdd: (id: number) => void,
  onRemove: (id: number, name: string) => void,
  onDrag: (id: number, pos: NodePosition) => void,
  customPositions?: Map<number, NodePosition>
): React.ReactNode[] {
  const elements: React.ReactNode[] = [];
  const pos = positions.get(node.id);
  if (pos) {
    elements.push(
      <OrgCard
        key={node.id}
        node={node}
        position={pos}
        canAdd={canAdd}
        canRemove={canRemove}
        onAdd={onAdd}
        onRemove={onRemove}
        onDrag={onDrag}
        customPositions={customPositions}
      />
    );
  }
  node.children.forEach((child) => {
    elements.push(...renderNodes(child, positions, canAdd, canRemove, onAdd, onRemove, onDrag, customPositions));
  });
  return elements;
}

// Draw SVG lines connecting parent to children
function renderConnections(
  node: OrgNode,
  positions: Map<number, NodePosition>,
  customPositions?: Map<number, NodePosition>
): React.ReactNode[] {
  const elements: React.ReactNode[] = [];

  // Use custom position if available, otherwise use calculated position
  const parentPos = customPositions?.get(node.id) || positions.get(node.id);

  if (parentPos && node.children.length > 0) {
    node.children.forEach((child) => {
      const childPos = customPositions?.get(child.id) || positions.get(child.id);
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
    elements.push(...renderConnections(child, positions, customPositions));
  });

  return elements;
}

export function OrgChart() {
  const { can } = useAuth();
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [selectedDept, setSelectedDept] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [customPositions, setCustomPositions] = useState<Map<number, NodePosition>>(new Map());
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

  // Filter employees by selected department
  const filteredEmployees = selectedDept
    ? employees.filter((e) => e.department === selectedDept)
    : employees;

  const tree = buildTree(filteredEmployees);
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

  const handleDrag = (empId: number, newPos: NodePosition) => {
    const newCustomPositions = new Map(customPositions);
    newCustomPositions.set(empId, newPos);
    setCustomPositions(newCustomPositions);
  };

  const nodes = tree.flatMap((root) =>
    renderNodes(root, positions, canAdd, canRemove, handleAdd, handleRemove, handleDrag, customPositions)
  );
  const connections = tree.flatMap((root) => renderConnections(root, positions, customPositions.size > 0 ? customPositions : undefined));

  return (
    <div>
      <div className="page-header">
        <h1>Organization Chart{selectedDept && ` — ${selectedDept}`}</h1>
        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          <select
            value={selectedDept || ""}
            onChange={(e) => {
              setSelectedDept(e.target.value || null);
              setZoom(1);
              setPan({ x: 0, y: 0 });
              setCustomPositions(new Map());
            }}
            style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--border)", fontSize: "14px" }}
          >
            <option value="">All Teams</option>
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <button className="btn secondary" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); setCustomPositions(new Map()); }}>Reset</button>
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
