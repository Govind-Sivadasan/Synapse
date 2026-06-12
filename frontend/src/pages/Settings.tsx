import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api/client";
import PageHeader from "../components/ui/PageHeader";
import { PageLoading } from "../components/ui/LoadingScreen";
import { SystemConfig } from "../types/api";

export default function Settings() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<SystemConfig | null>(null);
  const [message, setMessage] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["system-config"],
    queryFn: () => apiFetch<SystemConfig>("/api/v1/config"),
  });

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: (payload: Partial<SystemConfig>) =>
      apiFetch<SystemConfig>("/api/v1/config", { method: "PUT", body: JSON.stringify(payload) }),
    onSuccess: (result) => {
      setForm(result);
      queryClient.invalidateQueries({ queryKey: ["system-config"] });
      setMessage("Settings saved successfully.");
      setTimeout(() => setMessage(""), 3000);
    },
  });

  if (isLoading || !form) return <PageLoading label="Loading settings…" />;
  if (error) return <div className="alert alert-error">Error: {(error as Error).message}</div>;

  return (
    <div>
      <PageHeader
        title="System Configuration"
        description="DIMSE listener, retry policy, and global routing parameters."
      />
      {message && <div className="alert alert-success">{message}</div>}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>DIMSE Listener</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveMutation.mutate(form);
          }}
        >
          <div className="form-grid">
            <div className="form-field">
              <label>AE Title</label>
              <input
                value={form.dimse_ae_title}
                onChange={(e) => setForm({ ...form, dimse_ae_title: e.target.value })}
                maxLength={16}
              />
            </div>
            <div className="form-field">
              <label>DIMSE Port</label>
              <input
                type="number"
                value={form.dimse_port}
                onChange={(e) => setForm({ ...form, dimse_port: Number(e.target.value) })}
              />
            </div>
            <div className="form-field full-width">
              <label>
                <input
                  type="checkbox"
                  checked={form.dimse_promiscuous_mode}
                  onChange={(e) => setForm({ ...form, dimse_promiscuous_mode: e.target.checked })}
                />{" "}
                Promiscuous Mode (accept unknown calling AE Titles)
              </label>
              <p style={{ fontSize: "0.8rem", color: "#64748b", margin: "0.25rem 0 0" }}>
                Disabled by default. Enabling allows connections from unregistered modalities without prior registration.
                All associations are logged for audit.
              </p>
            </div>
          </div>

          <h3>Processing</h3>
          <div className="form-grid">
            <div className="form-field">
              <label>Max Retries</label>
              <input
                type="number"
                min={0}
                max={10}
                value={form.celery_max_retries}
                onChange={(e) => setForm({ ...form, celery_max_retries: Number(e.target.value) })}
              />
            </div>
            <div className="form-field">
              <label>Routing Worker Concurrency</label>
              <input
                type="number"
                min={1}
                max={32}
                value={form.celery_routing_concurrency}
                onChange={(e) => setForm({ ...form, celery_routing_concurrency: Number(e.target.value) })}
              />
            </div>
            <div className="form-field">
              <label>Migration Worker Concurrency</label>
              <input
                type="number"
                min={1}
                max={32}
                value={form.celery_migration_concurrency}
                onChange={(e) => setForm({ ...form, celery_migration_concurrency: Number(e.target.value) })}
              />
            </div>
            <div className="form-field">
              <label>Logging Level</label>
              <select
                value={form.logging_level}
                onChange={(e) => setForm({ ...form, logging_level: e.target.value })}
              >
                <option value="DEBUG">DEBUG</option>
                <option value="INFO">INFO</option>
                <option value="WARNING">WARNING</option>
                <option value="ERROR">ERROR</option>
              </select>
            </div>
          </div>

          <div className="form-actions">
            <button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
