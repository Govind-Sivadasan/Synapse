const ROUTING_STATUS_LABELS: Record<string, string> = {
  success: "Success",
  failed: "Failed",
  partial: "Partial success",
  no_match: "No rule match",
  pending: "Pending",
};

export function routingStatusLabel(code: string): string {
  const key = code.toLowerCase();
  if (ROUTING_STATUS_LABELS[key]) return ROUTING_STATUS_LABELS[key];
  return humanizeCode(code);
}

function humanizeCode(code: string): string {
  return code.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
