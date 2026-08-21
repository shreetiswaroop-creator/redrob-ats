import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUser } from "@/lib/session";
import { generatePasswordResetToken, generateTempPassword, hashPassword, hashResetToken } from "@/lib/password";
import { sendAccountInviteEmail } from "@/lib/passwordReset";
import { OrgSettings, USER_ROLE_LABELS, UserRole } from "@/lib/types";

// Longer than the 1-hour forgot-password window — this is "whenever you get
// around to checking your email and setting up your account," not an
// urgent security action someone is doing right now.
const INVITE_TOKEN_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session || session.role !== "hr_management") {
    return NextResponse.json({ error: "Only HR Management can view accounts." }, { status: 403 });
  }

  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("users")
    .select("id, name, email, role, created_at, created_by, gmail_email, gmail_connected_at, deactivated_at")
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session || session.role !== "hr_management") {
    return NextResponse.json({ error: "Only HR Management can add accounts." }, { status: 403 });
  }

  const body = await req.json();
  const { name, email, password, role, invite } = body;
  if (!name || !email || !role) {
    return NextResponse.json({ error: "Name, email, and role are required." }, { status: 400 });
  }
  if (role !== "recruiter" && role !== "hr_management" && role !== "hiring_manager") {
    return NextResponse.json({ error: "Role must be 'recruiter', 'hr_management', or 'hiring_manager'." }, { status: 400 });
  }
  if (!invite && (!password || password.length < 8)) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const supabase = supabaseServer();

  // Invite mode: nobody types or shares a password at all. The account gets
  // an unguessable, never-surfaced initial password_hash (needed only to
  // satisfy the not-null column) plus an immediate reset token — the same
  // mechanism "forgot password" uses, just issued proactively instead of on
  // request, so the invitee's first real action is setting their own
  // password via the normal /reset-password page.
  let passwordHash: string;
  let resetTokenHash: string | null = null;
  let resetExpiresAt: string | null = null;
  let rawResetToken: string | null = null;
  if (invite) {
    passwordHash = await hashPassword(generateTempPassword());
    rawResetToken = generatePasswordResetToken();
    resetTokenHash = hashResetToken(rawResetToken);
    resetExpiresAt = new Date(Date.now() + INVITE_TOKEN_LIFETIME_MS).toISOString();
  } else {
    passwordHash = await hashPassword(password);
  }

  const { data, error } = await supabase
    .from("users")
    .insert({
      name,
      email: String(email).toLowerCase().trim(),
      password_hash: passwordHash,
      password_reset_token_hash: resetTokenHash,
      password_reset_expires_at: resetExpiresAt,
      role,
      created_by: session.name,
    })
    .select("id, name, email, role, created_at, created_by, gmail_email, gmail_connected_at, deactivated_at")
    .single();

  if (error) {
    const message = error.code === "23505" ? "An account with this email already exists." : error.message;
    return NextResponse.json({ error: message }, { status: 400 });
  }

  let inviteSent: boolean | undefined;
  if (invite && rawResetToken) {
    const { data: orgRow } = await supabase.from("org_settings").select("live_sending_enabled").eq("id", "default").single();
    const setPasswordUrl = `${req.nextUrl.origin}/reset-password?token=${rawResetToken}`;
    inviteSent = await sendAccountInviteEmail(
      supabase,
      (orgRow as Pick<OrgSettings, "live_sending_enabled">) ?? { live_sending_enabled: false },
      { to: data.email, recipientName: data.name, roleLabel: USER_ROLE_LABELS[data.role as UserRole], setPasswordUrl }
    );
  }

  return NextResponse.json({ ...data, invite_sent: inviteSent }, { status: 201 });
}
