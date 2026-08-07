import { Stage } from "./types";

export type ColumnDef =
  | { key: "requisitions"; label: string; kind: "requisition" }
  | { key: Stage; label: string; kind: "candidate" };

export const COLUMNS: ColumnDef[] = [
  { key: "requisitions", label: "1. Requisitions", kind: "requisition" },
  { key: "sourcing", label: "2. Sourcing", kind: "candidate" },
  { key: "screening", label: "3. Screening", kind: "candidate" },
  { key: "interview", label: "4. Interview Round(s)", kind: "candidate" },
  { key: "selected_awaiting_final_details", label: "5. Selected – Awaiting Final Details", kind: "candidate" },
  { key: "offer_process", label: "6. Offer Process", kind: "candidate" },
  { key: "offer_accepted_completed", label: "7. Offer Accepted / Completed", kind: "candidate" },
  { key: "handover_to_hrms", label: "8. Handover to HRMS", kind: "candidate" },
];

export const REJECTED_COLUMN_KEY = "rejected";
