import { SupabaseClient } from "@supabase/supabase-js";
import { DocumentTemplate, DocumentTemplateKey, DOCUMENT_TEMPLATE_KEYS } from "./types";

export type DocumentTemplateMap = Partial<Record<DocumentTemplateKey, DocumentTemplate>>;

// Mirrors fetchEmailTemplates in notifications.ts.
export async function fetchDocumentTemplates(supabase: SupabaseClient): Promise<DocumentTemplateMap> {
  const { data } = await supabase.from("document_templates").select("*");
  const map: DocumentTemplateMap = {};
  for (const row of (data as DocumentTemplate[]) ?? []) {
    if (DOCUMENT_TEMPLATE_KEYS.includes(row.template_key as DocumentTemplateKey)) {
      map[row.template_key as DocumentTemplateKey] = row;
    }
  }
  return map;
}
