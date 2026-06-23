import { Node } from "../types/api";

export function nodeIsSource(node: Pick<Node, "node_type">): boolean {
  return node.node_type === "source" || node.node_type === "both";
}

export function nodeIsDestination(node: Pick<Node, "node_type">): boolean {
  return node.node_type === "destination" || node.node_type === "both";
}

export function formatNodeType(node: Pick<Node, "node_type">): string {
  if (node.node_type === "both") return "Source · Destination";
  if (node.node_type === "source") return "Source";
  return "Destination";
}

/** Source PACS nodes eligible for migration (QIDO/WADO require DICOMweb URL). */
export function migrationSourceNodes(nodes: Node[]): Node[] {
  return nodes
    .filter((n) => nodeIsSource(n) && n.is_active && !!n.dicomweb_url?.trim())
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Destination PACS nodes eligible for migration (STOW-RS via DICOMweb URL). */
export function migrationDestinationNodes(nodes: Node[]): Node[] {
  return nodes
    .filter((n) => nodeIsDestination(n) && n.is_active && !!n.dicomweb_url?.trim())
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Destination nodes eligible for live routing (STOW-RS). */
export function routingDestinationNodes(nodes: Node[]): Node[] {
  return migrationDestinationNodes(nodes);
}

/** Nodes list with an optional node id removed (e.g. hide source from destination picker). */
export function nodesExcluding(nodes: Node[], excludeId?: string): Node[] {
  if (!excludeId) return nodes;
  return nodes.filter((node) => node.id !== excludeId);
}

export function isSameNodePair(sourceId: string, destinationId: string): boolean {
  return Boolean(sourceId && destinationId && sourceId === destinationId);
}

export const SAME_NODE_PAIR_MESSAGE =
  "Source and destination must be different nodes.";

export function nodeLabel(node: Node): string {
  const parts = [node.name];
  if (node.protocol === "DIMSE" && node.ae_title) {
    parts.push(`AE: ${node.ae_title}`);
  }
  if (node.dicomweb_url) {
    parts.push("DICOMweb");
  }
  return parts.join(" · ");
}

export type NodeFormState = {
  name: string;
  node_type: Node["node_type"];
  protocol: "DIMSE" | "DICOMweb";
  host: string;
  port: number | null;
  ae_title: string;
  dicomweb_url: string;
  auth_type: "none" | "basic" | "bearer" | "apikey";
  auth_username: string;
  auth_password: string;
  auth_token: string;
  auth_api_key: string;
  auth_api_key_header: string;
  is_active: boolean;
};

export const emptyNodeForm: NodeFormState = {
  name: "",
  node_type: "destination",
  protocol: "DICOMweb",
  host: "",
  port: null,
  ae_title: "",
  dicomweb_url: "",
  auth_type: "none",
  auth_username: "",
  auth_password: "",
  auth_token: "",
  auth_api_key: "",
  auth_api_key_header: "X-API-Key",
  is_active: true,
};

export function nodeToForm(node: Node): NodeFormState {
  const cfg = node.auth_config ?? {};
  return {
    name: node.name,
    node_type: node.node_type,
    protocol: node.protocol,
    host: node.host,
    port: node.port,
    ae_title: node.ae_title ?? "",
    dicomweb_url: node.dicomweb_url ?? "",
    auth_type: node.auth_type ?? "none",
    auth_username: cfg.username ?? "",
    auth_password: "",
    auth_token: "",
    auth_api_key: "",
    auth_api_key_header: cfg.header_name ?? "X-API-Key",
    is_active: node.is_active,
  };
}

function buildAuthConfig(
  form: NodeFormState,
  existingAuth?: Record<string, string> | null,
): Record<string, string> | null {
  if (form.auth_type === "none") return null;

  if (form.auth_type === "basic") {
    const username = form.auth_username.trim();
    const password = form.auth_password || existingAuth?.password || "";
    if (!username && !password) return null;
    return { username, password };
  }

  if (form.auth_type === "bearer") {
    const token = form.auth_token || existingAuth?.token || "";
    return token ? { token } : null;
  }

  if (form.auth_type === "apikey") {
    const api_key = form.auth_api_key || existingAuth?.api_key || "";
    if (!api_key) return null;
    return {
      header_name: form.auth_api_key_header.trim() || "X-API-Key",
      api_key,
    };
  }

  return null;
}

export function buildNodePayload(
  form: NodeFormState,
  forUpdate: boolean,
  existingAuth?: Record<string, string> | null,
) {
  const normalized = {
    name: form.name.trim(),
    node_type: form.node_type,
    protocol: form.protocol,
    host: form.host.trim(),
    port: form.port ?? null,
    ae_title: form.ae_title.trim() || null,
    dicomweb_url: form.dicomweb_url.trim() || null,
    auth_type: form.auth_type || "none",
    auth_config: buildAuthConfig(form, forUpdate ? existingAuth : null),
    is_active: form.is_active,
  };

  return normalized;
}

export function isNodeAuthValid(form: NodeFormState, forUpdate: boolean): boolean {
  if (form.auth_type === "none") return true;
  if (form.auth_type === "basic") {
    return Boolean(form.auth_username.trim() && (forUpdate || form.auth_password));
  }
  if (form.auth_type === "bearer") {
    return Boolean(forUpdate || form.auth_token.trim());
  }
  if (form.auth_type === "apikey") {
    return Boolean(forUpdate || form.auth_api_key.trim());
  }
  return true;
}
