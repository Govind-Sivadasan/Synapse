import { KeyRound, Shield, User } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { getAccountProfile, startPasswordChange } from "../auth/account";
import PageHeader from "../components/ui/PageHeader";
import StatusBadge from "../components/ui/StatusBadge";

function displayRoles(roles: string[]): string[] {
  return roles.filter((r) => !r.startsWith("default-roles"));
}

export default function Account() {
  const { roles } = useAuth();
  const profile = getAccountProfile();
  const visibleRoles = displayRoles(roles);

  return (
    <div>
      <PageHeader
        title="Account"
        description="Your Synapse sign-in details. Password changes are handled securely via Keycloak."
      />

      <div className="card account-card">
        <div className="account-card-header">
          <div className="user-avatar user-avatar--lg">{profile.username.slice(0, 2).toUpperCase() || "?"}</div>
          <div>
            <h3 className="account-card-title">{profile.displayName || profile.username}</h3>
            <p className="account-card-subtitle">@{profile.username}</p>
          </div>
        </div>

        <dl className="account-details">
          <div className="account-detail-row">
            <dt>
              <User size={15} strokeWidth={2} />
              Username
            </dt>
            <dd>{profile.username || "—"}</dd>
          </div>
          <div className="account-detail-row">
            <dt>
              <User size={15} strokeWidth={2} />
              Email
            </dt>
            <dd>{profile.email || "—"}</dd>
          </div>
          <div className="account-detail-row">
            <dt>
              <Shield size={15} strokeWidth={2} />
              Roles
            </dt>
            <dd className="account-roles">
              {visibleRoles.length > 0 ? (
                visibleRoles.map((role) => <StatusBadge key={role} status={role} dot={false} />)
              ) : (
                "—"
              )}
            </dd>
          </div>
        </dl>
      </div>

      <div className="card account-card">
        <h3 className="account-section-title">Security</h3>
        <p className="account-section-desc">
          Update your password. You&apos;ll be redirected to Keycloak to verify your current session, then returned
          here.
        </p>
        <button type="button" onClick={startPasswordChange}>
          <KeyRound size={16} />
          Change password
        </button>
      </div>

      <p className="account-footnote">
        Name, email, and role assignment are managed by your administrator in Keycloak.
      </p>
    </div>
  );
}
