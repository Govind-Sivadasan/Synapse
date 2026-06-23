import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { migrationDestinationNodes, nodeLabel, nodesExcluding, routingDestinationNodes } from "../../lib/nodes";
import { Node } from "../../types/api";
import Checkbox from "../ui/Checkbox";
import QuickCreateNodeDialog from "./QuickCreateNodeDialog";

interface Props {
  nodes: Node[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  /** Use migration-eligible destinations instead of routing destinations. */
  variant?: "routing" | "migration";
  /** Omit nodes already chosen elsewhere (e.g. migration source). */
  excludeNodeIds?: string[];
}

export default function DestinationNodePicker({
  nodes,
  selectedIds,
  onChange,
  variant = "routing",
  excludeNodeIds = [],
}: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  const destinations = useMemo(() => {
    const eligible =
      variant === "migration" ? migrationDestinationNodes(nodes) : routingDestinationNodes(nodes);
    return nodesExcluding(eligible, ...excludeNodeIds);
  }, [nodes, variant, excludeNodeIds]);

  const toggle = (id: string) => {
    onChange(
      selectedIds.includes(id) ? selectedIds.filter((d) => d !== id) : [...selectedIds, id],
    );
  };

  return (
    <>
      <div className="form-field full-width">
        <div className="picker-field-header">
          <label>{variant === "migration" ? "Destination PACS" : "Destination Nodes"}</label>
          <button type="button" className="btn-sm btn-secondary" onClick={() => setCreateOpen(true)}>
            <Plus size={14} />
            Create node
          </button>
        </div>
        <div className="checkbox-group">
          {destinations.length === 0 ? (
            <span className="placeholder">
              {variant === "migration"
                ? "No active destination nodes with a DICOMweb URL."
                : "No DICOMweb destination nodes configured."}
            </span>
          ) : (
            destinations.map((n) => (
              <Checkbox
                key={n.id}
                checked={selectedIds.includes(n.id)}
                onChange={() => toggle(n.id)}
                label={nodeLabel(n)}
              />
            ))
          )}
        </div>
        {variant === "migration" && selectedIds.length > 1 && (
          <p className="form-field-hint">
            Creates one migration job per destination (#1, #2, …). Only the first job starts immediately.
          </p>
        )}
      </div>

      <QuickCreateNodeDialog
        open={createOpen}
        nodeType="destination"
        onClose={() => setCreateOpen(false)}
        onCreated={(node) => {
          onChange([...selectedIds, node.id]);
        }}
      />
    </>
  );
}
