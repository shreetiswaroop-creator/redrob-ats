import { redirect } from "next/navigation";

export default function EmailTemplatesPage() {
  redirect("/settings?tab=templates");
}
