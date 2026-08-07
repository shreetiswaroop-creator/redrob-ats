"use client";

import dynamic from "next/dynamic";

export const BoardAppClientOnly = dynamic(() => import("./BoardApp").then((m) => m.BoardApp), {
  ssr: false,
});
