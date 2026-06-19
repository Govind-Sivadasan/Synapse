import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, AlertTriangle, ArrowLeftRight, RefreshCw, Radio, Server, Wifi, WifiOff } from "lucide-react";
import { apiFetch } from "../api/client";
import DataTable from "../components/DataTable";
import {
  RoutingMonitorLeftSidecar,
  RoutingMonitorRightSidecar,
} from "../components/routing/RoutingMonitorSidecars";
import FilterChips from "../components/ui/FilterChips";
import PageHeader from "../components/ui/PageHeader";
import MetricCard from "../components/ui/MetricCard";
import StatusBadge from "../components/ui/StatusBadge";
import { PageLoading } from "../components/ui/LoadingScreen";
import Pagination from "../components/ui/Pagination";
import TableSearch from "../components/ui/TableSearch";
import ActionButton from "../components/ui/ActionButton";
import { useWebSocket } from "../hooks/useWebSocket";
import { RoutingTransaction } from "../types/api";

interface TransactionList {
  total: number;
  items: RoutingTransaction[];
}

const STATUS_FILTERS = [
  { value: "", label: "All", tone: "neutral" as const },
  { value: "success", label: "Routed", tone: "success" as const },
  { value: "failed", label: "Failed", tone: "error" as const },
  { value: "partial", label: "Partial", tone: "warning" as const },
  { value: "no_match", label: "No match", tone: "info" as const },
  { value: "pending", label: "Pending", tone: "warning" as const },
];

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
  const queryClient = useQueryClient();
  const { events, opsSnapshot, connected, reconnecting, reconnect } = useWebSocket();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedStudyUid, setSelectedStudyUid] = useState<string | null>(null);
  const pageSize = 10;

  useEffect(() => {
    setPage(0);
  }, [search, statusFilter, dateFrom, dateTo]);

  const { data: transactions, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["routing-transactions", search, statusFilter, dateFrom, dateTo, page],
    queryFn: () => {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(page * pageSize),
      });
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      if (dateFrom) params.set("date_from", new Date(`${dateFrom}T00:00:00`).toISOString());
      if (dateTo) params.set("date_to", new Date(`${dateTo}T23:59:59.999`).toISOString());
      return apiFetch<TransactionList>(`/api/v1/routing-transactions?${params}`);
    },
    refetchInterval: 10000,
  });

  const { data: dimse, refetch: refetchDimse, isFetching: dimseFetching } = useQuery({
    queryKey: ["dimse-status"],
    queryFn: () => apiFetch<DimseStatus>("/api/v1/dimse/status"),
    refetchInterval: 10000,
  });

  const selectedFromList = useMemo(
    () => (transactions?.items ?? []).find((txn) => txn.id === selectedId) ?? null,
    [transactions?.items, selectedId],
  );

  const { data: selectedTxnData } = useQuery({
    queryKey: ["routing-selected-txn", selectedStudyUid],
    queryFn: () =>
      apiFetch<TransactionList>(
        `/api/v1/routing-transactions?study_uid=${encodeURIComponent(selectedStudyUid!)}&limit=1`,
      ),
    enabled: Boolean(selectedStudyUid) && selectedFromList?.study_uid !== selectedStudyUid,
    retry: false,
  });

  const selectedTransaction = selectedFromList ?? selectedTxnData?.items[0] ?? null;

  const handleSelectStudyUid = (studyUid: string) => {
    setSelectedStudyUid(studyUid);
    const match = (transactions?.items ?? []).find((txn) => txn.study_uid === studyUid);
    setSelectedId(match?.id ?? null);
  };

  const handleSelectTransaction = (txn: RoutingTransaction) => {
    setSelectedId(txn.id);
    setSelectedStudyUid(txn.study_uid);
  };

  const refreshAll = () => {
    void refetch();
    void refetchDimse();
    reconnect();
  };

  const retryMutation = useMutation({
    mutationFn: (destinationId: string) =>
      apiFetch<{ status: string }>(`/api/v1/routing-transactions/destinations/${destinationId}/retry`, {
        method: "POST",
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["routing-transactions"] }),
  });

  const liveEvents = events.filter(
    (e) => e.event_type === "study_received" || e.event_type === "routing_completed",
  );

  useEffect(() => {
    if (liveEvents.length === 0) return;
    queryClient.invalidateQueries({ queryKey: ["routing-transactions"] });
    queryClient.invalidateQueries({ queryKey: ["dimse-status"] });
  }, [liveEvents.length, queryClient]);

  return (
    <div>
      <PageHeader
        title="Routing Monitor"
        description="Live DIMSE intake, rule evaluation, and STOW-RS delivery to cloud destinations."
        actions={
          <>
            <span className={`connection-pill ${connected ? "connection-pill--live" : "connection-pill--offline"}`}>
              {connected ? <Wifi size={14} /> : <WifiOff size={14} />}
              WebSocket {connected ? "live" : reconnecting ? "connecting…" : "offline"}
            </span>
            <ActionButton
              icon={
                <RefreshCw
                  size={16}
                  className={isFetching || dimseFetching || reconnecting ? "spin-icon" : undefined}
                />
              }
              onClick={refreshAll}
            >
              Refresh
            </ActionButton>
          </>
        }
      />

      <div className="monitor-layout">
        <div className="monitor-main">
          {dimse && (
            <div className="grid" style={{ marginBottom: "1.25rem" }}>
              <MetricCard
                label="Studies Assembled"
                value={dimse.statistics.studies_assembled}
                icon={<Radio size={20} />}
                tone="primary"
              />
              <MetricCard
                label="Instances Received"
                value={dimse.statistics.instances_received}
                icon={<Server size={20} />}
                tone="info"
              />
              <MetricCard
                label="C-ECHO Verifications"
                value={dimse.statistics.c_echo_total}
                icon={<Activity size={20} />}
                tone="success"
              />
              <MetricCard
                label="Associations Rejected"
                value={dimse.statistics.associations_rejected}
                icon={<AlertTriangle size={20} />}
                tone={dimse.statistics.associations_rejected > 0 ? "warning" : "success"}
                sub={`${dimse.statistics.associations_accepted} accepted`}
              />
              <MetricCard
                label="DIMSE Listener"
                value={dimse.listening ? `${dimse.ae_title}@${dimse.port}` : "Offline"}
                icon={<Radio size={20} />}
                tone={dimse.listening ? "success" : "error"}
                sub={`Promiscuous mode: ${dimse.promiscuous_mode ? "ON" : "OFF"}`}
              />
              {opsSnapshot && (
                <>
                  <MetricCard
                    label="Routing Queue"
                    value={opsSnapshot.routing_queue.queued}
                    icon={<Activity size={20} />}
                    tone={opsSnapshot.routing_queue.queued > 50 ? "warning" : "info"}
                    sub={`${opsSnapshot.routing_queue.active_tasks} active`}
                  />
                  <MetricCard
                    label="Migration Queue"
                    value={opsSnapshot.migration_queue.queued}
                    icon={<ArrowLeftRight size={20} />}
                    tone={opsSnapshot.migration_queue.queued > 100 ? "warning" : "info"}
                    sub={`${opsSnapshot.migration_queue.active_tasks} active · ${opsSnapshot.workers_online} workers`}
                  />
                </>
              )}
            </div>
          )}

          <div className="card">
            <h3 className="card-title">Routing Transactions</h3>
            <FilterChips
              label="Status"
              options={STATUS_FILTERS}
              value={statusFilter}
              onChange={setStatusFilter}
            />
            <div className="filter-date-row">
              <label className="filter-date-field">
                <span>From</span>
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </label>
              <label className="filter-date-field">
                <span>To</span>
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </label>
              {(dateFrom || dateTo || statusFilter) && (
                <button
                  type="button"
                  className="btn-sm btn-secondary filter-date-clear"
                  onClick={() => {
                    setStatusFilter("");
                    setDateFrom("");
                    setDateTo("");
                  }}
                >
                  Clear filters
                </button>
              )}
            </div>
            <TableSearch
              value={search}
              onChange={setSearch}
              placeholder="Search study UID, patient, modality…"
            />
            {isLoading ? (
              <PageLoading label="Loading transactions…" compact />
            ) : (transactions?.items ?? []).length === 0 ? (
              <p className="empty-message">
                No studies received yet. Send a C-STORE to the DIMSE listener to test routing.
              </p>
            ) : (
              (transactions?.items ?? []).map((txn) => (
                <div
                  key={txn.id}
                  className={`txn-block${selectedId === txn.id ? " txn-block--selected" : ""}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSelectTransaction(txn)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleSelectTransaction(txn);
                    }
                  }}
                >
                  <div className="txn-meta">
                    <span>
                      <strong>Study</strong> <code>{txn.study_uid}</code>
                    </span>
                    <span>
                      <strong>Modality</strong> {txn.modality ?? "—"}
                    </span>
                    <span>
                      <strong>Patient</strong> {txn.patient_id ?? "—"}
                    </span>
                    <span>
                      <strong>Accession</strong> {txn.accession_number ?? "—"}
                    </span>
                    <span>
                      <strong>Instances</strong> {txn.instances_count ?? 0}
                    </span>
                    <StatusBadge status={txn.overall_status} />
                    {txn.received_at && <time>{new Date(txn.received_at).toLocaleString()}</time>}
                  </div>
                  {txn.destinations.length > 0 && (
                    <div className="table-wrap">
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
                              <td>
                                <StatusBadge status={d.status} />
                              </td>
                              <td>{d.retry_count}</td>
                              <td style={{ fontSize: "0.8125rem", color: "var(--color-error)" }}>
                                {d.failure_reason ?? "—"}
                              </td>
                              <td>
                                {d.status === "failed" && (
                                  <button
                                    type="button"
                                    className="btn-sm"
                                    disabled={retryMutation.isPending}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      retryMutation.mutate(d.id);
                                    }}
                                  >
                                    Retry
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))
            )}
            <Pagination
              page={page}
              pageSize={pageSize}
              total={transactions?.total ?? 0}
              onPageChange={setPage}
            />
          </div>

          {dimse && dimse.recent_events.length > 0 && (
            <div className="card">
              <h3 className="card-title">Recent DIMSE Events</h3>
              <DataTable
                tableId="routing-monitor-dimse"
                data={dimse.recent_events.map((e, i) => ({ ...e, _key: `${e.at}-${i}` }))}
                keyField="_key"
                paginate
                pageSize={8}
                searchable
                searchKeys={["type", "calling_ae", "study_uid"]}
                searchPlaceholder="Search DIMSE events…"
                resizable={false}
                defaultClientSort={{ sortBy: "at", sortDir: "desc" }}
                columns={[
                  { key: "at", header: "Time", sortValue: (e) => e.at, render: (e) => new Date(e.at).toLocaleString() },
                  { key: "type", header: "Event" },
                  { key: "calling_ae", header: "Calling AE" },
                  {
                    key: "study_uid",
                    header: "Study UID",
                    render: (e) =>
                      e.study_uid ? (
                        <code className="table-cell-uid" title={e.study_uid}>
                          {e.study_uid}
                        </code>
                      ) : (
                        "—"
                      ),
                  },
                ]}
              />
            </div>
          )}
        </div>

        <div className="monitor-sidecar-column">
          <RoutingMonitorLeftSidecar
            wsEvents={events}
            dimseEvents={dimse?.recent_events ?? []}
            selectedStudyUid={selectedStudyUid}
            onSelectStudyUid={handleSelectStudyUid}
          />
          <RoutingMonitorRightSidecar
            selectedStudyUid={selectedStudyUid}
            selectedTransaction={selectedTransaction}
          />
        </div>
      </div>
    </div>
  );
}
