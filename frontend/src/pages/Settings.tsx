import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  ExternalLink,
  Loader2,
  Network,
  Radio,
  RotateCw,
  RotateCcw,
  Save,
  ScrollText,
  Shield,
  UserCog,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import ActionButton from "../components/ui/ActionButton";
import { apiFetch } from "../api/client";
import PageHeader from "../components/ui/PageHeader";
import { PageLoading } from "../components/ui/LoadingScreen";
import StatusBadge from "../components/ui/StatusBadge";
import { PERMISSION_MATRIX } from "../config/permissions";
import { ChatbotStatus, SystemConfig } from "../types/api";
import { useNotifications } from "../services/notifications";

type SettingsTab = "dimse" | "workers" | "retry" | "security" | "roles" | "audit" | "chatbot";

const TAB_GROUPS: {
  label: string;
  tabs: { id: SettingsTab; label: string; icon: LucideIcon }[];
  links?: { href: string; label: string; icon: LucideIcon }[];
}[] = [
  {
    label: "System",
    tabs: [
      { id: "dimse", label: "DIMSE listener", icon: Radio },
      { id: "workers", label: "Workers & queues", icon: Workflow },
    ],
    links: [{ href: "/nodes", label: "PACS nodes", icon: Network }],
  },
  {
    label: "Security",
    tabs: [
      { id: "security", label: "Security & auth", icon: Shield },
      { id: "roles", label: "Roles & access", icon: UserCog },
    ],
  },
  {
    label: "Operations",
    tabs: [
      { id: "retry", label: "Retry policy", icon: RotateCw },
      { id: "audit", label: "Audit & logging", icon: ScrollText },
      { id: "chatbot", label: "Chatbot / LLM", icon: Bot },
    ],
  },
];

const TAB_COPY: Record<SettingsTab, { title: string; description: string }> = {
  dimse: {
    title: "DIMSE listener",
    description: "Configure the C-STORE SCP and C-ECHO SCP that receive incoming DICOM associations.",
  },
  workers: {
    title: "Workers & queues",
    description: "Celery worker pool configuration for routing and migration task queues.",
  },
  retry: {
    title: "Retry policy",
    description: "Automatic retries for failed STOW-RS uploads and background tasks.",
  },
  security: {
    title: "Security & auth",
    description: "Authentication is managed through Keycloak. Connection details are set at deployment time.",
  },
  roles: {
    title: "Roles & access",
    description: "Role definitions live in Keycloak. This matrix shows what each role can do in Synapse.",
  },
  audit: {
    title: "Audit & logging",
    description: "Control application log verbosity. Detailed audit events are configured in Audit Logs.",
  },
  chatbot: {
    title: "Chatbot / LLM",
    description: "Status of the Ollama inference server used for Synapse Assistant.",
  },
};

function FieldRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="settings-field-row">
      <div className="settings-field-copy">
        <label>{label}</label>
        <p className="settings-field-hint">{hint}</p>
      </div>
      <div className="settings-field-control">{children}</div>
    </div>
  );
}

function SettingsActions({
  onReset,
  saving,
  resetLabel = "Reset",
}: {
  onReset: () => void;
  saving?: boolean;
  resetLabel?: string;
}) {
  return (
    <div className="settings-form-actions">
      <ActionButton variant="secondary" icon={<RotateCcw size={16} />} onClick={onReset}>
        {resetLabel}
      </ActionButton>
      <ActionButton
        type="submit"
        disabled={saving}
        icon={saving ? <Loader2 size={16} className="spin-icon" /> : <Save size={16} />}
      >
        {saving ? "Saving…" : "Save changes"}
      </ActionButton>
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="settings-toggle-row">
      <div className="settings-field-copy">
        <label>{label}</label>
        <p className="settings-field-hint">{hint}</p>
      </div>
      <div className="settings-field-control">
        <label className="settings-switch">
          <input
            type="checkbox"
            checked={checked}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span className="settings-switch-slider" aria-hidden />
        </label>
      </div>
    </div>
  );
}

export default function Settings() {
  const queryClient = useQueryClient();
  const { success, error: notifyError } = useNotifications();
  const [tab, setTab] = useState<SettingsTab>("dimse");
  const [form, setForm] = useState<SystemConfig | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["system-config"],
    queryFn: () => apiFetch<SystemConfig>("/api/v1/config"),
  });

  const { data: chatbotStatus } = useQuery({
    queryKey: ["chatbot-status", form?.ollama_base_url, form?.ollama_model],
    queryFn: () => apiFetch<ChatbotStatus>("/api/v1/chatbot/status"),
    enabled: tab === "chatbot" && !!form,
    refetchInterval: tab === "chatbot" ? 15000 : false,
  });

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  useEffect(() => {
    if (error) notifyError((error as Error).message);
  }, [error, notifyError]);

  const saveMutation = useMutation({
    mutationFn: (payload: Partial<SystemConfig>) =>
      apiFetch<SystemConfig>("/api/v1/config", { method: "PUT", body: JSON.stringify(payload) }),
    onSuccess: (result) => {
      setForm(result);
      queryClient.invalidateQueries({ queryKey: ["system-config"] });
      queryClient.invalidateQueries({ queryKey: ["chatbot-status"] });
      queryClient.invalidateQueries({ queryKey: ["health"] });
      success("Settings saved successfully.");
    },
  });

  if (isLoading || !form) return <PageLoading label="Loading settings…" />;
  if (error) return <PageLoading label="Unable to load settings." />;

  const copy = TAB_COPY[tab];

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(form);
  };

  const handleReset = () => {
    if (data) setForm(data);
  };

  return (
    <div>
      <PageHeader
        title="Settings"
        description="System configuration, security, and operational policies."
      />

      <div className="settings-hub">
        <nav className="settings-hub-nav" aria-label="Settings sections">
          {TAB_GROUPS.map((group) => (
            <div key={group.label} className="settings-hub-group">
              <div className="settings-hub-group-label">{group.label}</div>
              {group.tabs.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    type="button"
                    className={`settings-hub-item settings-hub-tab${tab === t.id ? " settings-hub-tab--active" : ""}`}
                    onClick={() => setTab(t.id)}
                  >
                    <span className="settings-hub-item-icon">
                      <Icon size={16} strokeWidth={2} aria-hidden />
                    </span>
                    <span className="settings-hub-item-label">{t.label}</span>
                  </button>
                );
              })}
              {group.links?.map((link) => {
                const Icon = link.icon;
                return (
                  <Link key={link.href} to={link.href} className="settings-hub-item settings-hub-link">
                    <span className="settings-hub-item-icon">
                      <Icon size={16} strokeWidth={2} aria-hidden />
                    </span>
                    <span className="settings-hub-item-label">{link.label}</span>
                    <ExternalLink size={12} className="settings-hub-item-trailing" aria-hidden />
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="card settings-panel">
          <header className="settings-panel-header">
            <h2>{copy.title}</h2>
            <p>{copy.description}</p>
          </header>

          {tab === "dimse" && (
            <form className="settings-form" onSubmit={handleSave}>
              <div className="settings-rows">
                <FieldRow label="AE title" hint="Application Entity Title for this DICOM node">
                  <input
                    className="settings-input"
                    value={form.dimse_ae_title}
                    onChange={(e) => setForm({ ...form, dimse_ae_title: e.target.value })}
                    maxLength={16}
                  />
                </FieldRow>
                <FieldRow label="Listening port" hint="TCP port for incoming DIMSE connections">
                  <input
                    className="settings-input"
                    type="number"
                    value={form.dimse_port}
                    onChange={(e) => setForm({ ...form, dimse_port: Number(e.target.value) })}
                  />
                </FieldRow>
                <ToggleRow
                  label="Enable promiscuous mode"
                  hint="Accept connections from unregistered AE titles. Disabled by default — requires Admin role."
                  checked={form.dimse_promiscuous_mode}
                  onChange={(v) => setForm({ ...form, dimse_promiscuous_mode: v })}
                />
              </div>
              <SettingsActions onReset={handleReset} saving={saveMutation.isPending} />
            </form>
          )}

          {tab === "workers" && (
            <form className="settings-form" onSubmit={handleSave}>
              <div className="settings-rows">
                <p className="settings-section-label">Routing queue</p>
                <FieldRow label="Worker concurrency" hint="Parallel routing workers">
                  <input
                    className="settings-input"
                    type="number"
                    min={1}
                    max={32}
                    value={form.celery_routing_concurrency}
                    onChange={(e) => setForm({ ...form, celery_routing_concurrency: Number(e.target.value) })}
                  />
                </FieldRow>
                <p className="settings-section-label">Migration queue</p>
                <FieldRow label="Worker concurrency" hint="Parallel migration workers (separate pool from routing)">
                  <input
                    className="settings-input"
                    type="number"
                    min={1}
                    max={32}
                    value={form.celery_migration_concurrency}
                    onChange={(e) => setForm({ ...form, celery_migration_concurrency: Number(e.target.value) })}
                  />
                </FieldRow>
              </div>
              <SettingsActions onReset={handleReset} saving={saveMutation.isPending} />
            </form>
          )}

          {tab === "retry" && (
            <form className="settings-form" onSubmit={handleSave}>
              <div className="settings-rows">
                <p className="settings-section-label">STOW-RS upload retries</p>
                <FieldRow label="Max retry attempts" hint="Retries before marking a destination upload as failed">
                  <input
                    className="settings-input"
                    type="number"
                    min={0}
                    max={10}
                    value={form.celery_max_retries}
                    onChange={(e) => setForm({ ...form, celery_max_retries: Number(e.target.value) })}
                  />
                </FieldRow>
                <p className="settings-field-hint settings-field-hint--inline">
                  Celery applies exponential backoff between attempts. Per-destination retry is also available from the
                  Routing Monitor for failed uploads.
                </p>
              </div>
              <SettingsActions onReset={handleReset} saving={saveMutation.isPending} resetLabel="Reset to defaults" />
            </form>
          )}

          {tab === "security" && (
            <div className="settings-rows">
              <FieldRow label="Keycloak URL" hint="Base URL of your Keycloak instance (set via deployment env)">
                <input className="settings-input" value="Configured at deploy time" disabled readOnly />
              </FieldRow>
              <FieldRow label="Realm" hint="Keycloak realm configured for Synapse">
                <input className="settings-input" value="synapse" disabled readOnly />
              </FieldRow>
              <FieldRow label="Client ID" hint="OAuth2 client identifier">
                <input className="settings-input" value="synapse-app" disabled readOnly />
              </FieldRow>
              <p className="settings-field-hint settings-field-hint--inline">
                Password and profile changes are handled in <Link to="/account">Account settings</Link>. Role
                assignments are managed in the Keycloak admin console.
              </p>
            </div>
          )}

          {tab === "roles" && (
            <div className="table-wrap">
              <table className="permissions-matrix">
                <thead>
                  <tr>
                    <th>Permission</th>
                    <th>Admin</th>
                    <th>Operator</th>
                    <th>Service User</th>
                    <th>Viewer</th>
                  </tr>
                </thead>
                <tbody>
                  {PERMISSION_MATRIX.map((row) => (
                    <tr key={row.permission}>
                      <td>{row.permission}</td>
                      <td className={row.admin ? "permissions-yes" : "permissions-no"}>
                        {row.admin ? "✓" : "—"}
                      </td>
                      <td className={row.operator ? "permissions-yes" : "permissions-no"}>
                        {row.operator ? "✓" : "—"}
                      </td>
                      <td className={row.service_user ? "permissions-yes" : "permissions-no"}>
                        {row.service_user ? "✓" : "—"}
                      </td>
                      <td className={row.viewer ? "permissions-yes" : "permissions-no"}>
                        {row.viewer ? "✓" : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === "audit" && (
            <form className="settings-form" onSubmit={handleSave}>
              <div className="settings-rows">
                <p className="settings-section-label">Audit log events</p>
                <ToggleRow
                  label="DIMSE associations"
                  hint="Log every C-STORE / C-ECHO association"
                  checked={form.audit_log_dimse}
                  onChange={(v) => setForm({ ...form, audit_log_dimse: v })}
                />
                <ToggleRow
                  label="Routing rule matches"
                  hint="Log matched and unmatched routing decisions"
                  checked={form.audit_log_routing}
                  onChange={(v) => setForm({ ...form, audit_log_routing: v })}
                />
                <ToggleRow
                  label="Tag morphing operations"
                  hint="Log original and new tag values per study"
                  checked={form.audit_log_tag_morphing}
                  onChange={(v) => setForm({ ...form, audit_log_tag_morphing: v })}
                />
                <ToggleRow
                  label="Migration job events"
                  hint="Log all job state transitions and per-study results"
                  checked={form.audit_log_migration}
                  onChange={(v) => setForm({ ...form, audit_log_migration: v })}
                />
                <ToggleRow
                  label="Chatbot queries"
                  hint="Log natural language queries and responses"
                  checked={form.audit_log_chatbot}
                  onChange={(v) => setForm({ ...form, audit_log_chatbot: v })}
                />
                <ToggleRow
                  label="Include PHI in records"
                  hint="Store patient identifiers in audit detail fields"
                  checked={form.audit_include_phi}
                  onChange={(v) => setForm({ ...form, audit_include_phi: v })}
                />
                <p className="settings-section-label">Application logging</p>
                <FieldRow label="Log level" hint="Verbosity of application logs">
                  <select
                    className="settings-input settings-input--select"
                    value={form.logging_level}
                    onChange={(e) => setForm({ ...form, logging_level: e.target.value })}
                  >
                    <option value="DEBUG">DEBUG</option>
                    <option value="INFO">INFO</option>
                    <option value="WARNING">WARNING</option>
                    <option value="ERROR">ERROR</option>
                  </select>
                </FieldRow>
                <p className="settings-field-hint settings-field-hint--inline">
                  View recorded entries in <Link to="/audit-logs">Audit Logs</Link>.
                </p>
              </div>
              <SettingsActions onReset={handleReset} saving={saveMutation.isPending} />
            </form>
          )}

          {tab === "chatbot" && (
            <form className="settings-form" onSubmit={handleSave}>
              <div className="settings-rows">
                <p className="settings-section-label">Ollama connection</p>
                <FieldRow label="Ollama base URL" hint="HTTP endpoint of the Ollama API server">
                  <input
                    className="settings-input settings-input--wide"
                    value={form.ollama_base_url}
                    onChange={(e) => setForm({ ...form, ollama_base_url: e.target.value })}
                  />
                </FieldRow>
                <FieldRow label="Model" hint="Instruct model for NL → SQL / QIDO-RS translation">
                  <input
                    className="settings-input settings-input--wide"
                    value={form.ollama_model}
                    onChange={(e) => setForm({ ...form, ollama_model: e.target.value })}
                  />
                </FieldRow>
                <ToggleRow
                  label="Enable chatbot"
                  hint="Allow NL queries from Service User role and above"
                  checked={form.chatbot_enabled}
                  onChange={(v) => setForm({ ...form, chatbot_enabled: v })}
                />
                {chatbotStatus && (
                  <>
                    <p className="settings-section-label">Live status</p>
                    <FieldRow label="Ollama status" hint="Health check against configured base URL">
                      <StatusBadge
                        status={chatbotStatus.available ? "healthy" : "unhealthy"}
                        label={chatbotStatus.available ? "Online" : "Offline"}
                      />
                    </FieldRow>
                    <FieldRow label="Model ready" hint="Whether the configured model is loaded in Ollama">
                      <StatusBadge
                        status={chatbotStatus.model_ready ? "success" : "warning"}
                        label={chatbotStatus.model_ready ? "Ready" : "Not loaded"}
                      />
                    </FieldRow>
                    {chatbotStatus.installed_models.length > 0 && (
                      <FieldRow label="Installed models" hint="Models available on the Ollama server">
                        <span className="settings-readonly-value">
                          {chatbotStatus.installed_models.join(", ")}
                        </span>
                      </FieldRow>
                    )}
                    {chatbotStatus.error && (
                      <p className="settings-field-hint settings-field-hint--inline" style={{ color: "var(--color-error)" }}>
                        {chatbotStatus.error}
                      </p>
                    )}
                  </>
                )}
                <p className="settings-field-hint settings-field-hint--inline">
                  Open <Link to="/chatbot">Synapse Assistant</Link> to run queries after saving changes.
                </p>
              </div>
              <SettingsActions onReset={handleReset} saving={saveMutation.isPending} />
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
