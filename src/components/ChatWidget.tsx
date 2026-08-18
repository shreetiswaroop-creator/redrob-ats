"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { ChatbotUIMessage } from "@/lib/chatbot/agent";
import { useActor } from "@/lib/actor-context";

function ChatIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16v12H8l-4 4V4Z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

// Minimal, dependency-free markdown rendering — just enough for what the
// chatbot actually produces (bold, bullet lists, paragraphs). Not a general
// markdown parser; no tables/links/code blocks.
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={`${keyPrefix}-${i}`}>{part.slice(2, -2)}</strong>
    ) : (
      <span key={`${keyPrefix}-${i}`}>{part}</span>
    )
  );
}

function MarkdownText({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let bulletBuffer: string[] = [];

  function flushBullets(key: string) {
    if (bulletBuffer.length === 0) return;
    blocks.push(
      <ul key={key} className="my-1 list-disc space-y-0.5 pl-4">
        {bulletBuffer.map((item, i) => (
          <li key={i}>{renderInline(item, `${key}-li-${i}`)}</li>
        ))}
      </ul>
    );
    bulletBuffer = [];
  }

  lines.forEach((line, i) => {
    const bulletMatch = line.match(/^\s*[*-]\s+(.*)$/);
    if (bulletMatch) {
      bulletBuffer.push(bulletMatch[1]);
      return;
    }
    flushBullets(`ul-${i}`);
    if (line.trim() === "") {
      blocks.push(<div key={`br-${i}`} className="h-2" />);
    } else {
      blocks.push(
        <p key={`p-${i}`} className="whitespace-pre-wrap">
          {renderInline(line, `p-${i}`)}
        </p>
      );
    }
  });
  flushBullets("ul-end");

  return <>{blocks}</>;
}

function toolLabel(type: string): string {
  const key = type.replace(/^tool-/, "");
  const labels: Record<string, string> = {
    searchCandidates: "Searching candidates…",
    getCandidateDetail: "Looking up candidate…",
    searchRequisitions: "Searching requisitions…",
    getPipelineSummary: "Tallying the pipeline…",
    listUpcomingInterviews: "Checking scheduled interviews…",
    getMyPerformance: "Checking your performance…",
    getRecruiterComparison: "Comparing recruiters…",
  };
  return labels[key] ?? "Checking the database…";
}

const RECRUITER_EXAMPLE_QUESTIONS = ["How am I doing this month?", "What's my active pipeline?"];
const HR_MANAGEMENT_EXTRA_QUESTION = "Who's the highest performer this quarter?";

function MessageBubble({ message }: { message: ChatbotUIMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`mb-3 flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
          isUser
            ? "bg-indigo-600 text-white"
            : "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-100"
        }`}
      >
        {message.parts.map((part, i) => {
          if (part.type === "text") return <MarkdownText key={i} text={part.text} />;
          if (part.type.startsWith("tool-") && "state" in part && part.state !== "output-available") {
            return (
              <span key={i} className="block text-xs italic opacity-70">
                {toolLabel(part.type)}
              </span>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}

export function ChatWidget() {
  const { user } = useActor();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status, error, regenerate } = useChat<ChatbotUIMessage>({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, status]);

  const exampleQuestions =
    user?.role === "hr_management"
      ? [...RECRUITER_EXAMPLE_QUESTIONS, HR_MANAGEMENT_EXTRA_QUESTION]
      : RECRUITER_EXAMPLE_QUESTIONS;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    sendMessage({ text: input });
    setInput("");
  }

  function askExample(question: string) {
    sendMessage({ text: question });
  }

  return (
    <>
      {open && (
        <div className="fixed bottom-20 right-6 z-50 flex h-[520px] w-[360px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5 dark:border-slate-700">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Redrob Assistant</p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">Ask about candidates, requisitions, or how the app works</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
            >
              <CloseIcon />
            </button>
          </div>

          <div ref={listRef} className="flex-1 overflow-y-auto p-3">
            {messages.length === 0 && (
              <div className="flex flex-wrap gap-1.5">
                {exampleQuestions.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => askExample(q)}
                    className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 dark:border-slate-600 dark:bg-slate-700/50 dark:text-slate-300 dark:hover:border-indigo-500 dark:hover:bg-slate-700 dark:hover:text-indigo-300"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            {(status === "submitted" || status === "streaming") &&
              messages[messages.length - 1]?.role !== "assistant" && (
                <div className="mb-3 flex justify-start">
                  <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-400 dark:bg-slate-700 dark:text-slate-500">
                    Thinking…
                  </div>
                </div>
              )}
            {error && (
              <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-900 dark:text-red-300">
                Something went wrong.{" "}
                <button className="font-medium underline" onClick={() => regenerate()}>
                  Retry
                </button>
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-slate-100 p-2.5 dark:border-slate-700">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={status !== "ready"}
              placeholder="Ask a question…"
              className="flex-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-indigo-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            />
            <button
              type="submit"
              disabled={status !== "ready" || !input.trim()}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
            >
              Send
            </button>
          </form>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400"
        title="Redrob Assistant"
      >
        {open ? <CloseIcon /> : <ChatIcon />}
      </button>
    </>
  );
}
