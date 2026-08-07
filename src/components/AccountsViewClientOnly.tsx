"use client";

import dynamic from "next/dynamic";

export const AccountsViewClientOnly = dynamic(() => import("./AccountsView").then((m) => m.AccountsView), {
  ssr: false,
});
