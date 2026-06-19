import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Server } from "lucide-react";
import { apiFetch } from "../../api/client";
import Modal from "../Modal";
import StatusBadge from "../ui/StatusBadge";
import { WsEvent } from "../../hooks/useWebSocket";
import {
  ChartDataPoint,
  Node,
  RoutingRule,
  RoutingTransaction,
} from "../../types/api";

const MODALITY_COLORS = ["#0d9488", "#7c3aed", "#d97706", "#2563eb", "#e11d48", "#059669"];
const ROUTING_WS_EVENTS = new Set(["study_received", "routing_completed"]);

/** Preview row count per sidecar section (full lists open in modal). */
export const SIDECAR_PREVIEW_LIMITS = {
  sources: 3,
  associations: 4,
  rules: 3,
  destinations: 3,
} as const;

type DetailModalKey = keyof typeof SIDECAR_PREVIEW_LIMITS | "studyMetadata" | null;

interface DimseEvent {
  type: string;
  calling_ae?: string;
  study_uid?: string;
  at: string;
}

interface AssociationItem {
  id: string;
  label: string;
  detail: string;
  status: string;
  at: string;
  studyUid?: string;
}

interface Props {
  wsEvents: WsEvent[];
  dimseEvents: DimseEvent[];
  selectedStudyUid: string | null;
  selectedTransaction: RoutingTransaction | null;
  onSelectStudyUid: (studyUid: string) => void;
}

function sectionBadge(label: string, total: number, previewLimit: number): string {
  if (total <= previewLimit) return label;
  return `${label} · ${total}`;
}

function shortUid(uid: string): string {
  if (uid.length <= 16) return uid;
  return `${uid.slice(0, 8)}…${uid.slice(-4)}`;
}

function mergeModalityCounts(...groups: ChartDataPoint[][]): ChartDataPoint[] {
  const map = new Map<string, number>();
  for (const group of groups) {
    for (const item of group) {
      const label = item.label.trim();
      if (!label) continue;
      map.set(label, (map.get(label) ?? 0) + item.value);
    }
  }
  return Array.from(map.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

function liveModalityCounts(wsEvents: WsEvent[]): ChartDataPoint[] {
  const counts = new Map<string, number>();
  wsEvents.forEach((event) => {
    if (!ROUTING_WS_EVENTS.has(event.event_type)) return;
    const modality = String(event.data.modality ?? "").trim();
    if (!modality) return;
    counts.set(modality, (counts.get(modality) ?? 0) + 1);
  });
  return Array.from(counts.entries()).map(([label, value]) => ({ label, value }));
}

function SidecarSection({
  title,
  badge,
  previewLimit,
  totalCount,
  onShowMore,
  children,
}: {
  title: string;
  badge?: string;
  previewLimit: number;
  totalCount: number;
  onShowMore?: () => void;
  children: ReactNode;
}) {
  const hasMore = totalCount > previewLimit;

  return (
    <section
      className="monitor-sidecar-section"
      style={{ "--sidecar-preview-rows": previewLimit } as CSSProperties}
    >
      <header className="monitor-sidecar-section-head">
        <h3>{title}</h3>
        {badge && <span className="monitor-sidecar-badge">{badge}</span>}
      </header>
      <div className="monitor-sidecar-section-body">{children}</div>
      {hasMore && onShowMore && (
        <button type="button" className="monitor-sidecar-show-more" onClick={onShowMore}>
          Show more →
        </button>
      )}
    </section>
  );
}

function SourceList({ items, modalityMax }: { items: ChartDataPoint[]; modalityMax: number }) {
  return (
    <ul className="monitor-source-list">
      {items.map((modality, index) => (
        <li key={modality.label} className="monitor-source-item">
          <div className="monitor-source-head">
            <span className="monitor-source-modality">{modality.label}</span>
            <span className="monitor-source-count">{modality.value.toLocaleString()} studies</span>
          </div>
          <div className="monitor-source-bar-track">
            <div
              className="monitor-source-bar-fill"
              style={{
                width: `${Math.max(8, (modality.value / modalityMax) * 100)}%`,
                background: MODALITY_COLORS[index % MODALITY_COLORS.length],
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function AssociationList({
  items,
  selectedStudyUid,
  onSelect,
}: {
  items: AssociationItem[];
  selectedStudyUid: string | null;
  onSelect?: (studyUid: string) => void;
}) {
  return (
    <ul className="monitor-association-list">
      {items.map((item) => {
        const selectable = Boolean(item.studyUid && onSelect);
        return (
          <li
            key={item.id}
            className={`monitor-association-item${selectable ? " monitor-association-item--selectable" : ""}${
              item.studyUid && item.studyUid === selectedStudyUid ? " monitor-association-item--selected" : ""
            }`}
            role={selectable ? "button" : undefined}
            tabIndex={selectable ? 0 : undefined}
            onClick={selectable ? () => onSelect!(item.studyUid!) : undefined}
            onKeyDown={
              selectable
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect!(item.studyUid!);
                    }
                  }
                : undefined
            }
          >
            <div className="monitor-association-main">
              <span className="monitor-association-label">{item.label}</span>
              <code className="monitor-association-detail">{item.detail}</code>
            </div>
            <div className="monitor-association-meta">
              <StatusBadge status={item.status} dot={false} />
              <time dateTime={item.at}>{new Date(item.at).toLocaleTimeString()}</time>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function RuleList({ rules }: { rules: RoutingRule[] }) {
  return (
    <ul className="monitor-rule-list">
      {rules.map((rule) => (
        <li key={rule.id} className="monitor-rule-item">
          <span className="monitor-rule-name">{rule.name}</span>
          <span className="monitor-rule-expr">
            {rule.condition_tag} {rule.condition_operator} &ldquo;{rule.condition_value}&rdquo;
          </span>
          <span className="monitor-rule-dest">
            → {rule.destination_node_ids.length} destination
            {rule.destination_node_ids.length === 1 ? "" : "s"}
          </span>
        </li>
      ))}
    </ul>
  );
}

function DestinationList({ nodes }: { nodes: Node[] }) {
  return (
    <ul className="monitor-destination-list">
      {nodes.map((node) => (
        <li key={node.id} className="monitor-destination-item">
          <div className="monitor-destination-head">
            <Server size={14} strokeWidth={2} aria-hidden />
            <span>{node.name}</span>
          </div>
          <span className="monitor-destination-meta">
            {node.protocol}
            {node.dicomweb_url ? " · DICOMweb" : node.ae_title ? ` · AE ${node.ae_title}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

function StudyMetadataDetail({ transaction }: { transaction: RoutingTransaction }) {
  return (
    <dl className="monitor-tag-list">
      <div>
        <dt>Study UID</dt>
        <dd>
          <code>{transaction.study_uid}</code>
        </dd>
      </div>
      <div>
        <dt>Modality</dt>
        <dd>(0008,0060) {transaction.modality ?? "—"}</dd>
      </div>
      <div>
        <dt>Patient ID</dt>
        <dd>(0010,0020) {transaction.patient_id ?? "—"}</dd>
      </div>
      <div>
        <dt>Accession</dt>
        <dd>(0008,0050) {transaction.accession_number ?? "—"}</dd>
      </div>
      <div>
        <dt>Instances</dt>
        <dd>{transaction.instances_count ?? 0}</dd>
      </div>
      <div>
        <dt>Status</dt>
        <dd>
          <StatusBadge status={transaction.overall_status} dot={false} />
        </dd>
      </div>
    </dl>
  );
}

const DETAIL_MODAL_TITLES: Record<Exclude<DetailModalKey, null>, string> = {
  sources: "Sources — Today",
  associations: "Associations",
  studyMetadata: "Study Metadata",
  rules: "Active Routing Rules",
  destinations: "Destinations",
};

export function RoutingMonitorLeftSidecar({
  wsEvents,
  dimseEvents,
  selectedStudyUid,
  onSelectStudyUid,
}: Pick<Props, "wsEvents" | "dimseEvents" | "selectedStudyUid" | "onSelectStudyUid">) {
  const [detailModal, setDetailModal] = useState<DetailModalKey>(null);

  const { data: modalitiesToday = [] } = useQuery({
    queryKey: ["monitor-modality-today"],
    queryFn: () => apiFetch<ChartDataPoint[]>("/api/v1/dashboard/charts/modality?days=1"),
    refetchInterval: 15000,
  });

  const routingWsEvents = useMemo(
    () => wsEvents.filter((event) => ROUTING_WS_EVENTS.has(event.event_type)),
    [wsEvents],
  );

  const sources = useMemo(
    () => mergeModalityCounts(modalitiesToday, liveModalityCounts(routingWsEvents)),
    [modalitiesToday, routingWsEvents],
  );

  const associations = useMemo(() => {
    const items: AssociationItem[] = [];

    routingWsEvents.forEach((event, index) => {
      const studyUid = String(event.data.study_uid ?? "");
      const modality = String(event.data.modality ?? "—");
      const status =
        event.event_type === "routing_completed"
          ? String(event.data.overall_status ?? "routed")
          : "received";
      items.push({
        id: `ws-${index}-${studyUid}`,
        label: modality,
        detail: studyUid ? shortUid(studyUid) : event.event_type.replace(/_/g, " "),
        status,
        at: new Date().toISOString(),
        studyUid: studyUid || undefined,
      });
    });

    dimseEvents.forEach((event, index) => {
      items.push({
        id: `dimse-${event.at}-${index}`,
        label: event.calling_ae ?? event.type,
        detail: event.study_uid ? shortUid(event.study_uid) : event.type,
        status: event.type.includes("reject") ? "failed" : "association",
        at: event.at,
        studyUid: event.study_uid,
      });
    });

    return items;
  }, [routingWsEvents, dimseEvents]);

  const modalityMax = Math.max(...sources.map((m) => m.value), 1);

  const handleAssociationSelect = (studyUid: string) => {
    onSelectStudyUid(studyUid);
    setDetailModal(null);
  };

  return (
    <>
      <aside className="monitor-sidecar monitor-sidecar--left" aria-label="Sources and associations">
        <SidecarSection
          title="Sources"
          badge={sources.length > 0 ? sectionBadge("active", sources.length, SIDECAR_PREVIEW_LIMITS.sources) : undefined}
          previewLimit={SIDECAR_PREVIEW_LIMITS.sources}
          totalCount={sources.length}
          onShowMore={() => setDetailModal("sources")}
        >
          {sources.length === 0 ? (
            <p className="monitor-sidecar-empty">No routing studies received today.</p>
          ) : (
            <SourceList
              items={sources.slice(0, SIDECAR_PREVIEW_LIMITS.sources)}
              modalityMax={modalityMax}
            />
          )}
        </SidecarSection>

        <SidecarSection
          title="Associations"
          badge={associations.length > 0 ? sectionBadge("live", associations.length, SIDECAR_PREVIEW_LIMITS.associations) : undefined}
          previewLimit={SIDECAR_PREVIEW_LIMITS.associations}
          totalCount={associations.length}
          onShowMore={() => setDetailModal("associations")}
        >
          {associations.length === 0 ? (
            <p className="monitor-sidecar-empty">Waiting for DIMSE associations and routing events…</p>
          ) : (
            <AssociationList
              items={associations.slice(0, SIDECAR_PREVIEW_LIMITS.associations)}
              selectedStudyUid={selectedStudyUid}
              onSelect={onSelectStudyUid}
            />
          )}
        </SidecarSection>
      </aside>

      <Modal
        title={detailModal ? DETAIL_MODAL_TITLES[detailModal] : ""}
        open={detailModal === "sources" || detailModal === "associations"}
        onClose={() => setDetailModal(null)}
        wide
      >
        <div className="monitor-sidecar-modal-body">
          {detailModal === "sources" && <SourceList items={sources} modalityMax={modalityMax} />}
          {detailModal === "associations" && (
            <AssociationList
              items={associations}
              selectedStudyUid={selectedStudyUid}
              onSelect={handleAssociationSelect}
            />
          )}
        </div>
      </Modal>
    </>
  );
}

export function RoutingMonitorRightSidecar({
  selectedTransaction,
  selectedStudyUid,
}: Pick<Props, "selectedTransaction" | "selectedStudyUid">) {
  const [detailModal, setDetailModal] = useState<DetailModalKey>(null);

  const { data: rules = [] } = useQuery({
    queryKey: ["routing-rules"],
    queryFn: () => apiFetch<RoutingRule[]>("/api/v1/routing-rules"),
    refetchInterval: 30000,
    retry: false,
  });

  const { data: nodes = [] } = useQuery({
    queryKey: ["nodes"],
    queryFn: () => apiFetch<Node[]>("/api/v1/nodes"),
    refetchInterval: 30000,
    retry: false,
  });

  const activeRules = useMemo(
    () => [...rules.filter((rule) => rule.is_active)].sort((a, b) => a.priority - b.priority),
    [rules],
  );
  const destinations = nodes.filter((node) => node.node_type === "destination" && node.is_active);

  const hasStudyDetail = Boolean(selectedStudyUid || selectedTransaction);

  return (
    <>
      <aside className="monitor-sidecar monitor-sidecar--right" aria-label="Inspector, rules, and destinations">
        <SidecarSection
          title="Study metadata"
          previewLimit={1}
          totalCount={hasStudyDetail ? 2 : 0}
          onShowMore={hasStudyDetail ? () => setDetailModal("studyMetadata") : undefined}
        >
          {!hasStudyDetail ? (
            <p className="monitor-sidecar-empty">
              Select a routing transaction or association to inspect study fields.
            </p>
          ) : !selectedTransaction ? (
            <p className="monitor-sidecar-preview">
              <code>{selectedStudyUid}</code>
              <span className="monitor-sidecar-empty">Loading transaction details…</span>
            </p>
          ) : (
            <div className="monitor-sidecar-preview">
              <p className="monitor-sidecar-preview-title">
                <strong>{selectedTransaction.modality ?? "—"}</strong>
                <StatusBadge status={selectedTransaction.overall_status} dot={false} />
              </p>
              <code>{selectedTransaction.study_uid}</code>
            </div>
          )}
        </SidecarSection>

        <SidecarSection
          title="Active rules"
          badge={activeRules.length > 0 ? String(activeRules.length) : undefined}
          previewLimit={SIDECAR_PREVIEW_LIMITS.rules}
          totalCount={activeRules.length}
          onShowMore={() => setDetailModal("rules")}
        >
          {activeRules.length === 0 ? (
            <p className="monitor-sidecar-empty">
              No active rules. <Link to="/routing-rules">Configure rules</Link>
            </p>
          ) : (
            <RuleList rules={activeRules.slice(0, SIDECAR_PREVIEW_LIMITS.rules)} />
          )}
        </SidecarSection>

        <SidecarSection
          title="Destinations"
          badge={destinations.length > 0 ? String(destinations.length) : undefined}
          previewLimit={SIDECAR_PREVIEW_LIMITS.destinations}
          totalCount={destinations.length}
          onShowMore={() => setDetailModal("destinations")}
        >
          {destinations.length === 0 ? (
            <p className="monitor-sidecar-empty">
              No active destinations. <Link to="/nodes">Add nodes</Link>
            </p>
          ) : (
            <DestinationList nodes={destinations.slice(0, SIDECAR_PREVIEW_LIMITS.destinations)} />
          )}
        </SidecarSection>
      </aside>

      <Modal
        title={detailModal ? DETAIL_MODAL_TITLES[detailModal] : ""}
        open={
          detailModal === "studyMetadata" || detailModal === "rules" || detailModal === "destinations"
        }
        onClose={() => setDetailModal(null)}
        wide
      >
        <div className="monitor-sidecar-modal-body">
          {detailModal === "studyMetadata" && selectedTransaction && (
            <StudyMetadataDetail transaction={selectedTransaction} />
          )}
          {detailModal === "studyMetadata" && !selectedTransaction && selectedStudyUid && (
            <dl className="monitor-tag-list">
              <div>
                <dt>Study UID</dt>
                <dd>
                  <code>{selectedStudyUid}</code>
                </dd>
              </div>
            </dl>
          )}
          {detailModal === "rules" && (
            <>
              <RuleList rules={activeRules} />
              <p className="monitor-sidecar-modal-footer">
                <Link to="/routing-rules" onClick={() => setDetailModal(null)}>
                  Manage routing rules
                </Link>
              </p>
            </>
          )}
          {detailModal === "destinations" && (
            <>
              <DestinationList nodes={destinations} />
              <p className="monitor-sidecar-modal-footer">
                <Link to="/nodes" onClick={() => setDetailModal(null)}>
                  Manage nodes
                </Link>
              </p>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
