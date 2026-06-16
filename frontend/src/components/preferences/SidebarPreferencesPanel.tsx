import { useMemo, useState } from "react";
import { GripVertical, LayoutList, Plus, RotateCcw, Trash2 } from "lucide-react";
import {
  SidebarSectionConfig,
  UserPreferences,
  defaultSidebarConfig,
  getNavCatalog,
} from "../../config/userPreferences";
import { dropPosition, moveItemById, moveValue } from "../../lib/reorder";
import AutoDismissAlert from "../ui/AutoDismissAlert";

interface Props {
  roles: string[];
  prefs: UserPreferences;
  onChange: (updater: UserPreferences | ((prev: UserPreferences) => UserPreferences)) => void;
}

type DragKind = "section" | "path";

interface DragState {
  kind: DragKind;
  sectionId: string;
  path?: string;
}

interface DropHint {
  kind: DragKind;
  sectionId: string;
  position: "before" | "after";
  path?: string;
}

function newSectionId() {
  return `section-${Date.now().toString(36)}`;
}

function sectionCatalogItems(section: SidebarSectionConfig, catalog: ReturnType<typeof getNavCatalog>) {
  const assigned = section.paths
    .map((path) => catalog.find((item) => item.path === path))
    .filter(Boolean) as ReturnType<typeof getNavCatalog>;
  const unassigned = catalog.filter((item) => !section.paths.includes(item.path));
  return [...assigned, ...unassigned];
}

export default function SidebarPreferencesPanel({ roles, prefs, onChange }: Props) {
  const [message, setMessage] = useState("");
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dropHint, setDropHint] = useState<DropHint | null>(null);

  const catalog = useMemo(
    () => getNavCatalog().filter((item) => item.roles.some((r) => roles.includes(r))),
    [roles],
  );

  const sections = prefs.sidebarSections ?? defaultSidebarConfig();

  const updateSections = (next: SidebarSectionConfig[]) => {
    onChange((prev) => ({ ...prev, sidebarSections: next }));
    setMessage("Navigation layout updated.");
  };

  const addSection = () => {
    updateSections([...sections, { id: newSectionId(), label: "New group", paths: [] }]);
  };

  const removeSection = (id: string) => {
    if (sections.length <= 1) return;
    updateSections(sections.filter((s) => s.id !== id));
  };

  const updateSectionLabel = (id: string, label: string) => {
    updateSections(sections.map((s) => (s.id === id ? { ...s, label } : s)));
  };

  const togglePath = (sectionId: string, path: string) => {
    const inSection = sections.find((s) => s.id === sectionId)?.paths.includes(path);
    const next = sections.map((s) => {
      if (s.id === sectionId) {
        const paths = inSection ? s.paths.filter((p) => p !== path) : [...s.paths, path];
        return { ...s, paths };
      }
      return { ...s, paths: s.paths.filter((p) => p !== path) };
    });
    updateSections(next);
  };

  const resetSidebar = () => {
    onChange((prev) => ({ ...prev, sidebarSections: null }));
    setMessage("Navigation reset to default groups.");
  };

  const clearDrag = () => {
    setDragState(null);
    setDropHint(null);
  };

  const moveSection = (fromId: string, toId: string, position: "before" | "after") => {
    updateSections(moveItemById(sections, fromId, toId, position));
  };

  const movePath = (
    sectionId: string,
    fromPath: string,
    toPath: string,
    position: "before" | "after",
  ) => {
    updateSections(
      sections.map((section) => {
        if (section.id !== sectionId) return section;
        return { ...section, paths: moveValue(section.paths, fromPath, toPath, position) };
      }),
    );
  };

  const sectionDropClass = (sectionId: string) => {
    if (!dropHint || dropHint.kind !== "section" || dropHint.sectionId !== sectionId) return "";
    return dropHint.position === "before"
      ? " prefs-section-block--drop-before"
      : " prefs-section-block--drop-after";
  };

  const chipDropClass = (sectionId: string, path: string) => {
    if (!dropHint || dropHint.kind !== "path" || dropHint.sectionId !== sectionId || dropHint.path !== path) {
      return "";
    }
    return dropHint.position === "before" ? " prefs-item-chip--drop-before" : " prefs-item-chip--drop-after";
  };

  return (
    <div className="prefs-panel">
      {message && (
        <AutoDismissAlert variant="success" onDismiss={() => setMessage("")}>
          {message}
        </AutoDismissAlert>
      )}

      <div className="prefs-card-header">
        <LayoutList size={18} />
        <div className="prefs-card-header-text">
          <h3 className="account-section-title">Sidebar groups</h3>
          <p className="account-section-desc">
            Drag groups to reorder the sidebar. Assign pages with checkboxes — checking a page in one group
            moves it out of any other group. Drag assigned pages to reorder within a group.
          </p>
        </div>
        <div className="prefs-card-actions">
          <button type="button" className="btn-sm btn-secondary" onClick={addSection}>
            <Plus size={14} />
            Add group
          </button>
          <button type="button" className="btn-sm btn-secondary" onClick={resetSidebar}>
            <RotateCcw size={14} />
            Reset layout
          </button>
        </div>
      </div>

      <div className="prefs-sections">
        {sections.map((section) => (
          <div
            key={section.id}
            className={`prefs-section-block${
              dragState?.kind === "section" && dragState.sectionId === section.id
                ? " prefs-section-block--dragging"
                : ""
            }${sectionDropClass(section.id)}`}
            onDragOver={(event) => {
              if (dragState?.kind !== "section") return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              setDropHint({
                kind: "section",
                sectionId: section.id,
                position: dropPosition(event, event.currentTarget),
              });
            }}
            onDrop={(event) => {
              if (dragState?.kind !== "section" || !dropHint || dropHint.kind !== "section") return;
              event.preventDefault();
              moveSection(dragState.sectionId, section.id, dropHint.position);
              clearDrag();
            }}
          >
            <div className="prefs-section-head">
              <button
                type="button"
                className="prefs-section-drag-handle"
                draggable
                aria-label={`Drag to reorder ${section.label}`}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", section.id);
                  setDragState({ kind: "section", sectionId: section.id });
                }}
                onDragEnd={clearDrag}
              >
                <GripVertical size={16} />
              </button>
              <input
                className="prefs-section-label-input"
                value={section.label}
                onChange={(e) => updateSectionLabel(section.id, e.target.value)}
                aria-label="Group name"
              />
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => removeSection(section.id)}
                disabled={sections.length <= 1}
                aria-label="Remove group"
              >
                <Trash2 size={14} />
              </button>
            </div>
            <div className="prefs-item-grid">
              {sectionCatalogItems(section, catalog).map((item) => {
                const checked = section.paths.includes(item.path);
                const owner = sections.find((s) => s.paths.includes(item.path));
                const inOther = owner && owner.id !== section.id;
                const draggable = checked && !inOther;
                return (
                  <label
                    key={`${section.id}-${item.path}`}
                    className={`prefs-item-chip${checked ? " prefs-item-chip--on" : ""}${
                      inOther ? " prefs-item-chip--elsewhere" : ""
                    }${draggable ? " prefs-item-chip--draggable" : ""}${chipDropClass(section.id, item.path)}`}
                    title={inOther ? `Currently in “${owner?.label}” — click to move here` : undefined}
                    draggable={draggable}
                    onDragStart={(event) => {
                      if (!draggable) {
                        event.preventDefault();
                        return;
                      }
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", item.path);
                      setDragState({ kind: "path", sectionId: section.id, path: item.path });
                    }}
                    onDragEnd={clearDrag}
                    onDragOver={(event) => {
                      if (dragState?.kind !== "path" || dragState.sectionId !== section.id || !checked) {
                        return;
                      }
                      event.preventDefault();
                      event.stopPropagation();
                      event.dataTransfer.dropEffect = "move";
                      setDropHint({
                        kind: "path",
                        sectionId: section.id,
                        path: item.path,
                        position: dropPosition(event, event.currentTarget),
                      });
                    }}
                    onDrop={(event) => {
                      if (
                        dragState?.kind !== "path" ||
                        dragState.sectionId !== section.id ||
                        !dragState.path ||
                        !dropHint ||
                        dropHint.kind !== "path" ||
                        dropHint.sectionId !== section.id
                      ) {
                        return;
                      }
                      event.preventDefault();
                      event.stopPropagation();
                      movePath(section.id, dragState.path, item.path, dropHint.position);
                      clearDrag();
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => togglePath(section.id, item.path)}
                      onClick={(event) => event.stopPropagation()}
                    />
                    {item.label}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
