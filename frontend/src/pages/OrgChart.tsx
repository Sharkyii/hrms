import { useEffect, useState } from "react";
import { api } from "../api";
import type { Employee } from "../auth";
import { Spinner } from "../components/Spinner";
import { initials } from "../initials";

interface OrgNode extends Employee {
  children: OrgNode[];
}

function buildTree(employees: Employee[]): OrgNode[] {
  const nodeMap = new Map<number, OrgNode>();
  const roots: OrgNode[] = [];

  // Initialize nodes
  employees.forEach((emp) => {
    nodeMap.set(emp.id, { ...emp, children: [] });
  });

  // Build tree
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

const OrgTreeNode = ({ node }: { node: OrgNode }) => {
  return (
    <div className="org-tree-node">
      <div className="org-card">
        <div className="avatar-chip">{initials(node.fullName)}</div>
        <div className="info">
          <div className="name">{node.fullName}</div>
          <div className="role">{node.designation || "Employee"}</div>
          <div className="dept">{node.department || "General"}</div>
        </div>
      </div>
      {node.children.length > 0 && (
        <div className="org-tree-children">
          {node.children.map((child) => (
            <OrgTreeNode key={child.id} node={child} />
          ))}
        </div>
      )}
    </div>
  );
};

export function OrgChart() {
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);

  useEffect(() => {
    api.get<Employee[]>("/employees").then((data) => {
      // Filter out exited employees for the org chart
      setEmployees(data.filter((e) => e.status === "active"));
      setLoading(false);
    });
  }, []);

  const tree = buildTree(employees);

  if (loading) return <div style={{ padding: 40 }}><Spinner /></div>;

  return (
    <div>
      <div className="page-header">
        <h1>Organization Chart</h1>
      </div>
      <div className="card" style={{ overflowX: "auto", padding: "40px 20px" }}>
        <div className="org-chart-container">
          {tree.map((root) => (
            <OrgTreeNode key={root.id} node={root} />
          ))}
        </div>
      </div>
    </div>
  );
}
