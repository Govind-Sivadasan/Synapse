import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api/client";
import DataTable from "../components/DataTable";
import { AuditLog, AuditLogList } from "../types/api";

const EVENT_TYPES = [
  "CONFIG_CHANGE",
  "DIMSE_ASSOCIATION",
  "ROUTING_RULE_MATCH",
  "TAG_MORPHING_APPLIED",
  "JOB_STATUS_CHANGE",
  "USER_LOGIN",
  "CHATBOT_QUERY",
  "RETRY_ATTEMPT",
];

export default function AuditLogs() {
  const [eventType, setEventType] = useState("");
  const [userId, setUserId] = useState("");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["audit-logs", eventType, userId],
    queryFn: () => {
      const params = new URLSearchParams({ limit: "100" });
      if (eventType) params.set("event_type", eventType);
      if (userId) params.set("user_id", userId);
      return apiFetch<AuditLogList>(`/api/v1/audit-logs?${params}`);
    },
  });

  const logs: AuditLog[] = data?.items ?? [];

  return (
    <div>
      <div className="header-bar">
        <h2 style={{ margin: 0 }}>Audit Logs</h2>
        <button onClick={() => refetch()}>Refresh</button>
      </div>

      <div className="card">
        <div className="form-grid" style={{ marginBottom: "1rem" }}>
          <div className="form-field">
            <label>Event Type</label>
            <select value={eventType} onChange={(e) => setEventType(e.target.value)}>
              <option value="">All events</option>
              {EVENT_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label>User ID</label>
            <input
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="Filter by user ID"
            />
          </div>
        </div>

        {isLoading ? (
          <p>Loading audit logs...</p>
        ) : (
          <>
            <p style={{ fontSize: "0.875rem", color: "#64748b" }}>
              Showing {logs.length} of {data?.total ?? 0} records
            </p>
            <DataTable
              data={logs}
              keyField="id"
              columns={[
                {
                  key: "created_at",
                  header: "Timestamp",
                  render: (l) => new Date(l.created_at).toLocaleString(),
                },
                { key: "event_type", header: "Event" },
                { key: "user_id", header: "User" },
                { key: "entity_type", header: "Entity" },
                {
                  key: "details",
                  header: "Details",
                  render: (l) => (
                    <span style={{ fontSize: "0.8rem" }}>
                      {l.details ? JSON.stringify(l.details) : "—"}
                    </span>
                  ),
                },
              ]}
            />
          </>
        )}
      </div>
    </div>
  );
}
