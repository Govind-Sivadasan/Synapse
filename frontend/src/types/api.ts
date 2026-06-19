export interface Node {
  id: string;
  name: string;
  node_type: "source" | "destination";
  protocol: "DIMSE" | "DICOMweb";
  host: string;
  port: number | null;
  ae_title: string | null;
  dicomweb_url: string | null;
  auth_type: "none" | "basic" | "bearer" | "apikey" | null;
  auth_config: Record<string, string> | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface NodeEchoResult {
  success: boolean;
  protocol: string;
  message: string;
  status_code?: number | null;
  latency_ms?: number | null;
}

export interface RoutingRule {
  id: string;
  name: string;
  condition_tag: string;
  condition_operator: string;
  condition_value: string;
  destination_node_ids: string[];
  tag_morphing_rule_ids: string[] | null;
  priority: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TagMorphingRule {
  id: string;
  name: string;
  condition_tag: string | null;
  condition_operator: string | null;
  condition_value: string | null;
  target_tag: string;
  new_value: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SystemConfig {
  dimse_ae_title: string;
  dimse_port: number;
  dimse_promiscuous_mode: boolean;
  celery_max_retries: number;
  celery_routing_concurrency: number;
  celery_migration_concurrency: number;
  logging_level: string;
  audit_log_dimse: boolean;
  audit_log_routing: boolean;
  audit_log_tag_morphing: boolean;
  audit_log_migration: boolean;
  audit_log_chatbot: boolean;
  audit_include_phi: boolean;
  ollama_base_url: string;
  ollama_model: string;
  chatbot_enabled: boolean;
}

export interface AuditLog {
  id: string;
  event_type: string;
  user_id: string | null;
  username?: string | null;
  user_role: string | null;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

export interface AuditLogList {
  total: number;
  items: AuditLog[];
}

export interface MigrationJobProgress {
  discovered: number;
  enqueued: number;
  in_flight: number;
  done: number;
  success: number;
  failed: number;
  skipped: number;
}

export interface MigrationThroughputSample {
  timestamp: string;
  studies: number;
  studies_per_minute: number;
  megabytes_per_second: number;
}

export interface MigrationJobThroughput {
  studies_per_minute: number;
  megabytes_per_second: number;
  elapsed_seconds: number;
  completed_studies: number;
  bytes_transferred: number;
  samples: MigrationThroughputSample[];
}

export interface MigrationJob {
  id: string;
  name: string;
  source_node_id: string;
  destination_node_id: string;
  source_node_name: string | null;
  destination_node_name: string | null;
  job_type: "historical" | "batch" | "incremental";
  status: string;
  total_studies: number | null;
  completed_studies: number;
  failed_studies: number;
  retry_count: number;
  job_config: Record<string, unknown> | null;
  celery_task_id: string | null;
  discovery_offset: number;
  discovery_complete: boolean;
  discovered_studies: number;
  created_by: string;
  start_time: string | null;
  end_time: string | null;
  created_at: string;
  updated_at: string;
}

export interface MigrationJobList {
  total: number;
  items: MigrationJob[];
}

export interface RoutingDestination {
  id: string;
  destination_node_id: string;
  destination_name: string | null;
  status: string;
  retry_count: number;
  failure_reason: string | null;
}

export interface RoutingTransaction {
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

export interface MigrationStudyRecord {
  id: string;
  job_id: string;
  study_uid: string;
  patient_id: string | null;
  modality: string | null;
  study_date: string | null;
  status: string;
  retry_count: number;
  failure_reason: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface MigrationStudyList {
  total: number;
  items: MigrationStudyRecord[];
}

export interface ChartDataPoint {
  label: string;
  value: number;
}

export interface DashboardMetrics {
  routing: {
    total: number;
    success: number;
    failed: number;
    partial: number;
    no_match: number;
    success_rate: number;
    studies_today: number;
    success_rate_today: number;
  };
  migration: {
    total_jobs: number;
    active_jobs: number;
    completed_jobs: number;
    studies_migrated: number;
    studies_failed: number;
  };
  dimse: {
    listening: boolean;
    studies_assembled: number;
    instances_received: number;
    associations_accepted: number;
    associations_rejected: number;
  };
}

export interface VolumeChart {
  days: number;
  routing: ChartDataPoint[];
  migration: ChartDataPoint[];
}

export interface ChatQueryResponse {
  answer: string;
  phi_redacted: boolean;
  used_fallback: boolean;
  model: string | null;
  suggestions: string[];
  user_message: ChatMessage;
  assistant_message: ChatMessage;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  phi_redacted?: boolean | null;
  used_fallback?: boolean | null;
  created_at: string;
}

export interface ChatMessageList {
  total: number;
  items: ChatMessage[];
}

export interface ChatbotStatus {
  enabled: boolean;
  available: boolean;
  model: string;
  model_ready: boolean;
  installed_models: string[];
  error?: string | null;
}

export interface ReportSummary {
  period_days: number;
  routing_studies: number;
  routing_success_rate: number;
  migration_studies_completed: number;
  migration_studies_failed: number;
  audit_events: number;
  top_modalities: ChartDataPoint[];
  routing_by_status: ChartDataPoint[];
}

export const DICOM_TAGS = [
  "Modality",
  "PatientID",
  "StudyDate",
  "AccessionNumber",
  "StudyDescription",
  "InstitutionName",
  "ReferringPhysicianName",
  "BodyPartExamined",
];

export const OPERATORS = [
  { value: "equals", label: "Equals" },
  { value: "not_equals", label: "Not Equals" },
  { value: "contains", label: "Contains" },
  { value: "starts_with", label: "Starts With" },
  { value: "ends_with", label: "Ends With" },
  { value: "regex", label: "Regex" },
];
