"use client";

import { useEffect, useRef, useState } from "react";

export function BrandingSection() {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/org-settings/logo")
      .then((r) => r.json())
      .then((data) => {
        setLogoUrl(data.logo_url ?? null);
        setLoaded(true);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load logo."));
  }, []);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/org-settings/logo", { method: "POST", body: formData });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Something went wrong.");
      setLogoUrl(body.logo_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/org-settings/logo", { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Something went wrong.");
      setLogoUrl(body.logo_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>;

  return (
    <div className="max-w-sm">
      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
        Uploaded logo replaces the default Redrob mark across the app (sidebar, login screen). Falls back to the
        default automatically if none is uploaded.
      </p>

      <div className="mb-3 flex h-20 items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 p-3 dark:border-slate-600 dark:bg-slate-900">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="Current logo" className="h-full w-auto object-contain" />
        ) : (
          <span className="text-xs text-slate-400 dark:text-slate-500">Using default Redrob logo</span>
        )}
      </div>

      {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex gap-2">
        <label className="inline-block cursor-pointer rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700">
          {busy ? "Working…" : logoUrl ? "Replace logo" : "Upload logo"}
          <input ref={fileInputRef} type="file" accept=".png,.jpg,.jpeg,.svg,.webp" className="hidden" onChange={handleUpload} disabled={busy} />
        </label>
        {logoUrl && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={busy}
            className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
