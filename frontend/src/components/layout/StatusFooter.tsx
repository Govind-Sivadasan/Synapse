import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiFetch } from "../../api/client";
import { statusVariant } from "../ui/StatusBadge";

interface HealthComponent {
  name: string;
  status: string;
  message?: string;
  latency_ms?: number | null;
}

interface HealthResponse {
  status: string;
  components: HealthComponent[];
}

const COMPONENT_LABELS: Record<string, string> = {
  postgresql: "PostgreSQL",
  redis: "Redis",
  orthanc_onprem: "Orthanc on-prem",
  orthanc_cloud: "Cloud PACS",
  keycloak: "Keycloak",
  ollama: "Ollama",
  dimse_listener: "DIMSE",
  celery_workers: "Celery workers",
};

function labelFor(name: string): string {
  return COMPONENT_LABELS[name] ?? name.replace(/_/g, " ");
}

function chipVariant(component: HealthComponent): string {
  return statusVariant(component.status);
}

export default function StatusFooter() {
  const { data } = useQuery({
    queryKey: ["health"],
    queryFn: () => apiFetch<HealthResponse>("/api/v1/health"),
    refetchInterval: 20000,
    staleTime: 15000,
  });

  const components = data?.components ?? [];

  return (
    <footer className="status-footer" data-tour="status-footer">
      <div className="status-footer-services">
        {components.map((c) => {
          const variant = chipVariant(c);
          return (
            <span
              key={c.name}
              className={`status-footer-chip status-footer-chip--${variant}`}
              title={c.message ?? c.status}
            >
              <span className="status-footer-dot" aria-hidden />
              {labelFor(c.name)}
              {c.latency_ms != null && (
                <span className="status-footer-latency">{c.latency_ms}ms</span>
              )}
            </span>
          );
        })}
      </div>
      <div className="status-footer-meta">
        <Link to="/health" className="status-footer-link">
          System health
        </Link>
        <span className="status-footer-version">Synapse</span>
      </div>
    </footer>
  );
}
