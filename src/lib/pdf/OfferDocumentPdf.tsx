import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { Candidate, DocumentTemplate, EmploymentHistoryEntry, Requisition } from "../types";
import { renderTemplate } from "../notifications";
import { buildDocumentMergeVars } from "./merge";

// The only file that touches @react-pdf/renderer primitives directly —
// everything else (document-generation.ts) deals in plain data and calls
// renderOfferDocumentPdf below.
const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: "Helvetica", color: "#1e293b" },
  headerRow: { flexDirection: "row", marginBottom: 16, borderBottom: 1, borderColor: "#cbd5e1", paddingBottom: 12 },
  photo: { width: 64, height: 64, marginRight: 12, objectFit: "cover" },
  photoPlaceholder: {
    width: 64,
    height: 64,
    marginRight: 12,
    backgroundColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
  },
  photoPlaceholderText: { fontSize: 7, color: "#94a3b8" },
  headerText: { flex: 1 },
  title: { fontSize: 14, fontWeight: 700, marginBottom: 8 },
  candidateName: { fontSize: 13, fontWeight: 700 },
  metaLine: { fontSize: 9, color: "#475569", marginTop: 2 },
  section: { marginBottom: 14 },
  sectionTitle: { fontSize: 11, fontWeight: 700, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  intro: { marginBottom: 6, color: "#334155", lineHeight: 1.4 },
  question: { marginBottom: 8, flexDirection: "row" },
  questionIndex: { width: 16, fontWeight: 700 },
  questionBody: { flex: 1 },
  questionText: { marginBottom: 3 },
  answerLine: { borderBottom: 1, borderColor: "#cbd5e1", height: 14 },
  fieldRow: { flexDirection: "row", marginBottom: 8 },
  fieldLabel: { width: 100, fontWeight: 700 },
  fieldValue: { flex: 1, borderBottom: 1, borderColor: "#cbd5e1", height: 14 },
});

export interface OfferDocumentPdfProps {
  templateLabel: string;
  candidate: Candidate;
  requisition: Requisition;
  employmentEntry: EmploymentHistoryEntry | null;
  referenceName?: string;
  photoDataUri: string | null;
  template: DocumentTemplate;
}

export function OfferDocumentPdf({
  templateLabel,
  candidate,
  requisition,
  employmentEntry,
  referenceName,
  photoDataUri,
  template,
}: OfferDocumentPdfProps) {
  const vars = buildDocumentMergeVars(candidate, requisition, employmentEntry, referenceName);
  const resolve = (t: string) => renderTemplate(t, vars);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          {photoDataUri ? (
            <Image src={photoDataUri} style={styles.photo} />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Text style={styles.photoPlaceholderText}>No photo</Text>
            </View>
          )}
          <View style={styles.headerText}>
            <Text style={styles.title}>{templateLabel}</Text>
            <Text style={styles.candidateName}>{candidate.name}</Text>
            <Text style={styles.metaLine}>
              {candidate.candidate_code} · {requisition.req_code}
            </Text>
            {candidate.final_designation ? <Text style={styles.metaLine}>{candidate.final_designation}</Text> : null}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Section A — Verification</Text>
          {employmentEntry ? (
            <>
              <Text style={styles.intro}>{resolve(template.section_a_intro)}</Text>
              {template.section_a_questions.map((q, i) => (
                <View key={q.id} style={styles.question}>
                  <Text style={styles.questionIndex}>{i + 1}.</Text>
                  <View style={styles.questionBody}>
                    <Text style={styles.questionText}>{resolve(q.prompt_template)}</Text>
                    <View style={styles.answerLine} />
                  </View>
                </View>
              ))}
            </>
          ) : (
            <Text style={styles.intro}>Academic / Other reference — no linked employment or academic record on file.</Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Section B — Rehire Eligibility &amp; Comments</Text>
          <Text style={styles.intro}>{resolve(template.section_b_text)}</Text>
          <View style={styles.answerLine} />
          <View style={{ marginTop: 8 }}>
            <View style={styles.answerLine} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Section C — Verifier Details</Text>
          <Text style={styles.intro}>{resolve(template.section_c_note)}</Text>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Name</Text>
            <View style={styles.fieldValue} />
          </View>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Designation</Text>
            <View style={styles.fieldValue} />
          </View>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Phone</Text>
            <View style={styles.fieldValue} />
          </View>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Email</Text>
            <View style={styles.fieldValue} />
          </View>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Signature</Text>
            <View style={styles.fieldValue} />
          </View>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Date</Text>
            <View style={styles.fieldValue} />
          </View>
        </View>
      </Page>
    </Document>
  );
}

export async function renderOfferDocumentPdf(props: OfferDocumentPdfProps): Promise<Buffer> {
  return renderToBuffer(<OfferDocumentPdf {...props} />);
}
