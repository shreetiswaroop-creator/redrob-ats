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

-- Interviews feature — a scheduled interview is its own row (not just a
-- JSONB entry on the candidate) so it can be listed/sorted across every
-- candidate on one page. Panelists can be either an existing `users` login
-- (panelist_user_ids) or an entry in the lightweight `panelists` directory
-- below (panelist_ids) — a panel is very often a hiring manager or other
-- staff member who will never have an ATS account.
create table if not exists interviews (
  id uuid primary key default gen_random_uuid(),
  requisition_id uuid not null references requisitions(id) on delete cascade,
  candidate_id uuid not null references candidates(id) on delete cascade,
  round_number int not null check (round_number between 1 and 5),
  panelist_user_ids uuid[] not null default '{}',
  scheduled_at timestamptz not null,
  created_by text not null,
  created_at timestamptz not null default now()
);
create index if not exists interviews_candidate_id_idx on interviews(candidate_id);
create index if not exists interviews_requisition_id_idx on interviews(requisition_id);
create index if not exists interviews_scheduled_at_idx on interviews(scheduled_at);
alter table interviews enable row level security;

-- Panelist directory — decoupled from `users` (ATS login accounts) since
-- panelists are often hiring managers or other staff who never get a login.
-- Any signed-in recruiter/HR can add an entry (not gated to hr_management)
-- so one can be added on the fly while scheduling an interview.
create table if not exists panelists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  created_by text not null,
  created_at timestamptz not null default now()
);
alter table panelists enable row level security;
alter table interviews add column if not exists panelist_ids uuid[] not null default '{}';

-- Removing a panelist (e.g. they left the company) archives rather than
-- deletes the row — panelist_ids on past interviews has no enforced foreign
-- key, so a hard delete would silently make historical interviews show one
-- fewer panelist. Archived panelists just stop appearing as an option for
-- new interviews.
alter table panelists add column if not exists is_active boolean not null default true;

-- Email Templates — subject/body for candidate-facing (and a couple of
-- internal) notifications become editable instead of hardcoded, so wording
-- can be fixed without a code change once Gmail sending is wired up.
-- {{merge_field}} tokens are substituted at send time — see renderTemplate
-- in src/lib/notifications.ts and EMAIL_TEMPLATE_MERGE_FIELDS in
-- src/lib/types.ts for exactly which fields each template can use.
create table if not exists email_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null unique,
  label text not null,
  subject_template text not null,
  body_template text not null,
  updated_by text,
  updated_at timestamptz not null default now()
);
alter table email_templates enable row level security;

-- Seeded from the exact hardcoded strings these 7 events used to send
-- (see notifications.ts git history), just with the dynamic parts swapped
-- for merge fields — so nothing about actual output changes until someone
-- edits a template. `on conflict do nothing` keeps this re-runnable without
-- clobbering edits already made.
-- Requisition & candidate archiving — a requisition that's Fulfilled/Expired
-- archives immediately; one left On Hold for 15+ days auto-archives via the
-- opportunistic sweep in src/lib/archiving.ts (same page-load-triggered
-- pattern as sweepStepTatBreaches in notifications.ts, per explicit
-- confirmation there's no dedicated cron job for this). Archiving a
-- requisition archives every one of its candidates regardless of stage —
-- the goal is a clean Kanban for the next requisition, not a filtered one.
-- See src/app/api/requisitions/[id]/route.ts and src/lib/archiving.ts.
alter table requisitions add column if not exists archived boolean not null default false;
alter table requisitions add column if not exists archived_at timestamptz;
alter table requisitions add column if not exists archived_reason text
  check (archived_reason in ('fulfilled', 'expired', 'on_hold_timeout'));
alter table requisitions add column if not exists on_hold_since timestamptz;
create index if not exists requisitions_archived_idx on requisitions(archived);

-- 'requisition_fulfilled'/'requisition_expired'/'requisition_on_hold' record
-- *why* a candidate got archived. Any archived, non-rejected candidate can
-- be independently revoked (Section: Revoke) back into active consideration.
alter table candidates add column if not exists archived boolean not null default false;
alter table candidates add column if not exists archived_at timestamptz;
alter table candidates add column if not exists archived_reason text
  check (archived_reason in ('requisition_fulfilled', 'requisition_expired', 'requisition_on_hold'));
create index if not exists candidates_archived_idx on candidates(archived);

-- Interviews feature — candidate-facing emails for the auto stage-move
-- (Sourcing/Screening -> Interview Round(s), fired once when scheduling the
-- first interview) and for each individual round's scheduling details. See
-- src/lib/notifications.ts (candidateMovedInterviewNotification,
-- interviewScheduledNotification) and src/app/api/interviews/route.ts.
-- Real Gmail/Calendar sending — org-wide kill switch. While false, every
-- notification behaves exactly as before (logged only, never actually
-- emailed/invited) regardless of how many users have connected their
-- Google account — lets the connect flow be tested safely before any real
-- candidate/panelist receives a real email or calendar invite.
alter table org_settings add column if not exists live_sending_enabled boolean not null default false;

-- Settings page — TAT default (offer-step TAT, not the requisition closure
-- TAT) editable org-wide instead of hardcoded, and an optional uploaded
-- logo (public Blob URL; null falls back to the static /redrob-logo.png).
alter table org_settings add column if not exists default_step_tat_hours int not null default 24;
alter table org_settings add column if not exists logo_url text;

-- Position-closure TAT — separate from the per-offer-step TAT above (which
-- is per-candidate, hours-based, and drives the dashboard's "TAT breached"
-- tile). This one is requisition-level, days-based: clock starts at
-- approved_at and only runs while status = 'approved' — a Fulfilled/On
-- Hold/Expired requisition isn't "breaching" a closure deadline. See
-- computeClosureTatStatus in src/lib/tat.ts.
alter table requisitions add column if not exists closure_tat_days int not null default 30;

-- Interview duration — used to compute the shown/synced end time (start +
-- duration) and the Google Calendar event's actual end time, which was
-- previously hardcoded to 45 minutes. See InterviewsView.tsx and
-- src/app/api/interviews/route.ts.
alter table interviews add column if not exists duration_minutes int not null default 30
  check (duration_minutes in (15, 30, 60));

insert into email_templates (template_key, label, subject_template, body_template) values
  ('interview_stage', 'Moved to Interview Round',
   'Your candidature has moved to the Interview Round — {{requisition_title}}',
   'Hi {{candidate_name}}, your candidature for {{requisition_title}} ({{candidate_code}}) has moved to the Interview Round stage. Our recruiter will call you shortly to coordinate the interview.'),
  ('interview_scheduled', 'Interview Scheduled',
   '{{round_name}} scheduled — {{requisition_title}}',
   'Hi {{candidate_name}}, your {{round_name}} interview for {{requisition_title}} ({{candidate_code}}) is scheduled for {{interview_date}} at {{interview_time}}. {{meeting_link}}'),
  ('pre_offer', 'Pre-Offer Email',
   'Offer Step 1 (Pre-Offer Formalities) initiated — {{candidate_name}}',
   'Step 1: Pre-Offer Formalities has been initiated for {{candidate_name}} ({{requisition_title}}, {{candidate_code}}).'),
  ('reference_check', 'Reference Check',
   'Offer Step 2 (Reference Check) initiated — {{candidate_name}}',
   'Step 2: Reference Check has been initiated for {{candidate_name}} ({{requisition_title}}, {{candidate_code}}).'),
  ('hr_bgv', 'HR Background Verification',
   'Offer Step 4 (HR Background Verification (BGV)) initiated — {{candidate_name}}',
   'Step 4: HR Background Verification (BGV) has been initiated for {{candidate_name}} ({{requisition_title}}, {{candidate_code}}).'),
  ('offer_letter', 'Offer Letter',
   'Offer Letter approved and sent to {{candidate_name}}',
   'Offer Letter approved and sent to {{candidate_name}} ({{requisition_title}}, {{candidate_code}}).'),
  ('employee_agreement', 'Employee Agreement',
   'Employee Agreement e-signed and sent to {{candidate_name}}',
   'Employee Agreement e-signed and sent to {{candidate_name}} ({{requisition_title}}, {{candidate_code}}).'),
  ('rejection', 'Rejection',
   'Update on your application — {{requisition_title}}',
   $body$Thank you for your interest in {{requisition_title}}. After careful consideration, we will not be moving forward at this time.

(Internal note — reason: {{reason}})$body$),
  ('reconsideration', 'Reconsideration',
   'Please disregard our previous message — {{requisition_title}}',
   'Please disregard our previous message about your application for {{requisition_title}}. Your application is active and under review — we apologize for the confusion.')
on conflict (template_key) do nothing;

-- Candidate-facing email flow — dedicated content for stage moves and offer-
-- process events that previously either fell through the generic catch-all
-- (moved_to_screening) or were internal-only (passed_next_round,
-- passed_final_round, final_details_confirmed_candidate,
-- step_tat_breached_candidate_reminder, offer_accepted_completed_candidate).
-- See src/lib/notifications.ts for the builders and
-- EMAIL_TEMPLATE_MERGE_FIELDS in src/lib/types.ts for each key's tokens.
insert into email_templates (template_key, label, subject_template, body_template) values
  ('moved_to_screening', 'Moved to Screening',
   'Your candidature has moved to Screening — {{requisition_title}}',
   'Hi {{candidate_name}}, your candidature for {{requisition_title}} ({{candidate_code}}) has moved to the Screening round.'),
  ('passed_next_round', 'Passed Round — Next Round Scheduled',
   'You''ve cleared {{round_name}} — {{requisition_title}}',
   'Hi {{candidate_name}}, congratulations — you''ve passed {{round_name}} for {{requisition_title}} ({{candidate_code}}) and have moved to {{next_round_name}}. Our recruiter will call you shortly to schedule it.'),
  ('passed_final_round', 'Passed Final Round',
   'You''ve cleared the final round — {{requisition_title}}',
   'Hi {{candidate_name}}, congratulations — you''ve passed the final interview round for {{requisition_title}} ({{req_code}}). Our recruiter will call you shortly to discuss final details.'),
  ('final_details_confirmed_candidate', 'Final Details Confirmed',
   'Your final offer details are confirmed — {{requisition_title}}',
   'Hi {{candidate_name}}, your final offer details for {{requisition_title}} have been confirmed: {{designation}}, {{compensation}}, DOJ {{doj}}, {{location}}. The Offer Process is now starting.'),
  ('step_tat_breached_candidate_reminder', 'Offer Step TAT Breached — Candidate Reminder',
   'Reminder — action needed on {{step_name}}',
   'Hi {{candidate_name}}, this is a reminder to please revert to the email we already sent you regarding Step {{step_number}}: {{step_name}} ({{requisition_title}}).'),
  ('offer_accepted_completed_candidate', 'Offer Accepted / Completed',
   'Welcome aboard, {{candidate_name}}!',
   'Hi {{candidate_name}}, the offer process for {{requisition_title}} is now complete. We look forward to you joining us on {{doj}}.')
on conflict (template_key) do nothing;

-- Content refresh for two pre-existing keys — `on conflict do nothing` above
-- never updates an already-seeded row, so these run unconditionally.
-- NOTE: if either template has already been customized via the Email
-- Templates admin page, these UPDATEs will overwrite that customization back
-- to the new default content below.
update email_templates set
  subject_template = '{{round_name}} scheduled — {{requisition_title}}',
  body_template = $body$Hi {{candidate_name}}, your {{round_name}} interview for {{requisition_title}} ({{candidate_code}}) is scheduled for {{interview_date}} at {{interview_time}} ({{duration}}).

{{meeting_link}}$body$
where template_key = 'interview_scheduled';

update email_templates set
  subject_template = 'Offer Step 1 (Pre-Offer Formalities) initiated — {{candidate_name}}',
  body_template = $body$Step 1: Pre-Offer Formalities has been initiated for {{candidate_name}} ({{requisition_title}}, {{candidate_code}}).

The Offer Process has 5 steps, each with a 24-hour turnaround time:
1. Pre-Offer Formalities
2. Reference Check
3. Offer Letter Signing
4. HR Background Verification
5. Employee Agreement Signing$body$
where template_key = 'pre_offer';

-- Candidate photo — dedicated field (PRD §7.5's reference-check document
-- header needs an actual photo, which can't be reliably extracted from a
-- resume PDF), stored the same private-Blob way as the resume above.
alter table candidates add column if not exists photo_pathname text;
alter table candidates add column if not exists photo_filename text;

-- Step 1 (Pre-Offer Formalities) intake documents — education proof,
-- government ID proof, and latest salary slip (PRD §7.2 Step 1). Each gets
-- its own dedicated pathname/filename pair, same pattern as resume/photo,
-- rather than living in the retired generic document repository.
alter table candidates add column if not exists education_proof_pathname text;
alter table candidates add column if not exists education_proof_filename text;
alter table candidates add column if not exists id_proof_pathname text;
alter table candidates add column if not exists id_proof_filename text;
alter table candidates add column if not exists salary_slip_pathname text;
alter table candidates add column if not exists salary_slip_filename text;

-- Document-generation engine (PRD §7.5, §7.7) — HR-editable structured
-- templates for the Reference Check (Professional / Fresher-Intern variants)
-- and HR Background Verification documents, mail-merged and generated as
-- PDFs at Step 2 / Step 4 initiation. See src/lib/pdf/OfferDocumentPdf.tsx
-- and src/lib/document-generation.ts. section_a_questions is an ordered
-- jsonb array of {id, prompt_template}, {{merge_field}} tokens resolved the
-- same way as email_templates via renderTemplate.
create table if not exists document_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null unique check (template_key in (
    'reference_check_professional', 'reference_check_fresher_intern', 'hr_bgv'
  )),
  label text not null,
  section_a_intro text not null default '',
  section_a_questions jsonb not null default '[]',
  section_b_text text not null default '',
  section_c_note text not null default '',
  updated_by text,
  updated_at timestamptz not null default now()
);
alter table document_templates enable row level security;

insert into document_templates (template_key, label, section_a_intro, section_a_questions, section_b_text, section_c_note) values
  ('reference_check_professional', 'Reference Check — Professional',
   'Please verify the following employment details for {{reference_name}} at {{company_name}}.',
   '[
     {"id": "q1", "prompt_template": "Confirm employment dates: {{tenure_from}} to {{tenure_to}} as {{designation}}. Are these dates accurate? (Yes/No)"},
     {"id": "q2", "prompt_template": "Confirm employee code on file: {{employee_code}}. Is this correct? (Yes/No)"},
     {"id": "q3", "prompt_template": "Confirm reporting manager: {{supervisor_name}}. Is this correct? (Yes/No)"},
     {"id": "q4", "prompt_template": "How would you rate the candidate''s overall performance and conduct during their tenure?"},
     {"id": "q5", "prompt_template": "Was there any disciplinary action or performance concern on record? If yes, please describe."}
   ]'::jsonb,
   'Would you consider {{candidate_name}} for rehire if a suitable position opened up in the future? Please share any additional comments that would help us make an informed hiring decision.',
   'The information provided above will be kept confidential and used solely for employment verification purposes. Please complete and return this form to close out the reference check for {{candidate_name}} ({{candidate_code}}).'),
  ('reference_check_fresher_intern', 'Reference Check — Fresher/Intern',
   'Please verify the following academic/internship details for {{reference_name}} regarding {{candidate_name}} at {{company_name}}.',
   '[
     {"id": "q1", "prompt_template": "Confirm enrollment/tenure dates: {{tenure_from}} to {{tenure_to}} for {{designation}}. Are these dates accurate? (Yes/No)"},
     {"id": "q2", "prompt_template": "Confirm roll number / reference code on file: {{employee_code}}. Is this correct? (Yes/No)"},
     {"id": "q3", "prompt_template": "Confirm faculty/mentor on record: {{supervisor_name}}. Is this correct? (Yes/No)"},
     {"id": "q4", "prompt_template": "How would you rate the candidate''s overall academic performance and conduct?"},
     {"id": "q5", "prompt_template": "Was there any disciplinary action or concern on record? If yes, please describe."}
   ]'::jsonb,
   'Would you consider {{candidate_name}} for a future opportunity if one arose? Please share any additional comments that would help us make an informed hiring decision.',
   'The information provided above will be kept confidential and used solely for verification purposes. Please complete and return this form to close out the reference check for {{candidate_name}} ({{candidate_code}}).'),
  ('hr_bgv', 'HR Background Verification',
   'This is a background verification request for {{candidate_name}}, who has declared the following current employment details with your organization.',
   '[
     {"id": "q1", "prompt_template": "Confirm employment dates: {{tenure_from}} to {{tenure_to}} as {{designation}}. Are these dates accurate? (Yes/No)"},
     {"id": "q2", "prompt_template": "Confirm employee code on file: {{employee_code}}. Is this correct? (Yes/No)"},
     {"id": "q3", "prompt_template": "Confirm reporting manager: {{supervisor_name}}. Is this correct? (Yes/No)"},
     {"id": "q4", "prompt_template": "Is the candidate currently employed with your organization, or has their employment ended? If ended, please share the last working date and reason for separation."},
     {"id": "q5", "prompt_template": "Is there any disciplinary action, pending liability, or eligibility-for-rehire concern on record?"}
   ]'::jsonb,
   'Would your organization consider {{candidate_name}} eligible for rehire? Please share any additional comments relevant to this background verification.',
   'The information provided above will be kept strictly confidential and used solely for background verification purposes ahead of onboarding. Please complete and return this form via the Common HR Mailbox for {{candidate_name}} ({{candidate_code}}).')
on conflict (template_key) do nothing;

-- HR BGV generated document — dedicated pathname/filename pair on the
-- candidate row (there's only ever one, unlike per-reference documents which
-- live inside reference_records jsonb below).
alter table candidates add column if not exists bgv_document_pathname text;
alter table candidates add column if not exists bgv_document_filename text;

-- employment_history/reference_records stay jsonb arrays — is_current
-- (which employment entry is the current employer, used to resolve the BGV
-- recipient) and document_pathname/document_sent_at (per-reference
-- generated-document tracking) are additive fields inside those existing
-- structures, so no migration is needed for them.

-- Client model (PRD context: Redrob operates an employer-of-record model —
-- requisitions are raised on behalf of client companies like Muzig AI,
-- Hanwha Vision, not just for Redrob/McKinley Rice itself). client_id is
-- required going forward: existing requisitions predate this field and are
-- backfilled to "McKinley Rice" below rather than left null, then the
-- column is locked to not null.
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_by text not null,
  created_at timestamptz not null default now()
);
alter table clients enable row level security;

insert into clients (name, created_by) values ('McKinley Rice', 'system (migration)')
on conflict (name) do nothing;

alter table requisitions add column if not exists client_id uuid references clients(id);
update requisitions set client_id = (select id from clients where name = 'McKinley Rice') where client_id is null;
alter table requisitions alter column client_id set not null;

-- D3 — Offer Letter review moved from a free-text "version" field to an
-- actual link-based review flow (doc_link on OfferDocumentApproval). The
-- candidate-facing "approved" email now needs to actually hand them the
-- document, not just announce it was sent — content refresh, same pattern
-- as the other UPDATEs above.
update email_templates set
  body_template = 'Congratulations! Your Offer Letter for {{requisition_title}} has been approved. You can view it here: {{doc_link}}'
where template_key = 'offer_letter';

-- H2 — how urgently the ROLE needs filling (distinct from candidates.priority,
-- which is per-candidate) plus a free-text role description/responsibilities
-- field, distinct from must_have_skills (a criteria checklist, not the JD
-- body). Existing requisitions predate both — urgency defaults to 'medium'
-- so nothing reads as falsely urgent or falsely deprioritized, and
-- description defaults to null (blank in the UI, not an error).
alter table requisitions add column if not exists urgency text not null default 'medium'
  check (urgency in ('urgent', 'high', 'medium', 'low'));
alter table requisitions add column if not exists description text;

-- A6 — three profile fields found missing against a reference ATS's
-- candidate profile: LinkedIn/portfolio links and why the candidate is
-- looking to move. All optional, nullable, no default needed.
alter table candidates add column if not exists linkedin_url text;
alter table candidates add column if not exists portfolio_url text;
alter table candidates add column if not exists reason_for_change text;

-- E1 — interview mode (Video/Phone/In-person), required alongside round and
-- duration. Defaults to 'video' so existing rows don't need a value picked
-- retroactively.
alter table interviews add column if not exists mode text not null default 'video'
  check (mode in ('video', 'phone', 'in_person'));

-- F3 — structured HRMS handover tracking. Null on existing rows and on any
-- candidate that hasn't reached the Handover to HRMS stage yet — this is
-- deliberately not "not_sent" by default; it only gets set once a candidate
-- actually moves into that stage.
alter table candidates add column if not exists hrms_handover_status text
  check (hrms_handover_status in ('not_sent', 'awaiting_acknowledgement', 'acknowledged'));
alter table candidates add column if not exists hrms_handed_off_at timestamptz;
alter table candidates add column if not exists hrms_acknowledged_at timestamptz;

-- F4 — lightweight timestamped/attributed free-text notes, separate from the
-- single structured `notes` text field captured at intake. Feeds the new
-- unified activity timeline alongside audit_log, rather than replacing it.
alter table candidates add column if not exists candidate_notes jsonb not null default '[]';

-- F5 — lightweight PII-consent visibility flag, not an enforcement gate:
-- candidate creation is never blocked on this being checked.
alter table candidates add column if not exists consent_given boolean not null default false;
alter table candidates add column if not exists consent_given_at timestamptz;

-- B3 — distinguishes a requisition that went Raised -> Approved through an
-- actual second-person review from one an hr_management user raised and
-- approved themselves in the same step (skipping that review). Existing
-- approved requisitions predate this and default to false (genuinely
-- reviewed), which is the correct assumption for data that predates the
-- self-approval shortcut even existing.
alter table requisitions add column if not exists approval_skipped boolean not null default false;

-- B2.1 — admin-configurable custom fields on Candidate/Requisition, so HR
-- Management can add a new field from the UI without an engineering ticket.
-- Actual values live in one JSONB column per entity rather than dynamic
-- ALTER TABLE per field, so adding/removing a definition never touches the
-- table schema itself.
create table if not exists custom_field_definitions (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('candidate', 'requisition')),
  field_key text not null,
  label text not null,
  field_type text not null check (field_type in ('text', 'number', 'date', 'boolean', 'select')),
  select_options jsonb,
  required boolean not null default false,
  display_order int not null default 0,
  created_by text not null,
  created_at timestamptz not null default now(),
  unique(entity_type, field_key)
);
alter table custom_field_definitions enable row level security;

alter table candidates add column if not exists custom_fields jsonb not null default '{}';
alter table requisitions add column if not exists custom_fields jsonb not null default '{}';

-- F6 — tracks whether a user has completed (or skipped) the onboarding tour,
-- so it auto-shows once on first login and never again unless they replay it
-- from the sidebar. Null means "not shown yet" — deliberately not defaulted
-- to now(), since existing users predate this feature and should see it too.
alter table users add column if not exists tour_completed_at timestamptz;

-- Forgot-password flow. The token itself is never stored — only a SHA-256
-- hash of it (see src/lib/password.ts) — so stolen DB access alone can't be
-- replayed as a valid reset link. Both cleared once the reset is used.
alter table users add column if not exists password_reset_token_hash text;
alter table users add column if not exists password_reset_expires_at timestamptz;

-- Deactivation replaces hard-deleting a user row: the row (and their name/
-- email) has to keep existing so it still displays correctly as historical
-- attribution on old audit log entries, past notifications, and any
-- candidate record that still references them — a hard delete would turn
-- all of that into a dangling/blank reference the moment someone left.
alter table users add column if not exists deactivated_at timestamptz;
