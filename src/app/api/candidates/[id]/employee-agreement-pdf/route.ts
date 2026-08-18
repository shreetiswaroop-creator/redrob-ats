import { NextRequest, NextResponse } from "next/server";
import { put, del, get } from "@vercel/blob";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUser } from "@/lib/session";
import { appendAudit } from "@/lib/audit";
import { Candidate, OfferDocumentApproval, OrgSettings, Requisition } from "@/lib/types";
import { EMPTY_ORG_SETTINGS, fetchEmailTemplates, insertNotifications, offerDocumentNotification, recipientsSummary } from "@/lib/notifications";

const MAX_BYTES = 10 * 1024 * 1024; // 10MB

const DEFAULT_APPROVAL: OfferDocumentApproval = {
  doc_link: "",
  version: "",
  review_status: "pending",
  reviewer_comments: "",
};

// One field, uploaded twice — the recruiter's final pre-signature PDF (once
// content is approved), then HR Management's re-upload of the same field
// as the signed copy. Only the FIRST upload fires a notification
// (final_pdf_uploaded, to HR) — the re-upload's significant event is
// "signed", which fires separately via the existing signature_status
// dropdown + Save flow in ApprovalsSection, unchanged from before D4.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionUser(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { id } = await params;
  const supabase = supabaseServer();
  const { data: existing, error: fetchError } = await supabase.from("candidates").select("*").eq("id", id).single();
  if (fetchError || !existing) return NextResponse.json({ error: "Candidate not found." }, { status: 404 });
  const candidate = existing as Candidate;

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "Only PDF files are accepted." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File is too large (10MB max)." }, { status: 400 });
  }

  const current: OfferDocumentApproval = { ...DEFAULT_APPROVAL, ...candidate.offer_document_approvals.employee_agreement };
  if (current.review_status !== "approved") {
    return NextResponse.json(
      { error: "The Employee Agreement's content must be approved before uploading the final PDF." },
      { status: 400 }
    );
  }

  const isFirstUpload = !current.final_pdf_pathname;
  if (current.final_pdf_pathname) {
    await del(current.final_pdf_pathname).catch(() => {});
  }

  const pathname = `employee-agreement-pdf/${id}/${Date.now()}.pdf`;
  const blob = await put(pathname, file, { access: "private", contentType: "application/pdf" });

  const updatedApproval: OfferDocumentApproval = { ...current, final_pdf_pathname: blob.pathname, final_pdf_filename: file.name };
  const auditLabel = isFirstUpload ? "Uploaded final agreement PDF for signature" : "Uploaded signed agreement PDF";
  let auditLog = appendAudit(candidate.audit_log, session.name, auditLabel, file.name);

  if (isFirstUpload) {
    const [{ data: requisitionRow }, { data: orgSettingsRow }] = await Promise.all([
      supabase.from("requisitions").select("*").eq("id", candidate.requisition_id).single(),
      supabase.from("org_settings").select("*").eq("id", "default").single(),
    ]);
    const requisition = requisitionRow as Requisition;
    const org: OrgSettings = (orgSettingsRow as OrgSettings) ?? EMPTY_ORG_SETTINGS;
    const templates = await fetchEmailTemplates(supabase);
    const draft = offerDocumentNotification(candidate, requisition, org, "employee_agreement", "final_pdf_uploaded", templates);
    auditLog = appendAudit(auditLog, "System", "Notification logged", `${draft.subject} → ${recipientsSummary(draft.recipients)}`);

    const { data, error } = await supabase
      .from("candidates")
      .update({
        offer_document_approvals: { ...candidate.offer_document_approvals, employee_agreement: updatedApproval },
        audit_log: auditLog,
      })
      .eq("id", id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await insertNotifications(supabase, [draft], candidate.requisition_id, id, org);
    return NextResponse.json(data);
  }

  const { data, error } = await supabase
    .from("candidates")
    .update({
      offer_document_approvals: { ...candidate.offer_document_approvals, employee_agreement: updatedApproval },
      audit_log: auditLog,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionUser(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { id } = await params;
  const supabase = supabaseServer();
  const { data: existing, error: fetchError } = await supabase.from("candidates").select("*").eq("id", id).single();
  if (fetchError || !existing) return NextResponse.json({ error: "Candidate not found." }, { status: 404 });
  const candidate = existing as Candidate;

  const approval = candidate.offer_document_approvals.employee_agreement;
  if (!approval?.final_pdf_pathname) {
    return NextResponse.json({ error: "No agreement PDF on file for this candidate." }, { status: 404 });
  }

  const result = await get(approval.final_pdf_pathname, { access: "private" });
  if (!result || result.statusCode !== 200 || !result.stream) {
    return NextResponse.json({ error: "Document could not be retrieved." }, { status: 404 });
  }

  return new NextResponse(result.stream, {
    headers: {
      "Content-Type": result.blob.contentType ?? "application/pdf",
      "Content-Disposition": `attachment; filename="${(approval.final_pdf_filename ?? "employee-agreement.pdf").replace(/"/g, "")}"`,
    },
  });
}
