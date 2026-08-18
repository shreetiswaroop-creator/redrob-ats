"use client";

import dynamic from "next/dynamic";

export const ArchiveViewClientOnly = dynamic(() => import("./ArchiveView").then((m) => m.ArchiveView), {
  ssr: false,
});
