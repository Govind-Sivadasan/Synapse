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

export function PageLoading({
  label = "Loading…",
  compact = false,
}: {
  label?: string;
  /** Smaller region for tables, cards, and modals */
  compact?: boolean;
}) {
  return (
    <div className={`page-loading${compact ? " page-loading--compact" : ""}`} role="status" aria-live="polite">
      <div className="loading-spinner loading-spinner--page" aria-hidden />
      <span>{label}</span>
    </div>
  );
}
