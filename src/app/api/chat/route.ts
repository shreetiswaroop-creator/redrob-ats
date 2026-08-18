import { NextRequest, NextResponse } from "next/server";
import { createAgentUIStreamResponse, UIMessage } from "ai";
import { getSessionUser } from "@/lib/session";
import { chatbotAgent } from "@/lib/chatbot/agent";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { messages }: { messages: UIMessage[] } = await req.json();

  return createAgentUIStreamResponse({
    agent: chatbotAgent,
    uiMessages: messages,
  });
}
