export interface PermissionRow {
  permission: string;
  admin: boolean;
  operator: boolean;
  service_user: boolean;
  viewer: boolean;
}

/** Read-only mirror of Synapse nav/API access — roles are managed in Keycloak. */
export const PERMISSION_MATRIX: PermissionRow[] = [
  { permission: "Configure PACS nodes", admin: true, operator: false, service_user: false, viewer: false },
  { permission: "Manage routing rules", admin: true, operator: false, service_user: false, viewer: false },
  { permission: "Manage tag morphing rules", admin: true, operator: false, service_user: false, viewer: false },
  { permission: "Toggle promiscuous mode", admin: true, operator: false, service_user: false, viewer: false },
  { permission: "Create migration jobs", admin: true, operator: true, service_user: false, viewer: false },
  { permission: "Start / pause / cancel jobs", admin: true, operator: true, service_user: false, viewer: false },
  { permission: "Retry failed studies", admin: true, operator: true, service_user: false, viewer: false },
  { permission: "View routing monitor", admin: true, operator: true, service_user: true, viewer: false },
  { permission: "View audit log", admin: true, operator: true, service_user: true, viewer: false },
  { permission: "Use Synapse Assistant", admin: true, operator: true, service_user: true, viewer: true },
  { permission: "View dashboard & reports", admin: true, operator: true, service_user: true, viewer: true },
  { permission: "Change system configuration", admin: true, operator: false, service_user: false, viewer: false },
];
