import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowLeftRight,
  Bot,
  FileBarChart,
  FileSearch,
  FolderSearch,
  LayoutDashboard,
  Network,
  Radio,
  Route,
  Settings,
  Tags,
} from "lucide-react";

export interface NavItem {
  path: string;
  label: string;
  icon?: LucideIcon;
  /** Custom SVG/PNG from /public instead of Lucide icon */
  iconSrc?: string;
  roles: string[];
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const navSections: NavSection[] = [
  {
    label: "Overview",
    items: [
      { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["viewer", "service_user", "operator", "admin"] },
    ],
  },
  {
    label: "Operations",
    items: [
      { path: "/routing-monitor", label: "Routing Monitor", icon: Radio, roles: ["service_user", "operator", "admin"] },
      { path: "/study-browser", label: "Study Browser", icon: FolderSearch, roles: ["operator", "admin"] },
      { path: "/migration-jobs", label: "Migration Jobs", icon: ArrowLeftRight, roles: ["operator", "admin"] },
      { path: "/reports", label: "Reports", icon: FileBarChart, roles: ["viewer", "service_user", "operator", "admin"] },
      { path: "/audit-logs", label: "Audit Logs", icon: FileSearch, roles: ["service_user", "operator", "admin"] },
      { path: "/chatbot", label: "Chatbot", icon: Bot, roles: ["viewer", "service_user", "operator", "admin"] },
    ],
  },
  {
    label: "Configuration",
    items: [
      { path: "/nodes", label: "Nodes", icon: Network, roles: ["admin"] },
      { path: "/routing-rules", label: "Routing Rules", icon: Route, roles: ["admin"] },
      { path: "/tag-morphing", label: "Tag Morphing", icon: Tags, roles: ["admin"] },
      { path: "/settings", label: "Settings", icon: Settings, roles: ["admin"] },
    ],
  },
  {
    label: "System",
    items: [
      { path: "/health", label: "System Health", icon: Activity, roles: ["operator", "admin"] },
    ],
  },
];

export function getVisibleNav(roles: string[]): NavSection[] {
  return navSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => item.roles.some((r) => roles.includes(r))),
    }))
    .filter((section) => section.items.length > 0);
}
