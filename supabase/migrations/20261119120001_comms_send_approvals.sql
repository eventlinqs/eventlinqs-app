-- THE SEND-A-DRAFT ROUTE'S APPROVALS (the PM's 11:55 of 19 November 2026; Lawal at 11:43: "Go send it right now").
-- One row per draft the platform may send from the outreach mailbox: its Graph id, the sha256 of its own words as the
-- gateway cleared them (src/lib/outreach/draft-content.mjs), the gateway's verdict and policy version, who approved it
-- and in what words. src/lib/outreach/send-approved.ts sends a draft only when its row exists and its words still hash
-- the same, then writes sent_at and the message id; a refusal keeps its reason. Written by the approval workflow on the
-- build machine (scripts/ops/comms-approve.mjs) as the service role; read and updated only by the service role.
create table if not exists public.comms_send_approvals (
  id uuid primary key default gen_random_uuid(),
  mailbox text not null check (mailbox ~* '^[^@[:space:]]+@eventlinqs\.com$'),
  graph_message_id text not null unique check (length(graph_message_id) between 10 and 512),
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  gateway_verdict text not null check (gateway_verdict = 'CLEARED_TO_SEND'),
  gateway_policy_version text not null check (length(btrim(gateway_policy_version)) > 0),
  approved_by text not null check (length(btrim(approved_by)) > 0),
  approval_words text not null check (length(btrim(approval_words)) > 0),
  approved_at timestamptz not null default now(),
  contact_id uuid references public.organiser_contacts(id),
  sent_at timestamptz,
  internet_message_id text,
  refused_because text,
  constraint comms_send_approvals_sent_is_whole check ((sent_at is null) = (internet_message_id is null))
);

alter table public.comms_send_approvals enable row level security;

-- A new public table is granted in its own migration (CLAUDE.md, Migrations, the 21 October 2026 rule): no client role
-- reads or writes it; the service role alone, for the route and the approval workflow.
revoke all on public.comms_send_approvals from anon, authenticated, service_role;
grant select, insert, update on public.comms_send_approvals to service_role;
