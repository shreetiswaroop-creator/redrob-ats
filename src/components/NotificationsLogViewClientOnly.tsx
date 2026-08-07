"use client";

import dynamic from "next/dynamic";

export const NotificationsLogViewClientOnly = dynamic(
  () => import("./NotificationsLogView").then((m) => m.NotificationsLogView),
  { ssr: false }
);
