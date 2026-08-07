-- Redrob ATS — Phase 1 schema
-- Two main tables: requisitions (columns 1-2) and candidates (columns 3-9 + rejected).
-- Repeatable sub-sections (employment history, references, offer steps, documents,
-- offer document approvals, interview rounds, audit log) are stored as JSONB arrays
-- directly on the candidate row to keep the schema simple for a first version.

create sequence if not exists req_code_seq start 1001;
create sequence if not exists cand_code_seq start 4001;

create table if not exists requisitions (
  id uuid primary key default gen_random_uuid(),
  req_code text not null unique default ('REQ' || nextval('req_code_seq')),
  title text not null,
  department text,
  level text,
  location text,
  headcount int not null default 1,
  must_have_skills text,
  budget_band text,
  position_type text not null check (position_type in ('experienced', 'fresher_intern')),
  hiring_manager text not null,
  status text not null default 'raised' check (status in ('raised', 'approved')),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by text
);

create table if not exists candidates (
  id uuid primary key default gen_random_uuid(),
  candidate_code text not null unique default ('CAND' || nextval('cand_code_seq')),
  requisition_id uuid not null references requisitions(id) on delete cascade,

  -- Candidate Name & Contact
  name text not null,
  phone text,
  personal_email text,

  -- Ownership & track
  owner text not null,
  candidate_track text not null check (candidate_track in ('experienced', 'fresher_intern')),
  track_override_reason text,
  hiring_manager text,

  -- Kanban position
  current_stage text not null default 'sourcing' check (current_stage in (
    'sourcing', 'screening', 'interview', 'selected_awaiting_final_details',
    'offer_process', 'offer_accepted_completed', 'handover_to_hrms'
  )),
  stage_entered_at timestamptz not null default now(),
  tat_status text not null default 'on_track' check (tat_status in ('on_track', 'at_risk', 'breached')),

  -- Rejection (cross-cutting status, not a column)
  status text not null default 'active' check (status in ('active', 'rejected')),
  rejected_from_stage text,
  rejection_reason text,
  rejected_at timestamptz,

  -- Final offer details (locked once Offer Process starts)
  final_compensation text,
  final_doj date,
  final_designation text,
  final_location text,
  final_details_locked boolean not null default false,

  -- Repeatable / structured sections
  interview_rounds jsonb not null default '[]',
  employment_history jsonb not null default '[]',
  reference_records jsonb not null default '[]',
  offer_steps jsonb not null default '[]',
  documents jsonb not null default '[]',
  offer_document_approvals jsonb not null default '{}',
  audit_log jsonb not null default '[]',

  created_at timestamptz not null default now()
);

create index if not exists candidates_requisition_id_idx on candidates(requisition_id);
create index if not exists candidates_current_stage_idx on candidates(current_stage);

alter table requisitions enable row level security;
alter table candidates enable row level security;
-- No policies are defined: this app only ever talks to Supabase using the
-- service role key from server-side code, which bypasses RLS. Enabling RLS
-- with no policies means the public/anon key (if ever exposed) can't read
-- or write anything.

-- Phase 2 — email fields needed so logged notifications show a real recipient
-- address, added via ADD COLUMN IF NOT EXISTS so this file stays re-runnable.
alter table requisitions add column if not exists hiring_manager_email text;
alter table candidates add column if not exists owner_email text;

-- Org-wide contacts that aren't tied to a single requisition or candidate
-- (HR Management, the shared HR mailbox, the HRMS team). Singleton row.
create table if not exists org_settings (
  id text primary key default 'default',
  hr_management_emails text,
  common_hr_mailbox_name text,
  common_hr_mailbox_email text,
  hrms_team_email text
);
insert into org_settings (id) values ('default') on conflict (id) do nothing;
alter table org_settings enable row level security;

-- Phase 2 — logs every notification the system *would* send (Section 6 of the
-- PRD), without actually sending email yet (that's Phase 4 / Gmail
-- integration). Lets HR verify the trigger logic stage-by-stage first.
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  trigger_event text not null,
  requisition_id uuid references requisitions(id) on delete cascade,
  candidate_id uuid references candidates(id) on delete cascade,
  recipients jsonb not null default '[]',
  subject text not null,
  body text not null,
  sent_via text not null default 'logged',
  created_at timestamptz not null default now()
);
create index if not exists notifications_candidate_id_idx on notifications(candidate_id);
create index if not exists notifications_requisition_id_idx on notifications(requisition_id);
create index if not exists notifications_created_at_idx on notifications(created_at desc);
alter table notifications enable row level security;

-- Phase 5 — send-delay buffer + correction logic, and real Gmail sending.
-- Every candidate-facing email now goes through this same table as a queue:
-- 'pending' rows aren't sent yet (candidate-facing ones sit here for 60
-- minutes so a mistake can be caught), 'sent' means delivered (or, until
-- Gmail is connected, logged the same way Phase 2-3 always worked), and
-- 'cancelled' means a correction caught it before it went out.
alter table notifications add column if not exists status text not null default 'sent'
  check (status in ('pending', 'sent', 'cancelled', 'failed'));
alter table notifications add column if not exists scheduled_send_at timestamptz;
alter table notifications add column if not exists sent_at timestamptz;
alter table notifications add column if not exists sender_mailbox text;
alter table notifications add column if not exists gmail_message_id text;
alter table notifications add column if not exists cancel_reason text;
alter table notifications add column if not exists is_correction boolean not null default false;
create index if not exists notifications_pending_due_idx on notifications(status, scheduled_send_at)
  where status = 'pending';

-- A rejection can be corrected (Restore) and a forward move can be
-- corrected (moved back) — this flags the latter case for a human to
-- personally handle candidate communication, since we never auto-send a
-- "never mind, ignore that" email for anything except an undone rejection.
alter table candidates add column if not exists manual_followup_note text;
alter table candidates add column if not exists manual_followup_since timestamptz;

alter table org_settings add column if not exists common_hr_gmail_refresh_token_encrypted text;
alter table org_settings add column if not exists common_hr_gmail_connected_at timestamptz;

-- Phase 3 — Offer Process (Section 7). offer_steps already stores its shape
-- as JSONB (now also carrying started_at/tat_hours/grace_extensions per
-- step — no column change needed for that). These two are new top-level
-- candidate fields.
alter table candidates add column if not exists current_employer_hr_email text;
alter table candidates add column if not exists reference_exception jsonb not null default '{"status":"none"}';

-- Phase 4 prep — individual recruiter/HR Management accounts, replacing the
-- single shared password. Only HR Management accounts can add/remove users
-- (enforced in the API, not via RLS — this app only ever talks to Supabase
-- through the service role key from server-side code).
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  password_hash text not null,
  role text not null check (role in ('recruiter', 'hr_management')),
  created_at timestamptz not null default now(),
  created_by text
);
alter table users enable row level security;

-- Per-user connected Gmail account (personal HR work mailbox), plus one
-- shared row for the Common HR mailbox used by Steps 2/4. Refresh tokens
-- are encrypted at rest (see src/lib/token-crypto.ts) — even with DB access,
-- nobody can send email as a recruiter without the app's own secret key.
alter table users add column if not exists gmail_email text;
alter table users add column if not exists gmail_refresh_token_encrypted text;
alter table users add column if not exists gmail_connected_at timestamptz;

-- Real process detail: the negotiated package can include extras beyond the
-- 4 base fields, and exceptions need a note (e.g. a special-case perk).
alter table candidates add column if not exists final_benefits text;
alter table candidates add column if not exists final_notes text;

-- Phase 5 — richer requisition lifecycle beyond the initial Raised/Approved
-- flow. All five values live on the same `status` column and are freely
-- switchable by any recruiter via a dropdown (not a locked pipeline) —
-- Approved is just the state most requisitions sit in day-to-day. Finds and
-- drops whatever check constraint currently governs `status` (rather than
-- assuming its auto-generated name) so this stays safe to re-run.
do $$
declare
  con record;
begin
  for con in
    select conname from pg_constraint
    where conrelid = 'requisitions'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table requisitions drop constraint %I', con.conname);
  end loop;
end $$;
alter table requisitions add constraint requisitions_status_check
  check (status in ('raised', 'approved', 'fulfilled', 'on_hold', 'expired'));
alter table requisitions add column if not exists status_note text;

-- Phase 5 — candidate priority tag (P1-P3; recruiter decides what each tier
-- means case-by-case, no fixed rule) and a candidate-level on-hold flag,
-- distinct from rejection: the candidate stays in their current Kanban
-- stage, just visibly flagged with a mandatory note (e.g. long notice
-- period, still negotiating compensation).
alter table candidates add column if not exists priority text check (priority in ('P1', 'P2', 'P3'));
alter table candidates add column if not exists on_hold boolean not null default false;
alter table candidates add column if not exists on_hold_note text;
alter table candidates add column if not exists on_hold_since timestamptz;

-- Phase 6 — richer candidate intake fields (compensation, notice period,
-- location, source, experience, free notes) plus a resume file, stored in
-- Vercel Blob under private access (PII) — only the pathname/filename live
-- here, the file itself never touches this table. All free text except
-- Source, which is a fixed dropdown for later source-effectiveness reporting.
alter table candidates add column if not exists notice_period text;
alter table candidates add column if not exists current_ctc text;
alter table candidates add column if not exists expected_ctc text;
alter table candidates add column if not exists current_location text;
alter table candidates add column if not exists source text
  check (source in ('internal_referral', 'naukri', 'linkedin', 'inbound', 'other'));
alter table candidates add column if not exists relevant_experience_years numeric;
alter table candidates add column if not exists notes text;
alter table candidates add column if not exists resume_pathname text;
alter table candidates add column if not exists resume_filename text;

-- Phase 6 — Time to Fill (Section: dashboard metrics) measures requisition
-- raised -> a candidate for it reaching Offer Accepted, so that moment needs
-- its own timestamp rather than being inferred from current_stage (a
-- candidate who has since moved on to Handover would otherwise lose it).
alter table candidates add column if not exists offer_accepted_at timestamptz;

-- Phase 6 — demo/seed data needs to be unambiguously flagged so it can be
-- bulk-cleared in one action before real recruiters start using the system,
-- rather than relying on anyone remembering which rows were seeded.
alter table candidates add column if not exists is_demo boolean not null default false;
alter table requisitions add column if not exists is_demo boolean not null default false;
