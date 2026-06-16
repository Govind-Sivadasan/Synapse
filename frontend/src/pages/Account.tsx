import { useState } from "react";
import { KeyRound, Keyboard, LayoutList, RotateCcw, Shield, User } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { getAccountProfile, startPasswordChange } from "../auth/account";
import HotkeysPreferencesPanel from "../components/preferences/HotkeysPreferencesPanel";
import NotificationPreferencesPanel from "../components/preferences/NotificationPreferencesPanel";
import SidebarPreferencesPanel from "../components/preferences/SidebarPreferencesPanel";
import ActionButton from "../components/ui/ActionButton";
import PageHeader from "../components/ui/PageHeader";
import StatusBadge from "../components/ui/StatusBadge";
import { useUserPreferences } from "../hooks/useUserPreferences";

type AccountTab = "profile" | "navigation" | "shortcuts";

function displayRoles(roles: string[]): string[] {
  return roles.filter((r) => !r.startsWith("default-roles"));
}

const TABS: { id: AccountTab; label: string; icon: typeof User }[] = [
  { id: "profile", label: "Profile", icon: User },
  { id: "navigation", label: "Navigation", icon: LayoutList },
  { id: "shortcuts", label: "Shortcuts", icon: Keyboard },
];

export default function Account() {
  const { roles, username } = useAuth();
  const profile = getAccountProfile();
  const visibleRoles = displayRoles(roles);
  const { prefs, setPrefs, resetPrefs } = useUserPreferences(username);
  const [tab, setTab] = useState<AccountTab>("profile");

  return (
    <div>
      <PageHeader
        title="Account"
        description="Profile, sidebar layout, and keyboard shortcuts — saved locally for your user."
      />

      <div className="account-tabs" role="tablist" aria-label="Account sections">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`account-tab${tab === id ? " account-tab--active" : ""}`}
            onClick={() => setTab(id)}
          >
            <Icon size={16} strokeWidth={2} />
            {label}
          </button>
        ))}
      </div>

      {tab === "profile" && (
        <div role="tabpanel" className="account-tab-panel">
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
              Update your password. You&apos;ll be redirected to Keycloak to verify your current session, then returned here.
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
      )}

      {tab === "navigation" && (
        <div role="tabpanel" className="account-tab-panel">
          <div className="card prefs-card">
            <SidebarPreferencesPanel roles={roles} prefs={prefs} onChange={setPrefs} />
          </div>
        </div>
      )}

      {tab === "shortcuts" && (
        <div role="tabpanel" className="account-tab-panel">
          <div className="card prefs-card">
            <HotkeysPreferencesPanel prefs={prefs} onChange={setPrefs} />
          </div>
          <div className="card prefs-card">
            <NotificationPreferencesPanel prefs={prefs} onChange={setPrefs} />
          </div>
          <div className="prefs-reset-all">
            <ActionButton variant="secondary" icon={<RotateCcw size={16} />} onClick={resetPrefs}>
              Reset all preferences to defaults
            </ActionButton>
          </div>
        </div>
      )}
    </div>
  );
}
