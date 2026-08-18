"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { PendingApprovalItem, formatWaitingSince } from "@/lib/pendingApprovals";

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M4 7a5 5 0 0 1 10 0c0 4 1.5 5 1.5 5h-13S4 11 4 7Z" />
      <path d="M7.5 15a1.5 1.5 0 0 0 3 0" />
    </svg>
  );
}

const PREVIEW_COUNT = 6;

// hr_management-only, mounted in AppShell's top bar so it's visible from
// every page — this is the "impossible to miss" half of consolidating
// approvals; the /approvals page (ApprovalsView.tsx) is the "sit down and
// work through everything" half. Both read the same computePendingApprovals
// list via GET /api/pending-approvals, so they can never disagree.
export function ApprovalsBell() {
  const [items, setItems] = useState<PendingApprovalItem[]>([]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .listPendingApprovals()
      .then(({ items }) => setItems(items))
      .catch(() => {});
  }, []);

  // Re-check whenever the dropdown opens — cheap, and keeps the preview from
  // going stale across a long-lived tab without needing a polling interval.
  function handleToggle() {
    setOpen((v) => {
      const next = !v;
      if (next) api.listPendingApprovals().then(({ items }) => setItems(items)).catch(() => {});
      return next;
    });
  }

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={handleToggle}
        title="Pending approvals"
        className="relative flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
      >
        <BellIcon />
        {items.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white">
            {items.length > 99 ? "99+" : items.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-600 dark:bg-slate-800">
          <div className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Pending approvals</p>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">Oldest waiting first</p>
          </div>

          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-slate-400 dark:text-slate-500">Nothing waiting on you right now.</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {items.slice(0, PREVIEW_COUNT).map((item, i) => (
                <li key={i}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="block px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">{item.typeLabel}</span>
                      <span className="shrink-0 text-[11px] text-slate-400 dark:text-slate-500">{formatWaitingSince(item.waitingSince)}</span>
                    </div>
                    <p className="truncate text-sm text-slate-800 dark:text-slate-100">{item.title}</p>
                    {item.subtitle && <p className="truncate text-xs text-slate-400 dark:text-slate-500">{item.subtitle}</p>}
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <Link
            href="/approvals"
            onClick={() => setOpen(false)}
            className="block border-t border-slate-100 px-3 py-2 text-center text-xs font-medium text-indigo-600 hover:bg-slate-50 dark:border-slate-700 dark:text-indigo-400 dark:hover:bg-slate-700"
          >
            View all{items.length > 0 ? ` (${items.length})` : ""}
          </Link>
        </div>
      )}
    </div>
  );
}
