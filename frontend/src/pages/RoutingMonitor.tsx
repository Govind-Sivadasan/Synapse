import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api/client";
import DataTable from "../components/DataTable";
import { useWebSocket } from "../hooks/useWebSocket";

interface RoutingTransaction {
  id: string;
  study_uid: string;
  patient_id: string | null;
  modality: string | null;
  accession_number: string | null;
  instances_count: number | null;
  overall_status: string;
  received_at: string | null;
  destinations: { status: string; failure_reason: string | null }[];
}

interface TransactionList {
  total: number;
  items: RoutingTransaction[];
}

interface DimseStatus {
  listening: boolean;
  ae_title: string;
  port: number;
  promiscuous_mode: boolean;
  statistics: {
    instances_received: number;
    studies_assembled: number;
    c_echo_total: number;
    associations_accepted: number;
    associations_rejected: number;
  };
  recent_events: { type: string; calling_ae?: string; study_uid?: string; at: string }[];
}

export default function RoutingMonitor() {
  const { events, connected } = useWebSocket();

  const { data: transactions, isLoading, refetch } = useQuery({
    queryKey: ["routing-transactions"],
    queryFn: () => apiFetch<TransactionList>("/api/v1/routing-transactions?limit=50"),
    refetchInterval: 10000,
  });

  const { data: dimse } = useQuery({
    queryKey: ["dimse-status"],
    queryFn: () => apiFetch<DimseStatus>("/api/v1/dimse/status"),
    refetchInterval: 10000,
  });

  const liveStudyEvents = events.filter((e) => e.event_type === "study_received");

  return (
    <div>
      <div className="header-bar">
        <h2 style={{ margin: 0 }}>Routing Monitor</h2>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <span style={{ fontSize: "0.875rem", color: connected ? "#16a34a" : "#64748b" }}>
            WebSocket {connected ? "connected" : "disconnected"}
          </span>
          <button onClick={() => refetch()}>Refresh</button>
        </div>
      </div>

      {dimse && (
        <div className="grid" style={{ marginBottom: "1rem" }}>
          <div className="card">
            <div className="metric">{dimse.statistics.studies_assembled}</div>
            <div className="metric-label">Studies Assembled</div>
          </div>
          <div className="card">
            <div className="metric">{dimse.statistics.instances_received}</div>
            <div className="metric-label">Instances Received</div>
          </div>
          <div className="card">
            <div className="metric">{dimse.statistics.c_echo_total}</div>
            <div className="metric-label">C-ECHO Verifications</div>
          </div>
          <div className="card">
            <div className="metric-label">DIMSE Listener</div>
            <div style={{ fontWeight: 600 }}>
              {dimse.listening ? `${dimse.ae_title}@${dimse.port}` : "Not listening"}
            </div>
            <div style={{ fontSize: "0.8rem", color: "#64748b" }}>
              Promiscuous: {dimse.promiscuous_mode ? "ON" : "OFF"}
            </div>
          </div>
        </div>
      )}

      {liveStudyEvents.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Live Events</h3>
          {liveStudyEvents.slice(0, 5).map((e, i) => (
            <div key={i} style={{ fontSize: "0.875rem", marginBottom: "0.35rem" }}>
              Study received: <code>{String(e.data.study_uid ?? "")}</code> ({String(e.data.instances_count ?? 0)} instances)
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Routing Transactions</h3>
        {isLoading ? (
          <p>Loading transactions...</p>
        ) : (
          <DataTable
            data={transactions?.items ?? []}
            keyField="id"
            emptyMessage="No studies received yet. Send a C-STORE to the DIMSE listener to test."
            columns={[
              {
                key: "received_at",
                header: "Received",
                render: (t) => (t.received_at ? new Date(t.received_at).toLocaleString() : "—"),
              },
              { key: "study_uid", header: "Study UID", render: (t) => <code style={{ fontSize: "0.75rem" }}>{t.study_uid}</code> },
              { key: "modality", header: "Modality" },
              { key: "patient_id", header: "Patient ID" },
              { key: "instances_count", header: "Instances" },
              {
                key: "overall_status",
                header: "Status",
                render: (t) => (
                  <span className={`badge ${t.overall_status === "success" ? "badge-active" : "badge-inactive"}`}>
                    {t.overall_status}
                  </span>
                ),
              },
            ]}
          />
        )}
      </div>

      {dimse && dimse.recent_events.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Recent DIMSE Events</h3>
          <DataTable
            data={dimse.recent_events}
            keyField="at"
            columns={[
              { key: "at", header: "Time", render: (e) => new Date(e.at).toLocaleString() },
              { key: "type", header: "Event" },
              { key: "calling_ae", header: "Calling AE" },
              { key: "study_uid", header: "Study UID", render: (e) => e.study_uid ? <code style={{ fontSize: "0.75rem" }}>{e.study_uid}</code> : "—" },
            ]}
          />
        </div>
      )}
    </div>
  );
}
