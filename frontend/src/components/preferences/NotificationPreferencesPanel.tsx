import { NotificationPosition } from "../../config/userPreferences";
import { useNotifications } from "../../services/notifications";
import { UserPreferences } from "../../config/userPreferences";

const POSITIONS: { value: NotificationPosition; label: string }[] = [
  { value: "top-right", label: "Top right" },
  { value: "top-left", label: "Top left" },
  { value: "bottom-right", label: "Bottom right" },
  { value: "bottom-left", label: "Bottom left" },
];

interface Props {
  prefs: UserPreferences;
  onChange: (prefs: UserPreferences) => void;
}

export default function NotificationPreferencesPanel({ prefs, onChange }: Props) {
  const { setPosition, info } = useNotifications();

  return (
    <div className="prefs-section">
      <h3 className="account-card-title">Notifications</h3>
      <p className="account-card-subtitle">
        Toast notifications appear for actions like saved settings, migration retries, and exports.
      </p>
      <div className="form-field" style={{ maxWidth: 280, marginTop: "1rem" }}>
        <label htmlFor="notification-position">Notification position</label>
        <select
          id="notification-position"
          value={prefs.notificationPosition}
          onChange={(e) => {
            const notificationPosition = e.target.value as NotificationPosition;
            onChange({ ...prefs, notificationPosition });
            setPosition(notificationPosition);
            info("Notification position updated.");
          }}
        >
          {POSITIONS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
