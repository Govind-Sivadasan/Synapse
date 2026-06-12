import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api/client";

interface HealthComponent {
  name: string;
  status: string;
  message?: string;
}

interface HealthResponse {
  status: string;
  components: HealthComponent[];
  timestamp: string;
}

export default function SystemHealth() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["health"],
    queryFn: () => apiFetch<HealthResponse>("/api/v1/health"),
    refetchInterval: 15000,
  });

  return (
    <div>
      <div className="header-bar">
        <h2 style={{ margin: 0 }}>System Health</h2>
        <button onClick={() => refetch()}>Refresh</button>
      </div>
      {isLoading && <p>Checking services...</p>}
      {error && <p>Error: {(error as Error).message}</p>}
      {data && (
        <>
          <div className="card">
            <strong>Overall: </strong>
            <span style={{ color: data.status === "healthy" ? "#16a34a" : "#ca8a04" }}>
              {data.status}
            </span>
          </div>
          {data.components.map((c) => (
            <div className="card" key={c.name}>
              <strong>{c.name}</strong>: {c.status}
              {c.message && <div style={{ color: "#64748b", fontSize: "0.875rem" }}>{c.message}</div>}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
