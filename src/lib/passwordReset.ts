import { SupabaseClient } from "@supabase/supabase-js";
import { NotificationRecipient, OrgSettings } from "./types";
import { resolveOutboundSender } from "./notifications";
import { decryptToken } from "./token-crypto";
import { refreshAccessToken } from "./google-oauth";
import { sendGmailMessage } from "./google-gmail";

// Account-security email, not a candidate/requisition one — always sent (or
// logged) from the Common HR Mailbox via resolveOutboundSender(supabase,
// null), same fallback branch document-generation.ts uses for its non-
// candidate-owned sends. Not part of the editable email_templates system:
// that system is for candidate-facing offer/reference content, and this
// wording is fixed, internal-account copy.
export async function sendPasswordResetEmail(
  supabase: SupabaseClient,
  org: Pick<OrgSettings, "live_sending_enabled">,
  params: { to: string; recipientName: string; resetUrl: string }
): Promise<void> {
  const subject = "Reset your Redrob ATS password";
  const body = `Hi ${params.recipientName},\n\nSomeone (hopefully you) requested a password reset for your Redrob ATS account.\n\nReset your password: ${params.resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, you can safely ignore this email — your password won't change.`;

  const recipients: NotificationRecipient[] = [{ role: "Account holder", name: params.recipientName, email: params.to }];
  const now = new Date().toISOString();

  let status: "sent" | "failed" = "sent";
  let senderMailbox: string | null = null;
  let gmailMessageId: string | null = null;
  let cancelReason: string | null = null;

  if (org.live_sending_enabled) {
    const sender = await resolveOutboundSender(supabase, null);
    if (sender) {
      try {
        const refreshToken = decryptToken(sender.senderEncryptedToken);
        const { access_token } = await refreshAccessToken(refreshToken);
        const result = await sendGmailMessage({
          accessToken: access_token,
          fromLabel: sender.senderName ?? "Redrob HR",
          to: [params.to],
          subject,
          body,
        });
        senderMailbox = sender.senderMailboxLabel;
        gmailMessageId = result.messageId;
      } catch (err) {
        status = "failed";
        cancelReason = err instanceof Error ? err.message : "Send failed";
      }
    } else {
      // No Common HR Mailbox connected — logged below same as every other
      // notification is when there's nowhere to actually send it from.
      status = "failed";
      cancelReason = "No Common HR Mailbox connected.";
    }
  }

  await supabase.from("notifications").insert({
    trigger_event: "password_reset_requested",
    requisition_id: null,
    candidate_id: null,
    recipients,
    subject,
    body,
    status,
    scheduled_send_at: now,
    sent_at: status === "sent" ? now : null,
    sender_mailbox: senderMailbox,
    gmail_message_id: gmailMessageId,
    cancel_reason: cancelReason,
  });
}

// Sent once, at account-creation time, as an alternative to HR typing a
// temporary password and sharing it out of band. Reuses the exact same
// token mechanism as "forgot password" (password_reset_token_hash/
// password_reset_expires_at, the same /reset-password page) — an invite
// link IS a password-reset link, just issued proactively instead of on
// request. Unlike sendPasswordResetEmail (which always returns success to
// avoid leaking whether an email exists — irrelevant here, the caller
// already knows the account exists since they just created it), this
// returns whether the send actually happened, since a silent failure would
// leave a brand-new account with no known password AND no way in.
export async function sendAccountInviteEmail(
  supabase: SupabaseClient,
  org: Pick<OrgSettings, "live_sending_enabled">,
  params: { to: string; recipientName: string; roleLabel: string; setPasswordUrl: string }
): Promise<boolean> {
  const subject = "You've been added to Redrob ATS";
  const body = `Hi ${params.recipientName},\n\nAn account has been created for you on Redrob ATS as a ${params.roleLabel}.\n\nSet your password to get started: ${params.setPasswordUrl}\n\nThis link expires in 7 days.`;

  const recipients: NotificationRecipient[] = [{ role: "Account holder", name: params.recipientName, email: params.to }];
  const now = new Date().toISOString();

  let status: "sent" | "failed" = "sent";
  let senderMailbox: string | null = null;
  let gmailMessageId: string | null = null;
  let cancelReason: string | null = null;

  if (org.live_sending_enabled) {
    const sender = await resolveOutboundSender(supabase, null);
    if (sender) {
      try {
        const refreshToken = decryptToken(sender.senderEncryptedToken);
        const { access_token } = await refreshAccessToken(refreshToken);
        const result = await sendGmailMessage({
          accessToken: access_token,
          fromLabel: sender.senderName ?? "Redrob HR",
          to: [params.to],
          subject,
          body,
        });
        senderMailbox = sender.senderMailboxLabel;
        gmailMessageId = result.messageId;
      } catch (err) {
        status = "failed";
        cancelReason = err instanceof Error ? err.message : "Send failed";
      }
    } else {
      status = "failed";
      cancelReason = "No Common HR Mailbox connected.";
    }
  } else {
    status = "failed";
    cancelReason = "Live sending is off.";
  }

  await supabase.from("notifications").insert({
    trigger_event: "account_invited",
    requisition_id: null,
    candidate_id: null,
    recipients,
    subject,
    body,
    status,
    scheduled_send_at: now,
    sent_at: status === "sent" ? now : null,
    sender_mailbox: senderMailbox,
    gmail_message_id: gmailMessageId,
    cancel_reason: cancelReason,
  });

  return status === "sent";
}
