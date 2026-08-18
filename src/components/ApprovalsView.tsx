"use client";

import Link from "next/link";
import { PENDING_APPROVAL_TYPE_LABELS, PendingApprovalItem, PendingApprovalType, formatWaitingSince } from "@/lib/pendingApprovals";

// Fixed order rather than however the flat list happens to group — matches
// the order the four types are introduced in throughout the app (a
// requisition needs approving before anyone even gets to the offer stage
// where the other three can occur).
const TYPE_ORDER: PendingApprovalType[] = [
  "requisition_approval",
  "reference_exception",
  "grace_extension",
  "offer_letter_review",
  "employee_agreement_review",
];

function GroupCard({ type, items }: { type: PendingApprovalType; items: PendingApprovalItem[] }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-700">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{PENDING_APPROVAL_TYPE_LABELS[type]}</h3>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-400">
          {items.length}
        </span>
      </div>
      <ul className="divide-y divide-slate-100 dark:divide-slate-700">
        {items.map((item, i) => (
          <li key={i}>
            <Link href={item.href} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{item.title}</p>
                {item.subtitle && <p className="truncate text-xs text-slate-400 dark:text-slate-500">{item.subtitle}</p>}
              </div>
              <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">{formatWaitingSince(item.waitingSince)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ApprovalsView({ items }: { items: PendingApprovalItem[] }) {
  const groups = TYPE_ORDER.map((type) => ({ type, items: items.filter((i) => i.type === type) })).filter(
    (g) => g.items.length > 0
  );

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Approvals</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Everything waiting on HR Management across requisitions and candidates, in one place — oldest waiting first
          within each group.
        </p>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-800">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">All caught up.</p>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Nothing is waiting on HR Management right now.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((g) => (
            <GroupCard key={g.type} type={g.type} items={g.items} />
          ))}
        </div>
      )}
    </div>
  );
}
