import { ReactNode } from "react";

interface Props {
  title: string;
  description?: string;
  actions?: ReactNode;
}

export default function PageHeader({ title, description, actions }: Props) {
  return (
    <header className="page-header">
      <div className="page-header-top">
        <h2 className="page-header-title">{title}</h2>
        {actions && <div className="page-header-actions">{actions}</div>}
      </div>
      {description && <p className="page-header-description">{description}</p>}
    </header>
  );
}
