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
}

export interface AuditLog {
  id: string;
  event_type: string;
  user_id: string | null;
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
