import { SynapseLogo } from "../brand/BrandImage";

interface Props {
  message?: string;
}

export default function LoadingScreen({ message = "Authenticating with Keycloak…" }: Props) {
  return (
    <div className="loading-screen">
      <div className="loading-logo loading-logo--brand">
        <SynapseLogo size={56} />
      </div>
      <div style={{ textAlign: "center" }}>
        <h2>Synapse</h2>
        <p>{message}</p>
      </div>
      <div className="loading-spinner" />
    </div>
  );
}

export function PageLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="page-loading">
      <div className="loading-spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />
      <span>{label}</span>
    </div>
  );
}
