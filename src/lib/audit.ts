import { AuditLogEntry } from "./types";

export function appendAudit(
  log: AuditLogEntry[],
  actor: string,
  action: string,
  details?: string
): AuditLogEntry[] {
  return [
    ...log,
    {
      timestamp: new Date().toISOString(),
      actor: actor || "Unknown",
      action,
      details,
    },
  ];
}
