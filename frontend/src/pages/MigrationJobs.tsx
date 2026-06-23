import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Play, Square, RefreshCw, Copy, Trash2, Pause } from "lucide-react";
import { apiFetch } from "../api/client";
import DataTable from "../components/DataTable";
import RowActionsMenu, { RowActionItem } from "../components/table/RowActionsMenu";
import FilterChips from "../components/ui/FilterChips";
import Modal from "../components/Modal";
import DestinationNodePicker from "../components/nodes/DestinationNodePicker";
import NodeSelectField from "../components/nodes/NodeSelectField";
import TagMorphingRulePicker from "../components/tagMorphing/TagMorphingRulePicker";
import ActionButton from "../components/ui/ActionButton";
import PageHeader from "../components/ui/PageHeader";
import StatusBadge from "../components/ui/StatusBadge";
import StudyProgressRing from "../components/ui/StudyProgressRing";
import { PageLoading } from "../components/ui/LoadingScreen";
import { useConfirmDialog } from "../hooks/useConfirmDialog";
import { useAppMetadata } from "../hooks/useAppMetadata";
import { formatNotificationMessage } from "../lib/notificationMessages";
import { useNotifications } from "../services/notifications";
import { isSameNodePair, migrationSourceNodes, SAME_NODE_PAIR_MESSAGE } from "../lib/nodes";
import { migrationJobNames } from "../lib/migrationJobNames";
import JobProgressBreakdown from "../components/migration/JobProgressBreakdown";
import MigrationQueueWidget from "../components/migration/MigrationQueueWidget";
import ThroughputSparkChart from "../components/migration/ThroughputSparkChart";
import ModalitySelect from "../components/forms/ModalitySelect";
import { MigrationJob, MigrationJobList, MigrationJobProgress, MigrationJobThroughput, MigrationStudyList, Node, TagMorphingRule } from "../types/api";

const emptyForm: JobForm = {
  name: "",
  source_node_id: "",
  destination_node_ids: [],
  job_type: "historical",
  modality: "",
  patient_id: "",
  date_from: "",
  date_to: "",
  study_uids: "",
  tag_morphing_rule_ids: [],
};

type JobForm = {
  name: string;
  source_node_id: string;
  destination_node_ids: string[];
  job_type: "historical" | "batch" | "incremental";
  modality: string;
  patient_id: string;
  date_from: string;
  date_to: string;
  study_uids: string;
  tag_morphing_rule_ids: string[];
};

const JOB_STATUS_FILTERS = [
  { value: "", label: "All jobs", tone: "neutral" as const },
  { value: "discovering", label: "Discovering", tone: "info" as const },
  { value: "in_progress", label: "In progress", tone: "info" as const },
  { value: "paused", label: "Paused", tone: "warning" as const },
  { value: "failed", label: "Failed", tone: "error" as const },
  { value: "partial", label: "Partial", tone: "warning" as const },
  { value: "completed", label: "Completed", tone: "success" as const },
  { value: "not_started", label: "Not started", tone: "neutral" as const },
];

const STUDY_STATUS_FILTERS = [
  { value: "", label: "All studies", tone: "neutral" as const },
  { value: "failed", label: "Failed", tone: "error" as const },
  { value: "skipped", label: "Skipped", tone: "neutral" as const },
  { value: "success", label: "Success", tone: "success" as const },
  { value: "pending", label: "Pending", tone: "warning" as const },
];

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
    destination_node_ids: [job.destination_node_id],
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
  return job.status !== "in_progress" && job.status !== "discovering" && job.status !== "paused";
}

function isJobActive(job: MigrationJob): boolean {
  return job.status === "in_progress" || job.status === "discovering" || job.status === "paused";
}

function isJobRunning(job: MigrationJob): boolean {
  return job.status === "in_progress" || job.status === "discovering";
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
        {isJobActive(job)
          ? "Configuration is locked while the job is running."
          : "Configuration is immutable after creation. Use Duplicate to create a new job with modified settings."}
      </p>
    </div>
  );
}

function processedStudies(job: MigrationJob): number {
  const total = job.total_studies ?? 0;
  const raw = job.completed_studies + job.failed_studies;
  return total > 0 ? Math.min(raw, total) : raw;
}

function progressPct(job: MigrationJob): number {
  const total = job.total_studies ?? 0;
  if (!total) return 0;
  return Math.min(100, Math.round((processedStudies(job) / total) * 100));
}

function displayedFailedStudies(job: MigrationJob): number {
  const total = job.total_studies ?? 0;
  if (!total) return job.failed_studies;
  return Math.min(job.failed_studies, Math.max(0, total - job.completed_studies));
}

function JobProgressCell({ job }: { job: MigrationJob }) {
  const total = job.total_studies ?? 0;
  const active = isJobActive(job);
  const discovering = job.status === "discovering";
  const processed = processedStudies(job);
  let label: string;
  if (discovering && !total) {
    label = job.discovered_studies > 0
      ? `Discovering… (${job.discovered_studies} found)`
      : "Discovering…";
  } else if (!total && active) {
    label = "Discovering…";
  } else if (!total) {
    label = "—";
  } else {
    label = `${processed}/${total} (${progressPct(job)}%)`;
  }

  return (
    <div className="job-list-progress">
      <span className="job-list-progress-label">{label}</span>
      {active && (
        <div className="job-progress-bar job-progress-bar--compact">
          {!total ? (
            <div className="job-progress-fill job-progress-fill--indeterminate" />
          ) : (
            <div className="job-progress-fill" style={{ width: `${progressPct(job)}%` }} />
          )}
        </div>
      )}
    </div>
  );
}

export default function MigrationJobs() {
  const queryClient = useQueryClient();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const { success, error: notifyError } = useNotifications();
  const { data: metadata } = useAppMetadata();
  const [modalOpen, setModalOpen] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [selectedJob, setSelectedJob] = useState<MigrationJob | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [jobsSearch, setJobsSearch] = useState("");
  const [jobsStatusFilter, setJobsStatusFilter] = useState("");
  const [jobsPage, setJobsPage] = useState(0);
  const [jobsSortBy, setJobsSortBy] = useState<string | null>("created_at");
  const [jobsSortDir, setJobsSortDir] = useState<"asc" | "desc">("desc");
  const [studiesSearch, setStudiesSearch] = useState("");
  const [studiesStatusFilter, setStudiesStatusFilter] = useState("");
  const [studiesPage, setStudiesPage] = useState(0);
  const [studiesSortBy, setStudiesSortBy] = useState<string | null>("created_at");
  const [studiesSortDir, setStudiesSortDir] = useState<"asc" | "desc">("desc");
  const jobsPageSize = 10;
  const studiesPageSize = 15;

  useEffect(() => {
    setJobsPage(0);
  }, [jobsSearch, jobsStatusFilter, jobsSortBy, jobsSortDir]);

  useEffect(() => {
    setStudiesPage(0);
  }, [studiesSearch, studiesStatusFilter, selectedJob?.id, studiesSortBy, studiesSortDir]);

  const { data: jobsData, isLoading } = useQuery({
    queryKey: ["migration-jobs", jobsSearch, jobsStatusFilter, jobsPage, jobsSortBy, jobsSortDir],
    queryFn: () => {
      const params = new URLSearchParams({
        limit: String(jobsPageSize),
        offset: String(jobsPage * jobsPageSize),
      });
      if (jobsSearch) params.set("search", jobsSearch);
      if (jobsStatusFilter) params.set("status", jobsStatusFilter);
      if (jobsSortBy) {
        params.set("sort_by", jobsSortBy);
        params.set("sort_dir", jobsSortDir);
      }
      return apiFetch<MigrationJobList>(`/api/v1/migration-jobs?${params}`);
    },
    refetchInterval: (query) => {
      const hasActiveJob = query.state.data?.items.some((j) => isJobActive(j));
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
    refetchInterval: (query) => {
      const status = query.state.data?.status ?? selectedJob?.status;
      return status === "in_progress" || status === "discovering" || status === "paused" ? 3000 : false;
    },
  });

  const { data: jobProgress } = useQuery({
    queryKey: ["migration-job-progress", selectedJob?.id],
    queryFn: () => apiFetch<MigrationJobProgress>(`/api/v1/migration-jobs/${selectedJob!.id}/progress`),
    enabled: !!selectedJob,
    refetchInterval: selectedJob && isJobActive(selectedJob) ? 3000 : false,
  });

  const { data: jobThroughput } = useQuery({
    queryKey: ["migration-job-throughput", selectedJob?.id],
    queryFn: () => apiFetch<MigrationJobThroughput>(`/api/v1/migration-jobs/${selectedJob!.id}/throughput`),
    enabled: !!selectedJob,
    refetchInterval: selectedJob && isJobActive(selectedJob) ? 5000 : false,
  });

  const displayJob = jobDetail ?? selectedJob;

  const {
    data: studiesData,
    isLoading: studiesLoading,
    error: studiesError,
    refetch: refetchStudies,
  } = useQuery({
    queryKey: ["migration-job-studies", selectedJob?.id, studiesSearch, studiesStatusFilter, studiesPage, studiesSortBy, studiesSortDir],
    queryFn: () => {
      const params = new URLSearchParams({
        limit: String(studiesPageSize),
        offset: String(studiesPage * studiesPageSize),
      });
      if (studiesSearch) params.set("search", studiesSearch);
      if (studiesStatusFilter) params.set("status_filter", studiesStatusFilter);
      if (studiesSortBy) {
        params.set("sort_by", studiesSortBy);
        params.set("sort_dir", studiesSortDir);
      }
      return apiFetch<MigrationStudyList>(`/api/v1/migration-jobs/${selectedJob!.id}/studies?${params}`);
    },
    enabled: !!selectedJob,
    refetchInterval: displayJob && isJobActive(displayJob) ? 3000 : false,
  });

  const lastStudiesError = useRef<string | null>(null);
  useEffect(() => {
    if (!studiesError) {
      lastStudiesError.current = null;
      return;
    }
    const message = formatNotificationMessage((studiesError as Error).message);
    const full = `Failed to load studies: ${message}`;
    if (lastStudiesError.current === full) return;
    lastStudiesError.current = full;
    notifyError(full);
  }, [studiesError, notifyError]);

  const openJobDetails = (job: MigrationJob) => {
    setSelectedJob(job);
    queryClient.invalidateQueries({ queryKey: ["migration-job", job.id] });
    queryClient.invalidateQueries({ queryKey: ["migration-job-studies", job.id] });
  };

  const sources = migrationSourceNodes(nodes);
  const jobTypes = metadata?.migration_job_types ?? [
    { value: "historical", label: "Historical (QIDO filter)" },
    { value: "incremental", label: "Incremental (date filter)" },
    { value: "batch", label: "Batch (explicit Study UIDs)" },
  ];

  const openNewJobModal = async () => {
    await queryClient.refetchQueries({ queryKey: ["nodes"] });
    setIsDuplicating(false);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const duplicateJob = async (job: MigrationJob) => {
    await queryClient.refetchQueries({ queryKey: ["nodes"] });
    setIsDuplicating(true);
    setForm(jobFormFromJob(job));
    setModalOpen(true);
  };

  const createMutation = useMutation({
    mutationFn: async (form: JobForm) => {
      const studyUids = form.study_uids
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const destinationIds = form.destination_node_ids.filter(
        (id) => id && id !== form.source_node_id,
      );
      const names = migrationJobNames(form.name, destinationIds.length);
      const jobConfig = {
        filters: {
          modality: form.modality || null,
          patient_id: form.patient_id || null,
          date_from: form.date_from || null,
          date_to: form.date_to || null,
          study_uids: form.job_type === "batch" && studyUids.length ? studyUids : null,
        },
        tag_morphing_rule_ids: form.tag_morphing_rule_ids.length ? form.tag_morphing_rule_ids : null,
      };

      const created: MigrationJob[] = [];
      for (let index = 0; index < destinationIds.length; index += 1) {
        const job = await apiFetch<MigrationJob>("/api/v1/migration-jobs", {
          method: "POST",
          body: JSON.stringify({
            name: names[index],
            source_node_id: form.source_node_id,
            destination_node_id: destinationIds[index],
            job_type: form.job_type,
            job_config: jobConfig,
          }),
        });
        created.push(job);
      }
      return created;
    },
    onSuccess: (jobs) => {
      queryClient.invalidateQueries({ queryKey: ["migration-jobs"] });
      setModalOpen(false);
      setForm(emptyForm);
      setIsDuplicating(false);
      success(
        jobs.length === 1
          ? `Migration job “${jobs[0].name}” created.`
          : `Created ${jobs.length} migration jobs (${jobs.map((job) => job.name).join(", ")}).`,
      );
    },
    onError: (err: Error) => notifyError(formatNotificationMessage(err.message)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/v1/migration-jobs/${id}`, { method: "DELETE" }),
    onSuccess: (_, jobId) => {
      success("Migration job deleted.");
      if (selectedJob?.id === jobId) setSelectedJob(null);
      queryClient.invalidateQueries({ queryKey: ["migration-jobs"] });
    },
    onError: (err: Error) => {
      notifyError(err.message);
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
    queryClient.setQueriesData<MigrationJobList>({ queryKey: ["migration-jobs"] }, (old) => {
      if (!old) return old;
      return {
        ...old,
        items: old.items.map((j) => (j.id === jobId ? { ...j, ...patch } : j)),
      };
    });
    queryClient.setQueryData<MigrationJob>(["migration-job", jobId], (old) =>
      old ? { ...old, ...patch } : old,
    );
    setSelectedJob((prev) => (prev?.id === jobId ? { ...prev, ...patch } : prev));
  };

  const startMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch<MigrationJob>(`/api/v1/migration-jobs/${id}/start`, { method: "POST" }),
    onMutate: (id) => {
      success("Starting migration job…");
      patchJobInCache(id, { status: "discovering" });
    },
    onSuccess: (job) => {
      patchJobInCache(job.id, job);
      setSelectedJob((prev) => (prev?.id === job.id ? job : prev));
      queryClient.invalidateQueries({ queryKey: ["migration-job-studies", job.id] });
      queryClient.invalidateQueries({ queryKey: ["migration-jobs"] });
    },
    onError: (err: Error, id) => {
      notifyError(err.message);
      queryClient.invalidateQueries({ queryKey: ["migration-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["migration-job", id] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch<MigrationJob>(`/api/v1/migration-jobs/${id}/cancel`, { method: "POST" }),
    onSuccess: (job) => {
      patchJobInCache(job.id, job);
      setSelectedJob((prev) => (prev?.id === job.id ? job : prev));
      queryClient.invalidateQueries({ queryKey: ["migration-jobs"] });
    },
    onError: (err: Error) => {
      notifyError(err.message);
      queryClient.invalidateQueries({ queryKey: ["migration-jobs"] });
    },
  });

  const pauseMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch<MigrationJob>(`/api/v1/migration-jobs/${id}/pause`, { method: "POST" }),
    onSuccess: (job) => {
      patchJobInCache(job.id, job);
      setSelectedJob((prev) => (prev?.id === job.id ? job : prev));
      queryClient.invalidateQueries({ queryKey: ["migration-jobs"] });
      success("Migration job paused.");
    },
    onError: (err: Error) => notifyError(err.message),
  });

  const resumeMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch<MigrationJob>(`/api/v1/migration-jobs/${id}/resume`, { method: "POST" }),
    onSuccess: (job) => {
      patchJobInCache(job.id, job);
      setSelectedJob((prev) => (prev?.id === job.id ? job : prev));
      queryClient.invalidateQueries({ queryKey: ["migration-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["migration-job-progress", job.id] });
      success("Migration job resumed.");
    },
    onError: (err: Error) => notifyError(err.message),
  });

  const retryStudyMutation = useMutation({
    mutationFn: ({ jobId, studyId }: { jobId: string; studyId: string }) =>
      apiFetch(`/api/v1/migration-jobs/${jobId}/studies/${studyId}/retry`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["migration-job-studies", selectedJob?.id] });
      queryClient.invalidateQueries({ queryKey: ["migration-jobs"] });
    },
  });

  const retryAllFailedMutation = useMutation({
    mutationFn: (jobId: string) =>
      apiFetch<{ enqueued: number; study_uids: string[]; remaining: number; limit: number }>(
        `/api/v1/migration-jobs/${jobId}/studies/retry-failed`,
        { method: "POST" },
      ),
    onMutate: (jobId) => {
      success("Queuing retries for failed studies…");
      patchJobInCache(jobId, { status: "in_progress" });
    },
    onSuccess: (result, jobId) => {
      if (result.enqueued === 0) {
        notifyError("No failed or pending studies to retry.");
      } else {
        const remainingNote =
          result.remaining > 0 ? ` (${result.remaining} remaining — run again to continue)` : "";
        success(
          `Retry queued for ${result.enqueued} study record${result.enqueued === 1 ? "" : "s"}${remainingNote}.`,
        );
      }
      patchJobInCache(jobId, { status: "in_progress" });
      queryClient.invalidateQueries({ queryKey: ["migration-job-studies", jobId] });
      queryClient.invalidateQueries({ queryKey: ["migration-job", jobId] });
      queryClient.invalidateQueries({ queryKey: ["migration-jobs"] });
    },
    onError: (err: Error) => {
      notifyError(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const destinationIds = form.destination_node_ids.filter(
      (id) => id && id !== form.source_node_id,
    );
    if (destinationIds.length === 0) {
      notifyError("Select at least one destination PACS.");
      return;
    }
    if (destinationIds.some((id) => isSameNodePair(form.source_node_id, id))) {
      notifyError(SAME_NODE_PAIR_MESSAGE);
      return;
    }
    createMutation.mutate(form);
  };

  const jobs = jobsData?.items ?? [];
  const isStarting = (id: string) => startMutation.isPending && startMutation.variables === id;
  const isCancelling = (id: string) => cancelMutation.isPending && cancelMutation.variables === id;
  const isPausing = (id: string) => pauseMutation.isPending && pauseMutation.variables === id;
  const isResuming = (id: string) => resumeMutation.isPending && resumeMutation.variables === id;

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
          <ActionButton icon={<Plus size={16} />} onClick={openNewJobModal}>
            New Job
          </ActionButton>
        }
      />

      <MigrationQueueWidget />

      {isLoading ? (
        <PageLoading label="Loading migration jobs…" />
      ) : (
        <div className="card">
          <FilterChips
            label="Job status"
            options={JOB_STATUS_FILTERS}
            value={jobsStatusFilter}
            onChange={setJobsStatusFilter}
          />
          <DataTable
            tableId="migration-jobs"
            data={jobs}
            keyField="id"
            searchable
            onRowClick={openJobDetails}
            selectedRowId={selectedJob?.id ?? null}
            searchValue={jobsSearch}
            onSearchChange={setJobsSearch}
            searchPlaceholder="Search jobs by name, type, status…"
            emptyMessage="No migration jobs yet. Create one to migrate studies from on-prem to cloud."
            serverSort={{
              sortBy: jobsSortBy,
              sortDir: jobsSortDir,
              defaultSort: { sortBy: "created_at", sortDir: "desc" },
              onSortChange: (sortBy, sortDir) => {
                setJobsSortBy(sortBy ?? "created_at");
                setJobsSortDir(sortDir ?? "desc");
              },
            }}
            serverPagination={{
              page: jobsPage,
              pageSize: jobsPageSize,
              total: jobsData?.total ?? 0,
              onPageChange: setJobsPage,
            }}
            columns={[
              { key: "name", header: "Name", width: 200, minWidth: 120, sortKey: "name" },
              { key: "job_type", header: "Type", width: 110, minWidth: 88, sortKey: "job_type" },
              {
                key: "route",
                header: "Route",
                width: 300,
                minWidth: 180,
                sortable: false,
                render: (j) => {
                  const route = `${j.source_node_name ?? "?"} → ${j.destination_node_name ?? "?"}`;
                  return <span className="table-cell-route">{route}</span>;
                },
              },
              { key: "status", header: "Status", width: 130, minWidth: 110, sortKey: "status", render: (j) => <StatusBadge status={j.status} /> },
              { key: "progress", header: "Progress", width: 140, minWidth: 120, sortKey: "completed_studies", render: (j) => <JobProgressCell job={j} /> },
              { key: "failed", header: "Failed", width: 88, minWidth: 72, sortKey: "failed_studies", render: (j) => displayedFailedStudies(j) },
              {
                key: "actions",
                header: "Actions",
                width: 84,
                minWidth: 84,
                sortable: false,
                hideable: false,
                pinnable: false,
                render: (j) => {
                  const starting = isStarting(j.id);
                  const cancelling = isCancelling(j.id);
                  const canStart =
                    ["not_started", "failed", "partial", "cancelled"].includes(j.status) ||
                    (j.status === "completed" && (j.total_studies ?? 0) === 0);
                  const items: RowActionItem[] = [
                    {
                      key: "details",
                      label: "Details",
                      onClick: () => openJobDetails(j),
                    },
                  ];

                  if (starting) {
                    items.push({ key: "starting", label: "Starting…", disabled: true });
                  } else if (canStart) {
                    items.push({
                      key: "start",
                      label: j.status === "not_started" ? "Start" : "Resume",
                      icon: <Play size={14} />,
                      disabled: startMutation.isPending,
                      onClick: () => startMutation.mutate(j.id),
                    });
                  } else if (isJobRunning(j)) {
                    items.push(
                      {
                        key: "pause",
                        label: isPausing(j.id) ? "Pausing…" : "Pause",
                        icon: isPausing(j.id) ? undefined : <Pause size={14} />,
                        disabled: isPausing(j.id),
                        onClick: () => pauseMutation.mutate(j.id),
                      },
                      {
                        key: "cancel",
                        label: cancelling ? "Cancelling…" : "Cancel",
                        icon: cancelling ? undefined : <Square size={14} />,
                        disabled: cancelling,
                        onClick: () => cancelMutation.mutate(j.id),
                      },
                    );
                  } else if (j.status === "paused") {
                    items.push(
                      {
                        key: "resume",
                        label: isResuming(j.id) ? "Resuming…" : "Resume",
                        icon: isResuming(j.id) ? undefined : <Play size={14} />,
                        disabled: isResuming(j.id),
                        onClick: () => resumeMutation.mutate(j.id),
                      },
                      {
                        key: "cancel",
                        label: cancelling ? "Cancelling…" : "Cancel",
                        icon: <Square size={14} />,
                        disabled: cancelling,
                        onClick: () => cancelMutation.mutate(j.id),
                      },
                    );
                  }

                  items.push({
                    key: "duplicate",
                    label: "Duplicate",
                    icon: <Copy size={14} />,
                    onClick: () => duplicateJob(j),
                  });

                  if (canDeleteJob(j)) {
                    items.push({
                      key: "delete",
                      label: "Delete",
                      icon: <Trash2 size={14} />,
                      danger: true,
                      disabled: deleteMutation.isPending,
                      onClick: () => confirmDeleteJob(j),
                    });
                  }

                  return <RowActionsMenu items={items} ariaLabel={`Actions for ${j.name}`} />;
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

          {jobProgress && (
            <div className="job-detail-section">
              <h4 className="card-title">Pipeline progress</h4>
              <JobProgressBreakdown progress={jobProgress} />
            </div>
          )}

          {jobThroughput && isJobActive(displayJob) && (
            <div className="migration-throughput-panel">
              <h4 className="card-title">Throughput (last 30 min)</h4>
              <div className="migration-throughput-metrics">
                <div className="job-detail-stat">
                  <span>Studies / min</span>
                  <strong>{jobThroughput.studies_per_minute.toFixed(1)}</strong>
                </div>
                <div className="job-detail-stat">
                  <span>MB / s</span>
                  <strong>{jobThroughput.megabytes_per_second.toFixed(2)}</strong>
                </div>
                <div className="job-detail-stat">
                  <span>Transferred</span>
                  <strong>
                    {(jobThroughput.bytes_transferred / (1024 * 1024)).toFixed(1)} MB
                  </strong>
                </div>
              </div>
              <div className="migration-throughput-charts">
                <div>
                  <p className="migration-throughput-chart-label">Studies per minute</p>
                  <ThroughputSparkChart samples={jobThroughput.samples} metric="studies" />
                </div>
                <div>
                  <p className="migration-throughput-chart-label">Megabytes per second</p>
                  <ThroughputSparkChart samples={jobThroughput.samples} metric="bytes" />
                </div>
              </div>
            </div>
          )}

          {(displayJob.failed_studies > 0 || displayJob.status === "failed" || displayJob.status === "partial") && (
            <div className="job-failure-banner">
              <strong>
                {displayJob.failed_studies} failed study{displayJob.failed_studies === 1 ? "" : "ies"}
              </strong>
              {displayJob.status === "failed" || displayJob.status === "partial" ? (
                <>
                  {" "}
                  — use <strong>Resume</strong> or <strong>Retry all failed</strong> below, or filter study records
                  and retry individually.
                </>
              ) : (
                <> — use <strong>Retry all failed</strong> or filter by Failed below.</>
              )}
            </div>
          )}

          <JobConfigurationPanel job={displayJob} morphRules={morphRules} />

          <div className="job-detail-actions">
            {(["not_started", "failed", "partial", "cancelled"].includes(displayJob.status) ||
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
            {isJobRunning(displayJob) && (
              <>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={isPausing(displayJob.id)}
                  onClick={() => pauseMutation.mutate(displayJob.id)}
                >
                  {isPausing(displayJob.id) ? (
                    <Loader2 size={16} className="spin-icon" />
                  ) : (
                    <Pause size={16} />
                  )}
                  Pause
                </button>
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
              </>
            )}
            {displayJob.status === "paused" && (
              <>
                <button
                  type="button"
                  disabled={isResuming(displayJob.id)}
                  onClick={() => resumeMutation.mutate(displayJob.id)}
                >
                  {isResuming(displayJob.id) ? (
                    <Loader2 size={16} className="spin-icon" />
                  ) : (
                    <Play size={16} />
                  )}
                  Resume
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={isCancelling(displayJob.id)}
                  onClick={() => cancelMutation.mutate(displayJob.id)}
                >
                  <Square size={16} />
                  Cancel
                </button>
              </>
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
            {(displayJob.failed_studies > 0 || displayJob.status === "cancelled") && (
              <button
                type="button"
                className="btn-secondary"
                disabled={retryAllFailedMutation.isPending}
                onClick={() => retryAllFailedMutation.mutate(displayJob.id)}
              >
                {retryAllFailedMutation.isPending ? (
                  <Loader2 size={16} className="spin-icon" />
                ) : (
                  <RefreshCw size={16} />
                )}
                {displayJob.status === "cancelled" ? "Retry incomplete" : "Retry all failed"}
              </button>
            )}
          </div>

          <h4 className="card-title">Study records</h4>

          <FilterChips
            label="Study status"
            options={STUDY_STATUS_FILTERS}
            value={studiesStatusFilter}
            onChange={setStudiesStatusFilter}
          />

          {studiesLoading ? (
            <PageLoading label="Loading studies…" compact />
          ) : (
            <DataTable
              tableId="migration-job-studies"
              data={studiesData?.items ?? []}
              keyField="id"
              searchValue={studiesSearch}
              onSearchChange={setStudiesSearch}
              searchPlaceholder="Search study UID, patient, modality…"
              serverSort={{
                sortBy: studiesSortBy,
                sortDir: studiesSortDir,
                defaultSort: { sortBy: "created_at", sortDir: "desc" },
                onSortChange: (sortBy, sortDir) => {
                  setStudiesSortBy(sortBy ?? "created_at");
                  setStudiesSortDir(sortDir ?? "desc");
                },
              }}
              serverPagination={{
                page: studiesPage,
                pageSize: studiesPageSize,
                total: studiesData?.total ?? 0,
                onPageChange: setStudiesPage,
              }}
              emptyMessage={
                isJobActive(displayJob) || isStarting(displayJob.id)
                  ? "Discovering studies… records will appear shortly."
                  : "No studies discovered yet. Start the job to run QIDO-RS on the source PACS."
              }
              columns={[
                {
                  key: "study_uid",
                  header: "Study UID",
                  width: 340,
                  minWidth: 260,
                  sortKey: "study_uid",
                  render: (s) => (
                    <code className="table-cell-uid" title={s.study_uid}>
                      {s.study_uid}
                    </code>
                  ),
                },
                { key: "modality", header: "Modality", width: 90, minWidth: 72, sortKey: "modality" },
                { key: "patient_id", header: "Patient ID", width: 140, minWidth: 100, sortKey: "patient_id" },
                {
                  key: "status",
                  header: "Status",
                  width: 150,
                  minWidth: 130,
                  sortKey: "status",
                  render: (s) => (
                    <div className="study-status-cell">
                      <StudyProgressRing status={s.status} />
                      <StatusBadge status={s.status} dot={false} />
                    </div>
                  ),
                },
                {
                  key: "failure",
                  header: "Failure",
                  width: 220,
                  minWidth: 140,
                  sortable: false,
                  render: (s) => (
                    <span style={{ fontSize: "0.8125rem", color: "var(--color-error)" }}>
                      {s.failure_reason ?? "—"}
                    </span>
                  ),
                },
                {
                  key: "actions",
                  header: "Actions",
                  width: 84,
                  minWidth: 84,
                  sortable: false,
                  hideable: false,
                  pinnable: false,
                  render: (s) =>
                    s.status === "failed" || s.status === "skipped" ? (
                      <RowActionsMenu
                        ariaLabel={`Actions for study ${s.study_uid}`}
                        items={[
                          {
                            key: "retry",
                            label: retryStudyMutation.isPending ? "Retrying…" : "Retry",
                            icon: <RefreshCw size={14} />,
                            disabled: retryStudyMutation.isPending,
                            onClick: () =>
                              retryStudyMutation.mutate({ jobId: displayJob.id, studyId: s.id }),
                          },
                        ]}
                      />
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
                {jobTypes.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <NodeSelectField
              label="Source PACS"
              value={form.source_node_id}
              onChange={(source_node_id) =>
                setForm((prev) => ({
                  ...prev,
                  source_node_id,
                  destination_node_ids: prev.destination_node_ids.filter((id) => id !== source_node_id),
                }))
              }
              nodes={sources}
              nodeType="source"
              required
              excludeNodeId={form.destination_node_ids[0]}
              emptyHint="No active source nodes with a DICOMweb URL. Create one below or under Nodes."
            />
            <DestinationNodePicker
              variant="migration"
              nodes={nodes}
              selectedIds={form.destination_node_ids}
              onChange={(destination_node_ids) => setForm((prev) => ({ ...prev, destination_node_ids }))}
              excludeNodeIds={form.source_node_id ? [form.source_node_id] : []}
            />
            {form.job_type !== "batch" && (
              <>
                <ModalitySelect
                  label="Modality Filter"
                  value={form.modality}
                  onChange={(modality) => setForm({ ...form, modality })}
                />
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
            <TagMorphingRulePicker
              rules={morphRules}
              selectedIds={form.tag_morphing_rule_ids}
              onChange={(tag_morphing_rule_ids) => setForm({ ...form, tag_morphing_rule_ids })}
            />
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
