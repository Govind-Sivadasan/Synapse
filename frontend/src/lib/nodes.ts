import { Node } from "../types/api";

/** Source PACS nodes eligible for migration (QIDO/WADO require DICOMweb URL). */
export function migrationSourceNodes(nodes: Node[]): Node[] {
  return nodes
    .filter((n) => n.node_type === "source" && n.is_active && !!n.dicomweb_url?.trim())
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Destination PACS nodes eligible for migration (STOW-RS via DICOMweb URL). */
export function migrationDestinationNodes(nodes: Node[]): Node[] {
  return nodes
    .filter((n) => n.node_type === "destination" && n.is_active && !!n.dicomweb_url?.trim())
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Destination nodes eligible for live routing (STOW-RS). */
export function routingDestinationNodes(nodes: Node[]): Node[] {
  return migrationDestinationNodes(nodes);
}

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
  node_type: "source" | "destination";
  protocol: "DIMSE" | "DICOMweb";
  host: string;
  port: number | null;
  ae_title: string;
  dicomweb_url: string;
  auth_type: "none" | "basic" | "bearer" | "apikey";
  is_active: boolean;
};

export function buildNodePayload(form: NodeFormState, forUpdate: boolean) {
  const normalized = {
    name: form.name.trim(),
    node_type: form.node_type,
    protocol: form.protocol,
    host: form.host.trim(),
    port: form.port ?? null,
    ae_title: form.ae_title.trim() || null,
    dicomweb_url: form.dicomweb_url.trim() || null,
    auth_type: form.auth_type || "none",
    is_active: form.is_active,
  };

  if (!forUpdate) {
    return normalized;
  }

  return normalized;
}
