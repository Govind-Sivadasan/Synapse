import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Play, Square, RefreshCw, Copy, Trash2 } from "lucide-react";
import { apiFetch } from "../api/client";
import DataTable from "../components/DataTable";
import Modal from "../components/Modal";
import PageHeader from "../components/ui/PageHeader";
import StatusBadge from "../components/ui/StatusBadge";
import { PageLoading } from "../components/ui/LoadingScreen";
import AutoDismissAlert from "../components/ui/AutoDismissAlert";
import TableSearch from "../components/ui/TableSearch";
import { useConfirmDialog } from "../hooks/useConfirmDialog";
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

type JobForm = typeof emptyForm;

function jobFormFromJob(job: MigrationJob): JobForm {
  const config = (job.job_config ?? {}) as Record<string, unknown>;
  const filters = (config.filters ?? {}) as Record<string, unknown>;
  const studyUids = Array.isArray(filters.study_uids)
    ? (filters.study_uids as string[]).join("\n")
    : "";
  const morphIds = Array.isArray(config.tag_morphing_rule_ids)
    ? (config.tag_morphing_rule_ids as string[])
    : [];

  return {
    name: `${job.name} (copy)`,
    source_node_id: job.source_node_id,
    destination_node_id: job.destination_node_id,
    job_type: job.job_type,
    modality: String(filters.modality ?? ""),
    patient_id: String(filters.patient_id ?? ""),
    date_from: String(filters.date_from ?? ""),
    date_to: String(filters.date_to ?? ""),
    study_uids: studyUids,
    tag_morphing_rule_ids: morphIds,
  };
}

function canDeleteJob(job: MigrationJob): boolean {
  return job.status !== "in_progress";
}

function formatTimestamp(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function JobConfigurationPanel({
  job,
  morphRules,
}: {
  job: MigrationJob;
  morphRules: TagMorphingRule[];
}) {
  const config = (job.job_config ?? {}) as Record<string, unknown>;
  const filters = (config.filters ?? {}) as Record<string, unknown>;
  const morphIds = Array.isArray(config.tag_morphing_rule_ids)
    ? (config.tag_morphing_rule_ids as string[])
    : [];
  const morphLabels = morphIds.map(
    (id) => morphRules.find((r) => r.id === id)?.name ?? id,
  );
  const studyUids = Array.isArray(filters.study_uids) ? (filters.study_uids as string[]) : [];

  const filterItems: { label: string; value: string }[] = [];
  if (job.job_type === "batch") {
    filterItems.push({
      label: "Study UIDs",
      value: studyUids.length ? `${studyUids.length} specified` : "None",
    });
  } else {
    if (filters.modality) filterItems.push({ label: "Modality", value: String(filters.modality) });
    if (filters.patient_id) filterItems.push({ label: "Patient ID", value: String(filters.patient_id) });
    if (filters.date_from) filterItems.push({ label: "Date from", value: String(filters.date_from) });
    if (filters.date_to) filterItems.push({ label: "Date to", value: String(filters.date_to) });
    if (!filterItems.length) filterItems.push({ label: "Filters", value: "None (all matching studies)" });
  }

  return (
    <div className="job-config-panel">
      <h4>Job configuration</h4>
      <div className="job-config-grid">
        <div className="job-config-item">
          <span>Job type</span>
          <strong>{job.job_type}</strong>
        </div>
        <div className="job-config-item">
          <span>Source</span>
          <strong>{job.source_node_name ?? job.source_node_id}</strong>
        </div>
        <div className="job-config-item">
          <span>Destination</span>
          <strong>{job.destination_node_name ?? job.destination_node_id}</strong>
        </div>
        {filterItems.map((item) => (
          <div key={item.label} className="job-config-item">
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
        {config.qido_limit != null && (
          <div className="job-config-item">
            <span>QIDO limit</span>
            <strong>{String(config.qido_limit)}</strong>
          </div>
        )}
        <div className="job-config-item">
          <span>Tag morphing</span>
          <strong>{morphLabels.length ? morphLabels.join(", ") : "None"}</strong>
        </div>
        <div className="job-config-item">
          <span>Created by</span>
          <strong>{job.created_by}</strong>
        </div>
        <div className="job-config-item">
          <span>Created at</span>
          <strong>{formatTimestamp(job.created_at)}</strong>
        </div>
        <div className="job-config-item">
          <span>Started</span>
          <strong>{formatTimestamp(job.start_time)}</strong>
        </div>
        <div className="job-config-item">
          <span>Finished</span>
          <strong>{formatTimestamp(job.end_time)}</strong>
        </div>
        {job.celery_task_id && (
          <div className="job-config-item">
            <span>Celery task</span>
            <code>{job.celery_task_id}</code>
          </div>
        )}
      </div>
      {job.job_type === "batch" && studyUids.length > 0 && (
        <div className="job-config-item" style={{ marginTop: "0.75rem" }}>
          <span>Study UID list</span>
          <code style={{ display: "block", whiteSpace: "pre-wrap", fontSize: "0.75rem" }}>
            {studyUids.join("\n")}
          </code>
        </div>
      )}
      <p className="job-config-note">
        {job.status === "in_progress"
          ? "Configuration is locked while the job is running."
          : "Configuration is immutable after creation. Use Duplicate to create a new job with modified settings."}
      </p>
    </div>
  );
}

function progressPct(job: MigrationJob): number {
  const total = job.total_studies ?? 0;
  if (!total) return 0;
  return Math.round(((job.completed_studies + job.failed_studies) / total) * 100);
}

export default function MigrationJobs() {
  const queryClient = useQueryClient();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [modalOpen, setModalOpen] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [selectedJob, setSelectedJob] = useState<MigrationJob | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [jobsSearch, setJobsSearch] = useState("");
  const [jobsPage, setJobsPage] = useState(0);
  const [studiesSearch, setStudiesSearch] = useState("");
  const [studiesPage, setStudiesPage] = useState(0);
  const jobsPageSize = 10;
  const studiesPageSize = 15;

  useEffect(() => {
    setJobsPage(0);
  }, [jobsSearch]);

  useEffect(() => {
    setStudiesPage(0);
  }, [studiesSearch, selectedJob?.id]);

  const { data: jobsData, isLoading } = useQuery({
    queryKey: ["migration-jobs", jobsSearch, jobsPage],
    queryFn: () => {
      const params = new URLSearchParams({
        limit: String(jobsPageSize),
        offset: String(jobsPage * jobsPageSize),
      });
      if (jobsSearch) params.set("search", jobsSearch);
      return apiFetch<MigrationJobList>(`/api/v1/migration-jobs?${params}`);
    },
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
    queryKey: ["migration-job-studies", selectedJob?.id, studiesSearch, studiesPage],
    queryFn: () => {
      const params = new URLSearchParams({
        limit: String(studiesPageSize),
        offset: String(studiesPage * studiesPageSize),
      });
      if (studiesSearch) params.set("search", studiesSearch);
      return apiFetch<MigrationStudyList>(`/api/v1/migration-jobs/${selectedJob!.id}/studies?${params}`);
    },
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

  const openNewJobModal = () => {
    setError("");
    setIsDuplicating(false);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const duplicateJob = (job: MigrationJob) => {
    setError("");
    setIsDuplicating(true);
    setForm(jobFormFromJob(job));
    setModalOpen(true);
  };

  const createMutation = useMutation({
    mutationFn: (payload: object) =>
      apiFetch<MigrationJob>("/api/v1/migration-jobs", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["migration-jobs"] });
      setModalOpen(false);
      setForm(emptyForm);
      setIsDuplicating(false);
      setError("");
    },
    onError: (err: Error) => setError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/v1/migration-jobs/${id}`, { method: "DELETE" }),
    onSuccess: (_, jobId) => {
      setActionError(null);
      setActionSuccess("Migration job deleted.");
      if (selectedJob?.id === jobId) setSelectedJob(null);
      queryClient.invalidateQueries({ queryKey: ["migration-jobs"] });
    },
    onError: (err: Error) => {
      setActionSuccess(null);
      setActionError(err.message);
    },
  });

  const confirmDeleteJob = (job: MigrationJob) => {
    const studyCount = job.total_studies ?? 0;
    confirm({
      title: "Delete migration job",
      message: (
        <>
          <p>
            Delete <strong>{job.name}</strong>?
          </p>
          <p>
            {studyCount > 0
              ? `This removes the job and ${studyCount} study record${studyCount === 1 ? "" : "s"}.`
              : "This removes the job record."}
          </p>
          <p>Audit log entries are preserved.</p>
        </>
      ),
      confirmLabel: "Delete",
      onConfirm: () => deleteMutation.mutate(job.id),
    });
  };

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
          <button type="button" onClick={openNewJobModal}>
            <Plus size={16} />
            New Job
          </button>
        }
      />

      {actionSuccess && (
        <AutoDismissAlert variant="success" onDismiss={() => setActionSuccess(null)}>
          {actionSuccess}
        </AutoDismissAlert>
      )}

      {actionError && (
        <AutoDismissAlert variant="error" onDismiss={() => setActionError(null)}>
          {actionError}
        </AutoDismissAlert>
      )}

      {isLoading ? (
        <PageLoading label="Loading migration jobs…" />
      ) : (
        <div className="card">
          <TableSearch
            value={jobsSearch}
            onChange={setJobsSearch}
            placeholder="Search jobs by name, type, status…"
          />
          <DataTable
            data={jobs}
            keyField="id"
            emptyMessage="No migration jobs yet. Create one to migrate studies from on-prem to cloud."
            serverPagination={{
              page: jobsPage,
              pageSize: jobsPageSize,
              total: jobsData?.total ?? 0,
              onPageChange: setJobsPage,
            }}
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
                      <button
                        type="button"
                        className="btn-sm btn-secondary"
                        title="Create a new job from this configuration"
                        onClick={() => duplicateJob(j)}
                      >
                        <Copy size={14} />
                        Duplicate
                      </button>
                      {canDeleteJob(j) && (
                        <button
                          type="button"
                          className="btn-sm btn-danger"
                          disabled={deleteMutation.isPending}
                          title="Remove job and study records"
                          onClick={() => confirmDeleteJob(j)}
                        >
                          <Trash2 size={14} />
                          Delete
                        </button>
                      )}
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

          <JobConfigurationPanel job={displayJob} morphRules={morphRules} />

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
            <button
              type="button"
              className="btn-secondary"
              title="Create a new job from this configuration"
              onClick={() => duplicateJob(displayJob)}
            >
              <Copy size={16} />
              Duplicate
            </button>
            {canDeleteJob(displayJob) && (
              <button
                type="button"
                className="btn-danger"
                disabled={deleteMutation.isPending}
                onClick={() => confirmDeleteJob(displayJob)}
              >
                <Trash2 size={16} />
                Delete
              </button>
            )}
            <button type="button" className="btn-secondary" onClick={() => refetchStudies()}>
              <RefreshCw size={16} />
              Refresh studies
            </button>
          </div>

          <h4 className="card-title">Study records</h4>

          {studiesError && (
            <AutoDismissAlert variant="error" style={{ marginBottom: "1rem" }}>
              Failed to load studies: {(studiesError as Error).message}
            </AutoDismissAlert>
          )}

          <TableSearch
            value={studiesSearch}
            onChange={setStudiesSearch}
            placeholder="Search study UID, patient, modality…"
          />

          {studiesLoading ? (
            <PageLoading label="Loading studies…" />
          ) : (
            <DataTable
              data={studiesData?.items ?? []}
              keyField="id"
              serverPagination={{
                page: studiesPage,
                pageSize: studiesPageSize,
                total: studiesData?.total ?? 0,
                onPageChange: setStudiesPage,
              }}
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

      <Modal
        title={isDuplicating ? "Duplicate Migration Job" : "New Migration Job"}
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setIsDuplicating(false);
          setForm(emptyForm);
        }}
        wide
      >
        {error && (
          <AutoDismissAlert variant="error" onDismiss={() => setError("")}>
            {error}
          </AutoDismissAlert>
        )}
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
              {createMutation.isPending
                ? "Creating…"
                : isDuplicating
                  ? "Create Duplicate"
                  : "Create Job"}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setModalOpen(false);
                setIsDuplicating(false);
                setForm(emptyForm);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog loading={deleteMutation.isPending} />
    </div>
  );
}
