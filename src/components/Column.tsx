"use client";

import { useDroppable } from "@dnd-kit/core";

export function Column({
  id,
  title,
  count,
  danger,
  children,
}: {
  id: string;
  title: string;
  count: number;
  danger?: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={`flex h-full w-72 flex-shrink-0 flex-col rounded-xl border p-2 ${
        isOver
          ? danger
            ? "border-red-400 bg-red-50 dark:border-red-600 dark:bg-red-950"
            : "border-slate-400 bg-slate-100 dark:border-slate-500 dark:bg-slate-700"
          : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60"
      }`}
    >
      <div className="mb-2 flex items-center justify-between px-1">
        <h3 className={`text-xs font-semibold ${danger ? "text-red-700 dark:text-red-400" : "text-slate-700 dark:text-slate-300"}`}>{title}</h3>
        <span className="text-[10px] text-slate-400 dark:text-slate-500">{count}</span>
      </div>
      <div className="min-h-[60px] flex-1 overflow-y-auto pb-2">{children}</div>
    </div>
  );
}
