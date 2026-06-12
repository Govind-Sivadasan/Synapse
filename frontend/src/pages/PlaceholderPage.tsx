import { LucideIcon } from "lucide-react";
import { ReactNode } from "react";
import PageHeader from "../components/ui/PageHeader";
import EmptyState from "../components/ui/EmptyState";

interface Props {
  title: string;
  description: string;
  icon: LucideIcon;
  phase?: string;
  action?: ReactNode;
}

export default function PlaceholderPage({ title, description, icon, phase, action }: Props) {
  return (
    <div>
      <PageHeader
        title={title}
        description={phase ? `${description} (${phase})` : description}
      />
      <EmptyState icon={icon} title="Coming soon" description={description} action={action} />
    </div>
  );
}
