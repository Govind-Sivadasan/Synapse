import { NodeFormState } from "../../lib/nodes";

interface Props {
  form: NodeFormState;
  onChange: (next: NodeFormState) => void;
  editing?: boolean;
}

export default function NodeAuthFields({ form, onChange, editing = false }: Props) {
  const showDicomwebAuth =
    form.protocol === "DICOMweb" || Boolean(form.dicomweb_url.trim());

  if (!showDicomwebAuth) {
    return null;
  }

  const set = (patch: Partial<NodeFormState>) => onChange({ ...form, ...patch });

  return (
    <>
      <div className="form-field full-width node-auth-hint">
        <p className="form-field-hint" style={{ margin: 0 }}>
          DICOMweb authentication is sent on QIDO, WADO, and STOW requests (Echo uses the same headers).
          DIMSE connections use AE titles instead — not this setting.
        </p>
      </div>

      {form.auth_type === "basic" && (
        <>
          <div className="form-field">
            <label>Username</label>
            <input
              value={form.auth_username}
              onChange={(e) => set({ auth_username: e.target.value })}
              autoComplete="off"
              required
            />
          </div>
          <div className="form-field">
            <label>Password</label>
            <input
              type="password"
              value={form.auth_password}
              onChange={(e) => set({ auth_password: e.target.value })}
              autoComplete="new-password"
              placeholder={editing ? "Leave blank to keep current password" : ""}
              required={!editing}
            />
          </div>
        </>
      )}

      {form.auth_type === "bearer" && (
        <div className="form-field full-width">
          <label>Bearer token</label>
          <input
            type="password"
            value={form.auth_token}
            onChange={(e) => set({ auth_token: e.target.value })}
            autoComplete="off"
            placeholder={editing ? "Leave blank to keep current token" : "Paste OAuth / JWT access token"}
            required={!editing}
          />
        </div>
      )}

      {form.auth_type === "apikey" && (
        <>
          <div className="form-field">
            <label>Header name</label>
            <input
              value={form.auth_api_key_header}
              onChange={(e) => set({ auth_api_key_header: e.target.value })}
              placeholder="X-API-Key"
            />
          </div>
          <div className="form-field">
            <label>API key</label>
            <input
              type="password"
              value={form.auth_api_key}
              onChange={(e) => set({ auth_api_key: e.target.value })}
              autoComplete="off"
              placeholder={editing ? "Leave blank to keep current key" : ""}
              required={!editing}
            />
          </div>
        </>
      )}
    </>
  );
}
