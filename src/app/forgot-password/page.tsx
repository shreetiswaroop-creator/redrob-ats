"use client";

import Link from "next/link";
import { useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { RedrobLogo } from "@/components/RedrobLogo";

const inputClass =
  "mb-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 placeholder:text-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-indigo-400 dark:focus:ring-indigo-400 dark:placeholder:text-slate-500";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => {});
    setLoading(false);
    // Always shown, regardless of what the API actually did — the response
    // itself never reveals whether the email matched an account.
    setSubmitted(true);
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-900">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="mb-6">
          <RedrobLogo size="lg" />
        </div>

        {submitted ? (
          <>
            <h1 className="mb-1 text-xl font-semibold text-slate-900 dark:text-slate-100">Check your email</h1>
            <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
              If an account exists for <span className="font-medium text-slate-700 dark:text-slate-300">{email}</span>, we&apos;ve
              sent a link to reset your password. It expires in 1 hour.
            </p>
            <Link href="/login" className="text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400">
              Back to sign in
            </Link>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <h1 className="mb-1 text-xl font-semibold text-slate-900 dark:text-slate-100">Forgot password</h1>
            <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
              Enter your work email and we&apos;ll send you a link to reset your password.
            </p>

            <input
              type="email"
              autoFocus
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Work email"
              required
              className={inputClass}
            />

            <button
              type="submit"
              disabled={loading}
              className="mb-3 w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
            >
              {loading ? "Sending…" : "Send reset link"}
            </button>

            <Link href="/login" className="text-sm text-slate-500 hover:underline dark:text-slate-400">
              Back to sign in
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
