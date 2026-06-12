import { ReactNode, useEffect, useState } from "react";

type AlertVariant = "success" | "error" | "warning" | "info";

interface Props {
  variant?: AlertVariant;
  children: ReactNode;
  autoHideMs?: number;
  onDismiss?: () => void;
  className?: string;
  style?: React.CSSProperties;
  showProgress?: boolean;
}

export default function AutoDismissAlert({
  variant = "info",
  children,
  autoHideMs = 5000,
  onDismiss,
  className = "",
  style,
  showProgress = true,
}: Props) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setVisible(true);
    const timer = window.setTimeout(() => {
      setVisible(false);
      onDismiss?.();
    }, autoHideMs);
    return () => window.clearTimeout(timer);
  }, [children, autoHideMs, onDismiss]);

  if (!visible) return null;

  return (
    <div
      className={`auto-dismiss-alert alert alert-${variant} ${className}`.trim()}
      style={style}
      role="status"
    >
      <div className="auto-dismiss-alert__content">{children}</div>
      {showProgress && (
        <div
          className="auto-dismiss-alert__progress"
          style={{ animationDuration: `${autoHideMs}ms` }}
        />
      )}
    </div>
  );
}
