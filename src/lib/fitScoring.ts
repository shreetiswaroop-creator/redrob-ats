import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { get } from "@vercel/blob";
import mammoth from "mammoth";
import WordExtractor from "word-extractor";
import { supabaseServer } from "./supabase";
import { appendAudit } from "./audit";
import { Candidate, Requisition } from "./types";

const FIT_SCORE_SCHEMA = z.object({
  fit_score: z.number().int().min(0).max(100).describe("Overall fit percentage, 0-100"),
  rationale: z
    .string()
    .describe("Plain, specific explanation of the score — which requirements are clearly met, which are missing. Not just a restatement of the number."),
  matched_requirements: z.array(z.string()).describe("JD requirements the resume shows clear evidence of meeting"),
  missing_requirements: z.array(z.string()).describe("JD requirements the resume shows no evidence of, or is unclear on"),
});

export interface FitScoreResult {
  fit_score: number;
  rationale: string;
  matched_requirements: string[];
  missing_requirements: string[];
}

type DocumentContentPart = { type: "file"; data: Buffer; mediaType: string } | { type: "text"; text: string };

// A requisition with a JD file but no typed text (or vice versa) still has a
// JD to compare against — only truly empty when there's neither.
function jdIsEmpty(requisition: Requisition): boolean {
  return !requisition.description?.trim() && !requisition.must_have_skills?.trim() && !requisition.jd_pathname;
}

async function fetchDocumentBuffer(pathname: string): Promise<Buffer> {
  const result = await get(pathname, { access: "private" });
  if (!result || result.statusCode !== 200 || !result.stream) {
    throw new Error("File could not be retrieved from storage.");
  }
  return Buffer.from(await new Response(result.stream as unknown as BodyInit).arrayBuffer());
}

// Builds a document's half of the model input — used for both the
// candidate's resume and a requisition's optional formal JD document, since
// the file-handling rules are identical either way. PDFs go straight to
// Gemini as a document part — its multimodal input reads PDFs natively, no
// separate extraction needed. .docx is extracted to plain text via mammoth
// first, since Gemini's file input doesn't parse Word XML itself. .doc (the
// old binary OLE format) is far less standardized than either; word-extractor
// is the best pure-JS reader available for it, but is a much smaller/less
// battle-tested project than mammoth — if it ever fails to extract cleanly,
// this throws with a clear reason rather than silently producing garbage,
// and this is the first thing to reconsider if that happens often in
// practice.
async function buildDocumentContentPart(pathname: string, filename: string, label: string): Promise<DocumentContentPart> {
  const lower = filename.toLowerCase();
  const buffer = await fetchDocumentBuffer(pathname);

  if (lower.endsWith(".pdf")) {
    return { type: "file", data: buffer, mediaType: "application/pdf" };
  }
  if (lower.endsWith(".docx")) {
    const { value } = await mammoth.extractRawText({ buffer });
    if (!value.trim()) throw new Error(`Could not extract any text from this ${label} .docx file.`);
    return { type: "text", text: value };
  }
  if (lower.endsWith(".doc")) {
    const extractor = new WordExtractor();
    const doc = await extractor.extract(buffer);
    const text = doc.getBody();
    if (!text?.trim()) throw new Error(`Could not extract any text from this ${label} .doc file.`);
    return { type: "text", text };
  }
  throw new Error(`Unsupported ${label} file type: ${filename}`);
}

async function scoreAgainstJd(requisition: Requisition, resumePart: DocumentContentPart): Promise<FitScoreResult> {
  const typedJdText = [
    requisition.description?.trim() ? `Job description:\n${requisition.description.trim()}` : null,
    requisition.must_have_skills?.trim() ? `Must-have skills:\n${requisition.must_have_skills.trim()}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  // The JD file is a supplementary source alongside the typed fields, not
  // the essential input the resume is — if it can't be read for any reason,
  // fall back to whatever typed JD text exists rather than failing the
  // whole scoring attempt over a secondary document.
  let jdFilePart: DocumentContentPart | null = null;
  if (requisition.jd_pathname && requisition.jd_filename) {
    try {
      jdFilePart = await buildDocumentContentPart(requisition.jd_pathname, requisition.jd_filename, "JD document");
    } catch {
      jdFilePart = null;
    }
  }

  const introText = typedJdText || (jdFilePart ? "(See the attached JD document below.)" : "(No JD text on file.)");
  const content: Array<{ type: "text"; text: string } | DocumentContentPart> = [
    { type: "text", text: `Requisition: ${requisition.title} (${requisition.req_code})\n\n${introText}` },
  ];
  if (jdFilePart) {
    content.push({ type: "text", text: "A formal JD document is attached below, in addition to the summary above." }, jdFilePart);
  }
  content.push({ type: "text", text: "The candidate's resume follows." }, resumePart);

  const { object } = await generateObject({
    model: google("gemini-flash-latest"),
    schema: FIT_SCORE_SCHEMA,
    system:
      "You are an experienced technical recruiter scoring how well a candidate's resume fits one specific job requisition. Weigh the JD's actual stated requirements — not a surface keyword match between resume buzzwords and JD buzzwords. Read the resume for real evidence of each requirement (skills actually used, years of relevant experience, domain, education, projects) rather than pattern-matching words. Score 0-100. The rationale must be plain and specific about which requirements are clearly met and which are missing or unclear — never just a restatement of the number.",
    messages: [{ role: "user", content }],
  });
  return object;
}

// Re-fetches the candidate + their CURRENT requisition fresh (never trusts a
// possibly-stale copy from whatever triggered this) and always resolves —
// never throws — writing a 'failed' status with a human-readable reason
// instead, since this runs both fire-and-forget (after() from automatic
// triggers) and awaited (the manual re-score action, which needs a real
// result to hand back to the recruiter who clicked it).
export async function runFitScoring(candidateId: string): Promise<Candidate> {
  const supabase = supabaseServer();

  const { data: candidateRow, error: candErr } = await supabase.from("candidates").select("*").eq("id", candidateId).single();
  if (candErr || !candidateRow) throw new Error(`Candidate ${candidateId} not found.`);
  const candidate = candidateRow as Candidate;

  const { data: requisitionRow } = await supabase.from("requisitions").select("*").eq("id", candidate.requisition_id).single();
  const requisition = requisitionRow as Requisition;

  async function finish(update: Partial<Candidate>, auditAction?: string, auditDetails?: string): Promise<Candidate> {
    // Re-read audit_log right before appending — this runs detached from
    // whatever request triggered it, possibly well after other edits have
    // landed, so starting from a stale copy could silently discard them.
    const { data: freshRow } = await supabase.from("candidates").select("audit_log").eq("id", candidateId).single();
    const currentLog = (freshRow?.audit_log as Candidate["audit_log"] | undefined) ?? candidate.audit_log;
    const audit_log = auditAction ? appendAudit(currentLog, "System", auditAction, auditDetails) : currentLog;

    const { data, error } = await supabase
      .from("candidates")
      .update({ ...update, audit_log })
      .eq("id", candidateId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as Candidate;
  }

  if (!candidate.resume_pathname || !candidate.resume_filename) {
    return finish({
      fit_scoring_status: "not_scored",
      fit_rationale: "No resume on file to score.",
      fit_score: null,
      fit_matched_requirements: null,
      fit_missing_requirements: null,
      fit_scored_at: null,
    });
  }

  if (!requisition || jdIsEmpty(requisition)) {
    return finish({
      fit_scoring_status: "not_scored",
      fit_rationale: "Requisition has no JD (description, must-have skills, or an attached JD document) to compare against.",
      fit_score: null,
      fit_matched_requirements: null,
      fit_missing_requirements: null,
      fit_scored_at: null,
    });
  }

  try {
    const resumePart = await buildDocumentContentPart(candidate.resume_pathname, candidate.resume_filename, "resume");
    const result = await scoreAgainstJd(requisition, resumePart);
    return await finish(
      {
        fit_score: result.fit_score,
        fit_rationale: result.rationale,
        fit_matched_requirements: result.matched_requirements,
        fit_missing_requirements: result.missing_requirements,
        fit_scored_at: new Date().toISOString(),
        fit_scoring_status: "scored",
      },
      "AI fit score computed",
      `${result.fit_score}% match against ${requisition.req_code} — ${requisition.title}`
    );
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Unknown error during AI fit scoring.";
    return finish({ fit_scoring_status: "failed", fit_rationale: reason }, "AI fit scoring failed", reason);
  }
}
