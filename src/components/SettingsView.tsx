"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppUser, CustomFieldDefinition, EmailTemplate } from "@/lib/types";
import { AccountsViewClientOnly } from "./AccountsViewClientOnly";
import { OrgContactsSection } from "./OrgContactsSection";
import { TatDefaultsSection } from "./TatDefaultsSection";
import { BrandingSection } from "./BrandingSection";
import { EmailTemplatesView } from "./EmailTemplatesView";
import { CustomFieldsSection } from "./CustomFieldsSection";

const TABS = [
  { key: "accounts", label: "Roles & Accounts" },
  { key: "contacts", label: "Org Contacts" },
  { key: "tat", label: "TAT Defaults" },
  { key: "branding", label: "Branding" },
  { key: "templates", label: "Notification Templates" },
  { key: "custom-fields", label: "Custom Fields" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function SettingsTabs({
  initialUsers,
  currentUserId,
  initialDemoCount,
  initialTemplates,
  initialCustomFields,
}: {
  initialUsers: AppUser[];
  currentUserId: string;
  initialDemoCount: number;
  initialTemplates: EmailTemplate[];
  initialCustomFields: CustomFieldDefinition[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requested = searchParams.get("tab");
  const activeTab: TabKey = (TABS.find((t) => t.key === requested)?.key ?? "accounts") as TabKey;
  const [tab, setTab] = useState<TabKey>(activeTab);

  function selectTab(key: TabKey) {
    setTab(key);
    router.replace(`/settings?tab=${key}`);
  }

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-slate-900 dark:text-slate-100">Settings</h1>
      <p className="mb-5 text-sm text-slate-500 dark:text-slate-400">
        Org-wide configuration — visible to HR Management only.
      </p>

      <div className="mb-6 flex gap-1 border-b border-slate-200 dark:border-slate-700">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => selectTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.key
                ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "accounts" && (
        <AccountsViewClientOnly
          initialUsers={initialUsers}
          currentUserId={currentUserId}
          initialDemoCount={initialDemoCount}
        />
      )}
      {tab === "contacts" && <OrgContactsSection />}
      {tab === "tat" && <TatDefaultsSection />}
      {tab === "branding" && <BrandingSection />}
      {tab === "templates" && <EmailTemplatesView initialTemplates={initialTemplates} />}
      {tab === "custom-fields" && <CustomFieldsSection initialDefinitions={initialCustomFields} />}
    </div>
  );
}

export function SettingsView(props: {
  initialUsers: AppUser[];
  currentUserId: string;
  initialDemoCount: number;
  initialTemplates: EmailTemplate[];
  initialCustomFields: CustomFieldDefinition[];
}) {
  return (
    <Suspense>
      <SettingsTabs {...props} />
    </Suspense>
  );
}
