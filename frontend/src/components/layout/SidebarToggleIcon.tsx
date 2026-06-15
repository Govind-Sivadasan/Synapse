interface Props {
  /** `collapse` = narrow the panel; `expand` = restore full width */
  mode: "collapse" | "expand";
  className?: string;
}

/** Sidebar panel outline with pane divider and chevron (collapse / expand). */
export default function SidebarToggleIcon({ mode, className }: Props) {
  const chevronLeft = mode === "collapse";

  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect
        x="1.5"
        y="2.5"
        width="13"
        height="11"
        rx="1.75"
        stroke="currentColor"
        strokeWidth="1.25"
      />
      <rect
        x="2.25"
        y="3.25"
        width="3.5"
        height="9.5"
        rx="0.75"
        fill="currentColor"
        fillOpacity="0.12"
      />
      <line
        x1="6.25"
        y1="2.5"
        x2="6.25"
        y2="13.5"
        stroke="currentColor"
        strokeWidth="1.25"
      />
      {chevronLeft ? (
        <path
          d="M10.25 8L8.5 6.25M10.25 8L8.5 9.75"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <path
          d="M8.25 8L10 6.25M8.25 8L10 9.75"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}
