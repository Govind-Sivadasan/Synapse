import { useState } from "react";
import { nodeLabel, nodesExcluding } from "../../lib/nodes";
import { Node } from "../../types/api";
import QuickCreateNodeDialog, { CREATE_NODE_OPTION } from "./QuickCreateNodeDialog";

interface Props {
  label: string;
  value: string;
  onChange: (nodeId: string) => void;
  nodes: Node[];
  nodeType: "source" | "destination";
  required?: boolean;
  emptyHint?: string;
  /** Hide this node from the list (e.g. already selected on the other side). */
  excludeNodeId?: string;
}

export default function NodeSelectField({
  label,
  value,
  onChange,
  nodes,
  nodeType,
  required,
  emptyHint,
  excludeNodeId,
}: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  const options = nodesExcluding(nodes, excludeNodeId);

  return (
    <>
      <div className="form-field">
        <label>{label}</label>
        <select
          value={value}
          onChange={(e) => {
            if (e.target.value === CREATE_NODE_OPTION) {
              setCreateOpen(true);
              return;
            }
            onChange(e.target.value);
          }}
          required={required && !createOpen}
        >
          <option value="">Select {nodeType}…</option>
          {options.map((n) => (
            <option key={n.id} value={n.id}>
              {nodeLabel(n)}
            </option>
          ))}
          <option value={CREATE_NODE_OPTION}>+ Create new node…</option>
        </select>
        {options.length === 0 && emptyHint && <p className="form-field-hint">{emptyHint}</p>}
      </div>

      <QuickCreateNodeDialog
        open={createOpen}
        nodeType={nodeType}
        onClose={() => setCreateOpen(false)}
        onCreated={(node) => onChange(node.id)}
      />
    </>
  );
}
