import { useState } from "react";
import { Plus } from "lucide-react";
import { nodeLabel, routingDestinationNodes } from "../../lib/nodes";
import { Node } from "../../types/api";
import Checkbox from "../ui/Checkbox";
import QuickCreateNodeDialog from "./QuickCreateNodeDialog";

interface Props {
  nodes: Node[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export default function DestinationNodePicker({ nodes, selectedIds, onChange }: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  const destinations = routingDestinationNodes(nodes);

  const toggle = (id: string) => {
    onChange(
      selectedIds.includes(id) ? selectedIds.filter((d) => d !== id) : [...selectedIds, id],
    );
  };

  return (
    <>
      <div className="form-field full-width">
        <div className="picker-field-header">
          <label>Destination Nodes</label>
          <button type="button" className="btn-sm btn-secondary" onClick={() => setCreateOpen(true)}>
            <Plus size={14} />
            Create node
          </button>
        </div>
        <div className="checkbox-group">
          {destinations.length === 0 ? (
            <span className="placeholder">No DICOMweb destination nodes configured.</span>
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
