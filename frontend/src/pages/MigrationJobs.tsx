import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Play, Square, RefreshCw } from "lucide-react";
import { apiFetch } from "../api/client";
import DataTable from "../components/DataTable";
import Modal from "../components/Modal";
import PageHeader from "../components/ui/PageHeader";
import StatusBadge from "../components/ui/StatusBadge";
import { PageLoading } from "../components/ui/LoadingScreen";
import { MigrationJob, MigrationJobList, MigrationStudyList, Node, TagMorphingRule } from "../types/api";

const emptyForm = {
  name: "",
  source_node_id: "",
  destination_node_id: "",
  job_type: "historical" as const,
  modality: "",
  patient_id: "",
  date_from: "",
  date_to: "",
  study_uids: "",
  tag_morphing_rule_ids: [] as string[],
};

function progressPct(job: MigrationJob): number {
  const total = job.total_studies ?? 0;
  if (!total) return 0;
  return Math.round(((job.completed_studies + job.failed_studies) / total) * 100);
}

export default function MigrationJobs() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<MigrationJob | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: jobsData, isLoading } = useQuery({
    queryKey: ["migration-jobs"],
    queryFn: () => apiFetch<MigrationJobList>("/api/v1/migration-jobs"),
    refetchInterval: (query) => {
      const hasActiveJob = query.state.data?.items.some((j) => j.status === "in_progress");
      return hasActiveJob ? 3000 : 8000;
    },
  });

  const { data: nodes = [] } = useQuery({
    queryKey: ["nodes"],
    queryFn: () => apiFetch<Node[]>("/api/v1/nodes"),
  });

  const { data: morphRules = [] } = useQuery({
    queryKey: ["tag-morphing-rules"],
    queryFn: () => apiFetch<TagMorphingRule[]>("/api/v1/tag-morphing-rules"),
  });

  const { data: jobDetail } = useQuery({
    queryKey: ["migration-job", selectedJob?.id],
    queryFn: () => apiFetch<MigrationJob>(`/api/v1/migration-jobs/${selectedJob!.id}`),
    enabled: !!selectedJob,
    refetchInterval: selectedJob?.status === "in_progress" ? 3000 : false,
  });

  const displayJob = jobDetail ?? selectedJob;

  const {
    data: studiesData,
    isLoading: studiesLoading,
    error: studiesError,
    refetch: refetchStudies,
  } = useQuery({
    queryKey: ["migration-job-studies", selectedJob?.id],
    queryFn: () => apiFetch<MigrationStudyList>(`/api/v1/migration-jobs/${selectedJob!.id}/studies`),
    enabled: !!selectedJob,
    refetchInterval: displayJob?.status === "in_progress" ? 3000 : false,
  });

  const openJobDetails = (job: MigrationJob) => {
    setSelectedJob(job);
    queryClient.invalidateQueries({ queryKey: ["migration-job", job.id] });
    queryClient.invalidateQueries({ queryKey: ["migration-job-studies", job.id] });
  };

  const sources = nodes.filter((n) => n.is_active && n.dicomweb_url);
  const destinations = nodes.filter((n) => n.node_type === "destination" && n.is_active && n.dicomweb_url);

  const createMutation = useMutation({
    mutationFn: (payload: object) =>
      apiFetch<MigrationJob>("/api/v1/migration-jobs", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["migration-jobs"] });
      setModalOpen(false);
      setForm(emptyForm);
      setError("");
    },
    onError: (err: Error) => setError(err.message),
  });

  const patchJobInCache = (jobId: string, patch: Partial<MigrationJob>) => {
    queryClient.setQueryData<MigrationJobList>(["migration-jobs"], (old) => {
      if (!old) return old;
      return {
        ...old,
        items: old.items.map((j) => (j.id === jobId ? { ...j, ...patch } : j)),
      };
    });
    setSelectedJob((prev) => (prev?.id === jobId ? { ...prev, ...patch } : prev));
  };

  const startMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch<MigrationJob>(`/api/v1/migration-jobs/${id}/start`, { method: "POST" }),
    onSuccess: (job) => {
      setActionError(null);
      patchJobInCache(job.id, job);
      setSelectedJob((prev) => (prev?.id === job.id ? job : prev));
      queryClient.setQueryData<MigrationJobList>(["migration-jobs"], (old) => {
        if (!old) return old;
        return { ...old, items: old.items.map((j) => (j.id === job.id ? job : j)) };
      });
      queryClient.invalidateQueries({ queryKey: ["migration-job-studies", job.id] });
    },
    onError: (err: Error) => {
      setActionError(err.message);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch<MigrationJob>(`/api/v1/migration-jobs/${id}/cancel`, { method: "POST" }),
    onSuccess: (job) => {
      setActionError(null);
      patchJobInCache(job.id, job);
      setSelectedJob((prev) => (prev?.id === job.id ? job : prev));
      queryClient.invalidateQueries({ queryKey: ["migration-jobs"] });
    },
    onError: (err: Error) => {
      setActionError(err.message);
      queryClient.invalidateQueries({ queryKey: ["migration-jobs"] });
    },
  });

  const retryStudyMutation = useMutation({
    mutationFn: ({ jobId, studyId }: { jobId: string; studyId: string }) =>
      apiFetch(`/api/v1/migration-jobs/${jobId}/studies/${studyId}/retry`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["migration-job-studies", selectedJob?.id] });
      queryClient.invalidateQueries({ queryKey: ["migration-jobs"] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const studyUids = form.study_uids
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);

    createMutation.mutate({
      name: form.name,
      source_node_id: form.source_node_id,
      destination_node_id: form.destination_node_id,
      job_type: form.job_type,
      job_config: {
        filters: {
          modality: form.modality || null,
          patient_id: form.patient_id || null,
          date_from: form.date_from || null,
          date_to: form.date_to || null,
          study_uids: form.job_type === "batch" && studyUids.length ? studyUids : null,
        },
        tag_morphing_rule_ids: form.tag_morphing_rule_ids.length ? form.tag_morphing_rule_ids : null,
      },
    });
  };

  const jobs = jobsData?.items ?? [];
  const isStarting = (id: string) => startMutation.isPending && startMutation.variables === id;
  const isCancelling = (id: string) => cancelMutation.isPending && cancelMutation.variables === id;

  useEffect(() => {
    if (!selectedJob || !jobsData) return;
    const updated = jobsData.items.find((j) => j.id === selectedJob.id);
    if (updated && updated.updated_at !== selectedJob.updated_at) {
      setSelectedJob(updated);
    }
  }, [jobsData, selectedJob?.id, selectedJob?.updated_at]);

  return (
    <div>
      <PageHeader
        title="Migration Jobs"
        description="Bulk QIDO-RS discovery, WADO-RS retrieval, and STOW-RS delivery to cloud PACS."
        actions={
          <button type="button" onClick={() => { setError(""); setModalOpen(true); }}>
            <Plus size={16} />
            New Job
          </button>
        }
      />

      {actionError && (
        <div className="alert alert-error" style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
          <span>{actionError}</span>
          <button type="button" className="btn-sm btn-secondary" onClick={() => setActionError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {isLoading ? (
        <PageLoading label="Loading migration jobs…" />
      ) : (
        <div className="card">
          <DataTable
            data={jobs}
            keyField="id"
            emptyMessage="No migration jobs yet. Create one to migrate studies from on-prem to cloud."
            columns={[
              { key: "name", header: "Name" },
              { key: "job_type", header: "Type" },
              {
                key: "route",
                header: "Route",
                render: (j) => {
                  const route = `${j.source_node_name ?? "?"} → ${j.destination_node_name ?? "?"}`;
                  return (
                    <span className="table-cell-route" title={route}>
                      {route}
                    </span>
                  );
                },
              },
              {
                key: "status",
                header: "Status",
                render: (j) => <StatusBadge status={j.status} />,
              },
              {
                key: "progress",
                header: "Progress",
                render: (j) => {
                  const total = j.total_studies ?? 0;
                  if (!total && j.status === "in_progress") return "Discovering…";
                  if (!total && j.status === "not_started") return "—";
                  return `${j.completed_studies}/${total} (${progressPct(j)}%)`;
                },
              },
              {
                key: "failed",
                header: "Failed",
                render: (j) => j.failed_studies,
              },
              {
                key: "actions",
                header: "Actions",
                render: (j) => {
                  const starting = isStarting(j.id);
                  const cancelling = isCancelling(j.id);
                  const canStart =
                    ["not_started", "failed", "partial"].includes(j.status) ||
                    (j.status === "completed" && (j.total_studies ?? 0) === 0);

                  return (
                    <div className="table-actions">
                      <button
                        type="button"
                        className={`btn-sm ${selectedJob?.id === j.id ? "" : "btn-secondary"}`}
                        onClick={() => openJobDetails(j)}
                      >
                        Details
                      </button>
                      {starting ? (
                        <button type="button" className="btn-sm" disabled>
                          <Loader2 size={14} className="spin-icon" />
                          Starting…
                        </button>
                      ) : canStart ? (
                        <button
                          type="button"
                          className="btn-sm"
                          disabled={startMutation.isPending}
                          onClick={() => startMutation.mutate(j.id)}
                        >
                          <Play size={14} />
                          {j.status === "not_started" ? "Start" : "Resume"}
                        </button>
                      ) : j.status === "in_progress" ? (
                        <button
                          type="button"
                          className="btn-sm btn-secondary"
                          disabled={cancelling}
                          onClick={() => cancelMutation.mutate(j.id)}
                        >
                          {cancelling ? (
                            <Loader2 size={14} className="spin-icon" />
                          ) : (
                            <Square size={14} />
                          )}
                          {cancelling ? "Cancelling…" : "Cancel"}
                        </button>
                      ) : null}
                    </div>
                  );
                },
              },
            ]}
          />
        </div>
      )}

      {displayJob && (
        <Modal
          title={displayJob.name}
          open={!!selectedJob}
          onClose={() => setSelectedJob(null)}
          extraWide
        >
          <div style={{ marginBottom: "0.75rem" }}>
            <StatusBadge status={displayJob.status} />{" "}
            <span style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)" }}>
              {displayJob.job_type} · {displayJob.source_node_name ?? "?"} →{" "}
              {displayJob.destination_node_name ?? "?"}
            </span>
          </div>

          <div className="job-detail-summary">
            <div className="job-detail-stat">
              <span>Total studies</span>
              <strong>{displayJob.total_studies ?? 0}</strong>
            </div>
            <div className="job-detail-stat">
              <span>Completed</span>
              <strong>{displayJob.completed_studies}</strong>
            </div>
            <div className="job-detail-stat">
              <span>Failed</span>
              <strong>{displayJob.failed_studies}</strong>
            </div>
            <div className="job-detail-stat">
              <span>Progress</span>
              <strong>{progressPct(displayJob)}%</strong>
            </div>
          </div>

          {(displayJob.total_studies ?? 0) > 0 && (
            <div className="job-progress-bar">
              <div
                className="job-progress-fill"
                style={{ width: `${progressPct(displayJob)}%` }}
              />
            </div>
          )}

          <div className="job-detail-actions">
            {(["not_started", "failed", "partial"].includes(displayJob.status) ||
              (displayJob.status === "completed" && (displayJob.total_studies ?? 0) === 0)) && (
              <button
                type="button"
                disabled={isStarting(displayJob.id)}
                onClick={() => startMutation.mutate(displayJob.id)}
              >
                {isStarting(displayJob.id) ? (
                  <Loader2 size={16} className="spin-icon" />
                ) : (
                  <Play size={16} />
                )}
                {isStarting(displayJob.id)
                  ? "Starting…"
                  : displayJob.status === "not_started"
                    ? "Start"
                    : "Resume"}
              </button>
            )}
            {displayJob.status === "in_progress" && (
              <button
                type="button"
                className="btn-secondary"
                disabled={isCancelling(displayJob.id)}
                onClick={() => cancelMutation.mutate(displayJob.id)}
              >
                {isCancelling(displayJob.id) ? (
                  <Loader2 size={16} className="spin-icon" />
                ) : (
                  <Square size={16} />
                )}
                Cancel
              </button>
            )}
            <button type="button" className="btn-secondary" onClick={() => refetchStudies()}>
              <RefreshCw size={16} />
              Refresh studies
            </button>
          </div>

          <h4 className="card-title">Study records</h4>

          {studiesError && (
            <div className="alert alert-error" style={{ marginBottom: "1rem" }}>
              Failed to load studies: {(studiesError as Error).message}
            </div>
          )}

          {studiesLoading ? (
            <PageLoading label="Loading studies…" />
          ) : (
            <DataTable
              data={studiesData?.items ?? []}
              keyField="id"
              emptyMessage={
                displayJob.status === "in_progress" || isStarting(displayJob.id)
                  ? "Discovering studies… records will appear shortly."
                  : "No studies discovered yet. Start the job to run QIDO-RS on the source PACS."
              }
              columns={[
                {
                  key: "study_uid",
                  header: "Study UID",
                  render: (s) => <code>{s.study_uid}</code>,
                },
                { key: "modality", header: "Modality" },
                { key: "patient_id", header: "Patient ID" },
                {
                  key: "status",
                  header: "Status",
                  render: (s) => <StatusBadge status={s.status} />,
                },
                {
                  key: "failure",
                  header: "Failure",
                  render: (s) => (
                    <span style={{ fontSize: "0.8125rem", color: "var(--color-error)" }}>
                      {s.failure_reason ?? "—"}
                    </span>
                  ),
                },
                {
                  key: "actions",
                  header: "Actions",
                  render: (s) =>
                    s.status === "failed" ? (
                      <div className="table-actions">
                        <button
                          type="button"
                          className="btn-sm"
                          disabled={retryStudyMutation.isPending}
                          onClick={() =>
                            retryStudyMutation.mutate({ jobId: displayJob.id, studyId: s.id })
                          }
                        >
                          <RefreshCw size={14} />
                          Retry
                        </button>
                      </div>
                    ) : null,
                },
              ]}
            />
          )}
        </Modal>
      )}

      <Modal title="New Migration Job" open={modalOpen} onClose={() => setModalOpen(false)} wide>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="form-field full-width">
              <label>Job Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="On-prem CT historical migration"
                required
              />
            </div>
            <div className="form-field">
              <label>Job Type</label>
              <select
                value={form.job_type}
                onChange={(e) =>
                  setForm({ ...form, job_type: e.target.value as "historical" | "batch" | "incremental" })
                }
              >
                <option value="historical">Historical (QIDO filter)</option>
                <option value="incremental">Incremental (date filter)</option>
                <option value="batch">Batch (explicit Study UIDs)</option>
              </select>
            </div>
            <div className="form-field">
              <label>Source PACS</label>
              <select
                value={form.source_node_id}
                onChange={(e) => setForm({ ...form, source_node_id: e.target.value })}
                required
              >
                <option value="">Select source…</option>
                {sources.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label>Destination PACS</label>
              <select
                value={form.destination_node_id}
                onChange={(e) => setForm({ ...form, destination_node_id: e.target.value })}
                required
              >
                <option value="">Select destination…</option>
                {destinations.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </select>
            </div>
            {form.job_type !== "batch" && (
              <>
                <div className="form-field">
                  <label>Modality Filter</label>
                  <input
                    value={form.modality}
                    onChange={(e) => setForm({ ...form, modality: e.target.value })}
                    placeholder="CT"
                  />
                </div>
                <div className="form-field">
                  <label>Patient ID Filter</label>
                  <input
                    value={form.patient_id}
                    onChange={(e) => setForm({ ...form, patient_id: e.target.value })}
                  />
                </div>
                <div className="form-field">
                  <label>Date From (YYYYMMDD)</label>
                  <input
                    value={form.date_from}
                    onChange={(e) => setForm({ ...form, date_from: e.target.value })}
                    placeholder="20240101"
                  />
                </div>
                <div className="form-field">
                  <label>Date To (YYYYMMDD)</label>
                  <input
                    value={form.date_to}
                    onChange={(e) => setForm({ ...form, date_to: e.target.value })}
                    placeholder="20241231"
                  />
                </div>
              </>
            )}
            {form.job_type === "batch" && (
              <div className="form-field full-width">
                <label>Study UIDs (one per line or comma-separated)</label>
                <textarea
                  rows={4}
                  value={form.study_uids}
                  onChange={(e) => setForm({ ...form, study_uids: e.target.value })}
                  placeholder="1.2.840.113619.2.55.3.604688433.802.1715000000.123"
                  required
                />
              </div>
            )}
            <div className="form-field full-width">
              <label>Tag Morphing Rules (optional)</label>
              <div className="checkbox-group">
                {morphRules.filter((r) => r.is_active).map((r) => (
                  <label key={r.id}>
                    <input
                      type="checkbox"
                      checked={form.tag_morphing_rule_ids.includes(r.id)}
                      onChange={() => {
                        const ids = form.tag_morphing_rule_ids.includes(r.id)
                          ? form.tag_morphing_rule_ids.filter((id) => id !== r.id)
                          : [...form.tag_morphing_rule_ids, r.id];
                        setForm({ ...form, tag_morphing_rule_ids: ids });
                      }}
                    />
                    {r.name} ({r.target_tag} → {r.new_value})
                  </label>
                ))}
                {morphRules.length === 0 && (
                  <span style={{ fontSize: "0.875rem", color: "var(--color-text-muted)" }}>
                    No morphing rules configured.
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="form-actions">
            <button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating…" : "Create Job"}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
