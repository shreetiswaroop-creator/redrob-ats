import { tool } from "ai";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase";
import { STAGE_LABELS, REQUISITION_STATUS_LABELS, Candidate, Requisition } from "@/lib/types";
import { SessionPayload } from "@/lib/session";
import { computeRecruiterMetrics, emptyRecruiterMetrics, DateRangeKey, DATE_RANGE_OPTIONS } from "@/lib/recruiterMetrics";

const RANGE_KEYS = DATE_RANGE_OPTIONS.map((o) => o.key) as [DateRangeKey, ...DateRangeKey[]];

async function fetchRecruiterMetricsInputs(): Promise<{ requisitions: Requisition[]; candidates: Candidate[] }> {
  const supabase = supabaseServer();
  const [reqRes, candRes] = await Promise.all([
    supabase.from("requisitions").select("*"),
    supabase.from("candidates").select("*"),
  ]);
  return {
    requisitions: (reqRes.data as Requisition[]) ?? [],
    candidates: (candRes.data as Candidate[]) ?? [],
  };
}

const CANDIDATE_LIST_COLUMNS =
  "candidate_code, name, requisition_id, current_stage, status, priority, on_hold, on_hold_note, rejection_reason, archived, archived_reason";
const CANDIDATE_DETAIL_COLUMNS =
  "candidate_code, name, phone, personal_email, owner, hiring_manager, requisition_id, current_stage, stage_entered_at, status, rejected_from_stage, rejection_reason, rejected_at, priority, on_hold, on_hold_note, notice_period, current_ctc, expected_ctc, current_location, source, relevant_experience_years, notes, final_compensation, final_doj, final_designation, final_location, final_details_locked, interview_rounds, offer_steps, archived, archived_reason, archived_at, created_at";

async function requisitionLabelsByIds(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const supabase = supabaseServer();
  const { data } = await supabase.from("requisitions").select("id, req_code, title").in("id", ids);
  return new Map((data ?? []).map((r) => [r.id, `${r.req_code} — ${r.title}`]));
}

export const searchCandidatesTool = tool({
  description:
    "Search candidates by name/code substring and/or filters. Use this for questions like 'how many candidates are in interview round for REQ1005' or 'find candidates named Rohan' or 'list P1 candidates on hold'. Returns up to 25 matches — narrow with filters if the result looks truncated.",
  inputSchema: z.object({
    query: z.string().optional().describe("Free-text match against candidate name or candidate code (e.g. 'CAND4009' or 'Rohan')"),
    requisitionCode: z.string().optional().describe("Exact requisition code, e.g. 'REQ1005'"),
    stage: z
      .enum([
        "sourcing",
        "screening",
        "interview",
        "selected_awaiting_final_details",
        "offer_process",
        "offer_accepted_completed",
        "handover_to_hrms",
      ])
      .optional()
      .describe("Kanban stage to filter by"),
    status: z.enum(["active", "rejected"]).optional().describe("'rejected' for the Rejected column, 'active' for everyone else"),
    priority: z.enum(["P1", "P2", "P3"]).optional(),
    onHoldOnly: z.boolean().optional().describe("true to only return candidates currently flagged on-hold"),
    includeArchived: z.boolean().optional().describe("Set true to include archived candidates (default excludes them, matching the live Kanban)"),
  }),
  execute: async ({ query, requisitionCode, stage, status, priority, onHoldOnly, includeArchived }) => {
    const supabase = supabaseServer();

    let requisitionId: string | undefined;
    if (requisitionCode) {
      const { data } = await supabase.from("requisitions").select("id").ilike("req_code", requisitionCode).maybeSingle();
      if (!data) return { matches: [], note: `No requisition found matching code "${requisitionCode}".` };
      requisitionId = data.id;
    }

    let q = supabase.from("candidates").select(CANDIDATE_LIST_COLUMNS).limit(25);
    if (query) q = q.or(`name.ilike.%${query}%,candidate_code.ilike.%${query}%`);
    if (requisitionId) q = q.eq("requisition_id", requisitionId);
    if (stage) q = q.eq("current_stage", stage);
    if (status) q = q.eq("status", status);
    if (priority) q = q.eq("priority", priority);
    if (onHoldOnly) q = q.eq("on_hold", true);
    if (!includeArchived) q = q.eq("archived", false);

    const { data, error } = await q;
    if (error) return { matches: [], note: `Query failed: ${error.message}` };

    const reqLabels = await requisitionLabelsByIds(Array.from(new Set((data ?? []).map((c) => c.requisition_id))));
    const matches = (data ?? []).map((c) => ({
      candidate_code: c.candidate_code,
      name: c.name,
      requisition: reqLabels.get(c.requisition_id) ?? "unknown",
      stage: STAGE_LABELS[c.current_stage as keyof typeof STAGE_LABELS],
      status: c.status,
      priority: c.priority,
      on_hold: c.on_hold,
      on_hold_note: c.on_hold_note,
      rejection_reason: c.rejection_reason,
      archived: c.archived,
      archived_reason: c.archived_reason,
    }));
    return { matches, count: matches.length, truncated: matches.length === 25 };
  },
});

export const getCandidateDetailTool = tool({
  description: "Get full detail for exactly one candidate by their candidate code (e.g. 'CAND4009'). Use after searchCandidates to answer a follow-up question about a specific person.",
  inputSchema: z.object({
    candidateCode: z.string(),
  }),
  execute: async ({ candidateCode }) => {
    const supabase = supabaseServer();
    const { data, error } = await supabase
      .from("candidates")
      .select(CANDIDATE_DETAIL_COLUMNS)
      .ilike("candidate_code", candidateCode)
      .maybeSingle();
    if (error) return { found: false, note: `Query failed: ${error.message}` };
    if (!data) return { found: false, note: `No candidate found with code "${candidateCode}".` };

    const reqLabels = await requisitionLabelsByIds([data.requisition_id]);
    return {
      found: true,
      candidate: {
        ...data,
        requisition: reqLabels.get(data.requisition_id) ?? "unknown",
        stage_label: STAGE_LABELS[data.current_stage as keyof typeof STAGE_LABELS],
      },
    };
  },
});

export const searchRequisitionsTool = tool({
  description: "Search requisitions (open positions) by title/code substring and/or status. Use for 'what requisitions are on hold' or 'tell me about REQ1005'.",
  inputSchema: z.object({
    query: z.string().optional().describe("Free-text match against title or req_code"),
    status: z.enum(["raised", "approved", "fulfilled", "on_hold", "expired"]).optional(),
    includeArchived: z.boolean().optional().describe("Set true to include archived requisitions (default excludes them)"),
  }),
  execute: async ({ query, status, includeArchived }) => {
    const supabase = supabaseServer();
    let q = supabase
      .from("requisitions")
      .select("req_code, title, department, level, location, headcount, position_type, hiring_manager, status, status_note, archived, archived_reason, archived_at")
      .limit(25);
    if (query) q = q.or(`title.ilike.%${query}%,req_code.ilike.%${query}%`);
    if (status) q = q.eq("status", status);
    if (!includeArchived) q = q.eq("archived", false);

    const { data, error } = await q;
    if (error) return { matches: [], note: `Query failed: ${error.message}` };
    const matches = (data ?? []).map((r) => ({
      ...r,
      status_label: REQUISITION_STATUS_LABELS[r.status as keyof typeof REQUISITION_STATUS_LABELS],
    }));
    return { matches, count: matches.length };
  },
});

export const getPipelineSummaryTool = tool({
  description: "Get a count of active (non-rejected, non-archived) candidates per Kanban stage, optionally scoped to one requisition by code. Use for 'how many candidates do we have overall' or 'how many are in screening for REQ1006'.",
  inputSchema: z.object({
    requisitionCode: z.string().optional(),
  }),
  execute: async ({ requisitionCode }) => {
    const supabase = supabaseServer();
    let requisitionId: string | undefined;
    if (requisitionCode) {
      const { data } = await supabase.from("requisitions").select("id").ilike("req_code", requisitionCode).maybeSingle();
      if (!data) return { note: `No requisition found matching code "${requisitionCode}".` };
      requisitionId = data.id;
    }

    let q = supabase.from("candidates").select("current_stage, status, archived");
    if (requisitionId) q = q.eq("requisition_id", requisitionId);
    const { data, error } = await q;
    if (error) return { note: `Query failed: ${error.message}` };

    const rows = data ?? [];
    const byStage: Record<string, number> = {};
    let rejectedCount = 0;
    let archivedCount = 0;
    for (const r of rows) {
      if (r.archived) {
        archivedCount++;
        continue;
      }
      if (r.status === "rejected") {
        rejectedCount++;
        continue;
      }
      const label = STAGE_LABELS[r.current_stage as keyof typeof STAGE_LABELS] ?? r.current_stage;
      byStage[label] = (byStage[label] ?? 0) + 1;
    }
    return { by_stage: byStage, rejected: rejectedCount, archived: archivedCount, total_candidates: rows.length };
  },
});

export const listUpcomingInterviewsTool = tool({
  description: "List scheduled interviews, optionally filtered to a candidate name/code substring, ordered soonest first. Use for 'what interviews are coming up' or 'when is Rohan's interview'.",
  inputSchema: z.object({
    candidateQuery: z.string().optional(),
    limit: z.number().int().min(1).max(25).optional(),
  }),
  execute: async ({ candidateQuery, limit }) => {
    const supabase = supabaseServer();
    const { data, error } = await supabase
      .from("interviews")
      .select("round_number, scheduled_at, candidates(name, candidate_code), requisitions(title, req_code)")
      .order("scheduled_at", { ascending: true })
      .limit(limit ?? 25);
    if (error) return { matches: [], note: `Query failed: ${error.message}` };

    type Row = {
      round_number: number;
      scheduled_at: string;
      candidates: { name: string; candidate_code: string } | null;
      requisitions: { title: string; req_code: string } | null;
    };
    let rows = (data ?? []) as unknown as Row[];
    if (candidateQuery) {
      const needle = candidateQuery.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.candidates?.name.toLowerCase().includes(needle) || r.candidates?.candidate_code.toLowerCase().includes(needle)
      );
    }
    return {
      matches: rows.map((r) => ({
        candidate: r.candidates ? `${r.candidates.name} (${r.candidates.candidate_code})` : "unknown",
        requisition: r.requisitions ? `${r.requisitions.req_code} — ${r.requisitions.title}` : "unknown",
        round_number: r.round_number,
        scheduled_at: r.scheduled_at,
      })),
    };
  },
});

// Both performance tools below are built as factories over the caller's
// session (rather than module-level `tool()` constants like the ones above)
// so the scoping is a closure, not a model-trusted input — the same
// session-threading path createChatbotAgent(session) uses for both.

export function createGetMyPerformanceTool(session: SessionPayload) {
  return tool({
    description:
      "Get the signed-in user's own recruiter performance metrics (active pipeline size, requisitions closed, time to fill, offer acceptance rate, rejection reason by stage, TAT adherence, time to first action). Use for questions like 'how am I doing' or 'what's my offer acceptance rate.' Always returns only the caller's own numbers, regardless of any name mentioned in the question.",
    inputSchema: z.object({
      range: z
        .enum(RANGE_KEYS)
        .optional()
        .describe("Time period for period-scoped metrics (requisitions closed, time to fill, etc). Defaults to 'all'. Current-state metrics like active pipeline size are unaffected by this."),
    }),
    execute: async ({ range }) => {
      const { requisitions, candidates } = await fetchRecruiterMetricsInputs();
      const allMetrics = computeRecruiterMetrics(requisitions, candidates, range ?? "all");
      const mine = allMetrics.find((m) => m.owner === session.name) ?? emptyRecruiterMetrics(session.name);
      return { metrics: mine };
    },
  });
}

export function createGetRecruiterComparisonTool(session: SessionPayload) {
  return tool({
    description:
      "Compare performance metrics across all recruiters. Use for questions like 'who is the highest performer' or 'compare recruiter performance.' HR Management only.",
    inputSchema: z.object({
      range: z.enum(RANGE_KEYS).optional().describe("Time period for period-scoped metrics. Defaults to 'all'."),
    }),
    execute: async ({ range }) => {
      // Enforced here, not left to the model's judgment about whether to
      // call this tool — a recruiter calling it (however the question was
      // phrased) always gets refused, never real data.
      if (session.role !== "hr_management") {
        return {
          authorized: false,
          note: "Not authorized: comparing recruiters is restricted to HR Management. Offer to show the caller their own performance via getMyPerformance instead.",
        };
      }
      const { requisitions, candidates } = await fetchRecruiterMetricsInputs();
      const allMetrics = computeRecruiterMetrics(requisitions, candidates, range ?? "all");
      return { authorized: true, metrics: allMetrics };
    },
  });
}
