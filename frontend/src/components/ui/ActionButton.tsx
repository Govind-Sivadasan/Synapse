import { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: ReactNode;
  variant?: Variant;
  children: ReactNode;
}

export default function ActionButton({
  icon,
  variant = "primary",
  className = "",
  children,
  type = "button",
  ...rest
}: Props) {
  const classes = [
    variant === "secondary" ? "btn-secondary" : variant === "ghost" ? "btn-ghost" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button type={type} className={classes || undefined} {...rest}>
      {icon}
      {children}
    </button>
  );
}
