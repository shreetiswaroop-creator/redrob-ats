// Sends real email via the Gmail API using a per-user or common-mailbox
// access token (gmail.send scope only — no inbox access). Never called
// directly; goes through deliverNotification() in notifications.ts, which
// gates everything behind org_settings.live_sending_enabled.
function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function encodeHeaderWord(value: string): string {
  // RFC 2047 encoded-word, so names/subjects with non-ASCII characters
  // (accents, emoji, etc.) survive rather than getting mangled.
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

// RFC 2045 requires base64 body content wrapped at 76 characters — Gmail's
// API is lenient about this, but well-formed MIME shouldn't rely on that.
function wrapBase64(base64: string): string {
  return base64.match(/.{1,76}/g)?.join("\r\n") ?? base64;
}

export async function sendGmailMessage(params: {
  accessToken: string;
  fromLabel: string; // display name of the connected account, e.g. "Shreeti Swaroop"
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
  attachments?: { filename: string; contentType: string; content: Buffer }[];
}): Promise<{ messageId: string }> {
  const to = params.to.filter(Boolean);
  const cc = (params.cc ?? []).filter(Boolean);
  if (to.length === 0) throw new Error("No recipient with an email on file — nothing to send to.");

  const baseHeaders = [
    `From: ${encodeHeaderWord(params.fromLabel)}`,
    `To: ${to.join(", ")}`,
    cc.length > 0 ? `Cc: ${cc.join(", ")}` : null,
    `Subject: ${encodeHeaderWord(params.subject)}`,
    "MIME-Version: 1.0",
  ].filter((line): line is string => line !== null);

  let message: string;
  if (params.attachments && params.attachments.length > 0) {
    const boundary = `----=_RedrobPart_${Math.random().toString(36).slice(2)}`;
    const parts: string[] = [`--${boundary}`, "Content-Type: text/plain; charset=UTF-8", "", params.body, ""];
    for (const attachment of params.attachments) {
      parts.push(
        `--${boundary}`,
        `Content-Type: ${attachment.contentType}; name="${attachment.filename}"`,
        `Content-Disposition: attachment; filename="${attachment.filename}"`,
        "Content-Transfer-Encoding: base64",
        "",
        wrapBase64(attachment.content.toString("base64")),
        ""
      );
    }
    parts.push(`--${boundary}--`);
    const headers = [...baseHeaders, `Content-Type: multipart/mixed; boundary="${boundary}"`].join("\r\n");
    message = `${headers}\r\n\r\n${parts.join("\r\n")}`;
  } else {
    const headers = [...baseHeaders, "Content-Type: text/plain; charset=UTF-8"].join("\r\n");
    message = `${headers}\r\n\r\n${params.body}`;
  }

  const raw = base64UrlEncode(message);

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) throw new Error(`Gmail send failed: ${await res.text()}`);
  const data = await res.json();
  return { messageId: data.id as string };
}
