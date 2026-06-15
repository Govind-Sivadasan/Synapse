import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api/client";

export interface AppMetadata {
  dicom_tags: string[];
  operators: { value: string; label: string }[];
  migration_job_types: { value: string; label: string }[];
  node_types: { value: string; label: string }[];
  protocols: { value: string; label: string }[];
  auth_types: { value: string; label: string }[];
}

export function useAppMetadata() {
  return useQuery({
    queryKey: ["app-metadata"],
    queryFn: () => apiFetch<AppMetadata>("/api/v1/metadata"),
    staleTime: 5 * 60 * 1000,
  });
}
