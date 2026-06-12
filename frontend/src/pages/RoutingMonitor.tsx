import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api/client";
import DataTable from "../components/DataTable";
import { useWebSocket } from "../hooks/useWebSocket";

interface RoutingDestination {
  id: string;
  destination_node_id: string;
  destination_name: string | null;
  status: string;
  retry_count: number;
  failure_reason: string | null;
}

interface RoutingTransaction {
  id: string;
  study_uid: string;
  patient_id: string | null;
  modality: string | null;
  accession_number: string | null;
  instances_count: number | null;
  overall_status: string;
  received_at: string | null;
  destinations: RoutingDestination[];
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

function statusBadge(status: string) {
  const ok = status === "success";
  return <span className={`badge ${ok ? "badge-active" : "badge-inactive"}`}>{status}</span>;
}

export default function RoutingMonitor() {
  const queryClient = useQueryClient();
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

  const retryMutation = useMutation({
    mutationFn: (destinationId: string) =>
      apiFetch<{ status: string }>(`/api/v1/routing-transactions/destinations/${destinationId}/retry`, {
        method: "POST",
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["routing-transactions"] }),
  });

  const liveEvents = events.filter(
    (e) => e.event_type === "study_received" || e.event_type === "routing_completed"
  );

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

      {liveEvents.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Live Events</h3>
          {liveEvents.slice(0, 8).map((e, i) => (
            <div key={i} style={{ fontSize: "0.875rem", marginBottom: "0.35rem" }}>
              <strong>{e.event_type}</strong>:{" "}
              <code>{String(e.data.study_uid ?? "")}</code>
              {e.data.overall_status ? ` → ${String(e.data.overall_status)}` : ""}
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Routing Transactions</h3>
        {isLoading ? (
          <p>Loading transactions...</p>
        ) : (transactions?.items ?? []).length === 0 ? (
          <p className="empty-message">
            No studies received yet. Send a C-STORE to the DIMSE listener to test.
          </p>
        ) : (
          (transactions?.items ?? []).map((txn) => (
            <div key={txn.id} style={{ borderBottom: "1px solid #e2e8f0", padding: "1rem 0" }}>
              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
                <span><strong>Study:</strong> <code style={{ fontSize: "0.75rem" }}>{txn.study_uid}</code></span>
                <span><strong>Modality:</strong> {txn.modality ?? "—"}</span>
                <span><strong>Instances:</strong> {txn.instances_count ?? 0}</span>
                <span>{statusBadge(txn.overall_status)}</span>
                <span style={{ color: "#64748b", fontSize: "0.875rem" }}>
                  {txn.received_at ? new Date(txn.received_at).toLocaleString() : ""}
                </span>
              </div>
              {txn.destinations.length > 0 && (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Destination</th>
                      <th>Status</th>
                      <th>Retries</th>
                      <th>Failure</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {txn.destinations.map((d) => (
                      <tr key={d.id}>
                        <td>{d.destination_name ?? d.destination_node_id.slice(0, 8)}</td>
                        <td>{statusBadge(d.status)}</td>
                        <td>{d.retry_count}</td>
                        <td style={{ fontSize: "0.8rem", color: "#991b1b" }}>{d.failure_reason ?? "—"}</td>
                        <td>
                          {d.status === "failed" && (
                            <button
                              className="btn-sm"
                              disabled={retryMutation.isPending}
                              onClick={() => retryMutation.mutate(d.id)}
                            >
                              Retry
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))
        )}
      </div>

      {dimse && dimse.recent_events.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Recent DIMSE Events</h3>
          <DataTable
            data={dimse.recent_events.map((e, i) => ({ ...e, _key: `${e.at}-${i}` }))}
            keyField="_key"
            columns={[
              { key: "at", header: "Time", render: (e) => new Date(e.at).toLocaleString() },
              { key: "type", header: "Event" },
              { key: "calling_ae", header: "Calling AE" },
              {
                key: "study_uid",
                header: "Study UID",
                render: (e) =>
                  e.study_uid ? <code style={{ fontSize: "0.75rem" }}>{e.study_uid}</code> : "—",
              },
            ]}
          />
        </div>
      )}
    </div>
  );
}
