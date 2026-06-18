import { Bell, RotateCcw } from "lucide-react";
import {
  NotificationDurationScale,
  NotificationPosition,
  NotificationProgressDirection,
  UserPreferences,
} from "../../config/userPreferences";
import {
  NOTIFICATION_DURATION_SCALE_LABELS,
  resolveNotificationDuration,
} from "../../lib/notificationMessages";
import { useNotifications } from "../../services/notifications";
import Switch from "../ui/Switch";

const POSITIONS: { value: NotificationPosition; label: string }[] = [
  { value: "top-right", label: "Top right" },
  { value: "top-left", label: "Top left" },
  { value: "bottom-right", label: "Bottom right" },
  { value: "bottom-left", label: "Bottom left" },
];

const DURATION_SCALES: NotificationDurationScale[] = ["short", "normal", "long"];

const PROGRESS_DIRECTIONS: { value: NotificationProgressDirection; label: string }[] = [
  { value: "left-to-right", label: "Left to right" },
  { value: "right-to-left", label: "Right to left" },
];

interface Props {
  prefs: UserPreferences;
  onChange: (updater: UserPreferences | ((prev: UserPreferences) => UserPreferences)) => void;
}

export default function NotificationPreferencesPanel({ prefs, onChange }: Props) {
  const { success, error, warning, info } = useNotifications();

  const updatePosition = (notificationPosition: NotificationPosition) => {
    onChange((prev) => ({ ...prev, notificationPosition }));
    info("Notification position updated.");
  };

  const updateDurationScale = (notificationDurationScale: NotificationDurationScale) => {
    onChange((prev) => ({ ...prev, notificationDurationScale }));
    const sampleSec = Math.round(resolveNotificationDuration("info", notificationDurationScale) / 1000);
    info(`Toast duration updated — info toasts stay for about ${sampleSec} seconds.`);
  };

  const updateShowProgress = (notificationShowProgress: boolean) => {
    onChange((prev) => ({ ...prev, notificationShowProgress }));
    info(notificationShowProgress ? "Countdown bar enabled." : "Countdown bar hidden.");
  };

  const updateProgressDirection = (notificationProgressDirection: NotificationProgressDirection) => {
    onChange((prev) => ({ ...prev, notificationProgressDirection }));
    info(
      notificationProgressDirection === "left-to-right"
        ? "Progress bar - fills left to right."
        : "Countdown bar - depletes right to left.",
    );
  };

  const resetNotifications = () => {
    onChange((prev) => ({
      ...prev,
      notificationPosition: "top-right",
      notificationDurationScale: "normal",
      notificationShowProgress: true,
      notificationProgressDirection: "right-to-left",
    }));
    info("Notification settings reset to defaults.");
  };

  return (
    <div className="prefs-panel">
      <div className="prefs-card-header">
        <Bell size={18} />
        <div className="prefs-card-header-text">
          <h3 className="account-section-title">Notifications</h3>
          <p className="account-section-desc">
            Control where toasts appear, how long they stay visible, and whether a countdown bar is shown.
            Use preview buttons to test your settings.
          </p>
        </div>
        <div className="prefs-card-actions">
          <button type="button" className="btn-sm btn-secondary" onClick={resetNotifications}>
            <RotateCcw size={14} />
            Reset
          </button>
        </div>
      </div>

      <div className="prefs-notification-sections">
        <section className="prefs-notification-block">
          <h4 className="prefs-notification-heading">Position</h4>
          <div className="notification-position-grid" role="group" aria-label="Notification position">
            {POSITIONS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                className={`notification-position-option${
                  prefs.notificationPosition === value ? " notification-position-option--active" : ""
                }`}
                aria-pressed={prefs.notificationPosition === value}
                onClick={() => updatePosition(value)}
              >
                <span className={`notification-position-preview notification-position-preview--${value}`} aria-hidden>
                  <span className="notification-position-preview__dot" />
                </span>
                <span className="notification-position-option__label">{label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="prefs-notification-block">
          <h4 className="prefs-notification-heading">Display</h4>
          <div className="prefs-notification-display">
            <div className="form-field prefs-notification-duration">
              <label htmlFor="notification-duration-scale">Toast duration</label>
              <select
                id="notification-duration-scale"
                value={prefs.notificationDurationScale}
                onChange={(e) => updateDurationScale(e.target.value as NotificationDurationScale)}
              >
                {DURATION_SCALES.map((scale) => (
                  <option key={scale} value={scale}>
                    {NOTIFICATION_DURATION_SCALE_LABELS[scale]}
                  </option>
                ))}
              </select>
            </div>
            <div className="prefs-notification-progress-toggle">
              <Switch
                checked={prefs.notificationShowProgress}
                onChange={updateShowProgress}
                label="Show countdown bar"
              />
            </div>
            <div
              className={`form-field prefs-notification-direction${prefs.notificationShowProgress ? "" : " prefs-notification-direction--disabled"}`}
            >
              <span className="prefs-notification-direction-label" id="notification-progress-direction-label">
                Countdown direction
              </span>
              <div
                className="notification-direction-toggle"
                role="group"
                aria-labelledby="notification-progress-direction-label"
              >
                {PROGRESS_DIRECTIONS.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    className={`notification-direction-option${
                      prefs.notificationProgressDirection === value ? " notification-direction-option--active" : ""
                    }`}
                    aria-pressed={prefs.notificationProgressDirection === value}
                    disabled={!prefs.notificationShowProgress}
                    onClick={() => updateProgressDirection(value)}
                  >
                    <span
                      className={`notification-direction-preview notification-direction-preview--${value}`}
                      aria-hidden
                    >
                      <span className="notification-direction-preview__bar" />
                    </span>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="prefs-notification-block">
          <h4 className="prefs-notification-heading">Preview</h4>
          <div className="notification-preview-actions">
            <button type="button" className="btn-sm btn-secondary" onClick={() => success("Sample success toast.")}>
              Success
            </button>
            <button type="button" className="btn-sm btn-secondary" onClick={() => error("Sample error toast.")}>
              Error
            </button>
            <button type="button" className="btn-sm btn-secondary" onClick={() => warning("Sample warning toast.")}>
              Warning
            </button>
            <button type="button" className="btn-sm btn-secondary" onClick={() => info("Sample info toast.")}>
              Info
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
