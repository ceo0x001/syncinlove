-- ============================================================================
-- Sync — Phase 1: the loop
--
-- Paste this whole file into the Supabase SQL editor and run it once.
--
-- The security property this schema exists to guarantee:
--
--   No person can read their partner's answer. Not before the reveal, not
--   after, not ever.
--
-- It is deliberately NOT expressed as "you may read your partner's answer if
-- and only if you have also submitted". That policy is subtle, and its failure
-- mode is silent and catastrophic. Instead, `answers` is readable only by its
-- author, full stop — there is no predicate to get wrong. When the second
-- answer lands, a SECURITY DEFINER function computes the score and writes a
-- separate `reveals` row that both partners may read.
--
-- Consequence: the application never needs a service_role key, and no bug in
-- application code can expose an un-revealed answer, because no code path in
-- the app can reach one.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------

create table if not exists public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  first_name        text not null check (char_length(btrim(first_name)) between 1 and 40),
  -- 18+ self-attestation. Collected once, before any content is shown.
  -- Retro-fitting an age gate onto existing users is genuinely painful, so it
  -- lands in Phase 1 even though nothing depends on it yet.
  adult_attested_at timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

create table if not exists public.pairs (
  id         uuid primary key default gen_random_uuid(),
  -- The couple shares ONE timezone. Per-person zones drift two partners onto
  -- different question numbers, which destroys the only thing the product is.
  time_zone  text not null default 'UTC',
  -- The pair-local date they started. Day 0.
  day_zero   date not null,
  status     text not null default 'pending' check (status in ('pending', 'active', 'ended')),
  created_at timestamptz not null default now(),
  ended_at   timestamptz
);

create table if not exists public.pair_members (
  pair_id   uuid not null references public.pairs (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  role      text not null check (role in ('inviter', 'invitee')),
  joined_at timestamptz not null default now(),
  -- Set when the pairing ends. Kept rather than deleted so the archive survives.
  left_at   timestamptz,
  primary key (pair_id, user_id)
);

-- One active pair per person, enforced by the database rather than by app logic.
-- This is what stops somebody pairing with two partners at once, and it is also
-- what makes duplicate pairings impossible: the second membership simply cannot
-- be written.
create unique index if not exists pair_members_one_active_per_user
  on public.pair_members (user_id)
  where left_at is null;

create index if not exists pair_members_pair_idx on public.pair_members (pair_id);

create table if not exists public.invites (
  id         uuid primary key default gen_random_uuid(),
  pair_id    uuid not null references public.pairs (id) on delete cascade,
  -- The link itself is never stored. `token_hash` is sha256(token), used only to
  -- look up an incoming link; `nonce` is random and lets the server regenerate
  -- the token for display via HMAC(INVITE_SECRET, nonce) — the inviter will
  -- close the tab before sending it, so the link has to be recoverable.
  --
  -- A database leak therefore yields neither working links nor the means to
  -- derive them: the nonce is useless without the secret, and the hash is a
  -- one-way function of the token.
  token_hash text not null unique,
  nonce      text not null,
  created_by uuid not null references public.profiles (id) on delete cascade,
  expires_at timestamptz not null,
  claimed_at timestamptz,
  claimed_by uuid references public.profiles (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists invites_pair_idx on public.invites (pair_id);

-- The question bank lives here as well as in TypeScript because the scoring
-- function needs to see facet kinds. src/lib/questions/bank.ts is the source of
-- truth; this table is generated from it by `npm run seed:questions`.
create table if not exists public.questions (
  id                text primary key,
  category          text not null check (category in ('light', 'logistics', 'deep')),
  prompt            text not null,
  facets            jsonb not null,
  -- Position in the rotation, 0-based. Null means written but not in rotation.
  sequence_position int unique
);

create table if not exists public.answers (
  id           uuid primary key default gen_random_uuid(),
  pair_id      uuid not null references public.pairs (id) on delete cascade,
  day_index    int not null check (day_index >= 0),
  question_id  text not null references public.questions (id),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  self_payload  jsonb not null,
  guess_payload jsonb not null,
  submitted_at timestamptz not null default now(),
  -- Immutable: one submission per person per question, ever.
  unique (pair_id, day_index, user_id)
);

create index if not exists answers_pair_day_idx on public.answers (pair_id, day_index);

create table if not exists public.reveals (
  id          uuid primary key default gen_random_uuid(),
  pair_id     uuid not null references public.pairs (id) on delete cascade,
  day_index   int not null check (day_index >= 0),
  question_id text not null references public.questions (id),
  sync_score  int not null check (sync_score between 0 and 100),
  -- Both submissions and the per-facet breakdown, assembled once by
  -- submit_answer(). Names are deliberately NOT snapshotted here — they resolve
  -- from profiles at render time, so switching to a pet name or a pseudonym
  -- applies to the whole history rather than only to new reveals.
  payload     jsonb not null,
  revealed_at timestamptz not null default now(),
  unique (pair_id, day_index)
);

create index if not exists reveals_pair_idx on public.reveals (pair_id, day_index desc);

-- ----------------------------------------------------------------------------
-- Helpers
--
-- SECURITY DEFINER and STABLE. They exist so RLS policies can ask "is the
-- caller in this pair?" without a policy on pair_members recursing into itself.
-- Each one only ever reveals facts about the caller.
-- ----------------------------------------------------------------------------

create or replace function public.current_pair_id()
returns uuid
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select pm.pair_id
  from public.pair_members pm
  join public.pairs p on p.id = pm.pair_id
  where pm.user_id = auth.uid()
    and pm.left_at is null
    and p.status <> 'ended'
  limit 1
$$;

create or replace function public.is_pair_member(p_pair_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1
    from public.pair_members
    where pair_id = p_pair_id
      and user_id = auth.uid()
  )
$$;

-- True once the user has confirmed an email and is no longer anonymous.
-- Nothing in Phase 1 gates on this. Phase 3 requires it before tender can be
-- spent, and Phase 4 before a letter can be sealed or everything burned —
-- irreversible actions should not be available to a session that cannot prove
-- who it belongs to.
create or replace function public.is_claimed()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is not true
     and auth.uid() is not null
$$;

-- ----------------------------------------------------------------------------
-- Row level security
-- ----------------------------------------------------------------------------

alter table public.profiles     enable row level security;
alter table public.pairs        enable row level security;
alter table public.pair_members enable row level security;
alter table public.invites      enable row level security;
alter table public.questions    enable row level security;
alter table public.answers      enable row level security;
alter table public.reveals      enable row level security;

-- Profiles: your own, plus your partner's — you need their first name to be
-- asked "what would Ada say?". Nothing else about them is stored here.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (
    id = auth.uid()
    or exists (
      select 1
      from public.pair_members pm
      where pm.pair_id = public.current_pair_id()
        and pm.user_id = public.profiles.id
    )
  );

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert with check (id = auth.uid());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- Pairs and membership: readable by members. All writes go through functions.
drop policy if exists pairs_select on public.pairs;
create policy pairs_select on public.pairs
  for select using (public.is_pair_member(id));

drop policy if exists pair_members_select on public.pair_members;
create policy pair_members_select on public.pair_members
  for select using (public.is_pair_member(pair_id));

-- Invites: only the person who created one can see it, and only ever the hash.
-- Claiming happens through peek_invite/claim_invite, which take the token.
drop policy if exists invites_select on public.invites;
create policy invites_select on public.invites
  for select using (created_by = auth.uid());

-- Questions are not secret.
drop policy if exists questions_select on public.questions;
create policy questions_select on public.questions
  for select using (true);

-- ============================================================================
-- Answers: the important one.
--
-- SELECT is restricted to the author. There is no policy under which a partner
-- can read this table, so "no peeking" is not a rule the app enforces — it is a
-- shape the data has. INSERT is likewise closed; submit_answer() is the only
-- way in, so the window check and validation cannot be bypassed. No UPDATE or
-- DELETE policy exists at all, which is what makes a submission immutable.
-- ============================================================================
drop policy if exists answers_select_own on public.answers;
create policy answers_select_own on public.answers
  for select using (user_id = auth.uid());

-- Reveals: readable by both members, written only by submit_answer().
drop policy if exists reveals_select on public.reveals;
create policy reveals_select on public.reveals
  for select using (public.is_pair_member(pair_id));

-- ----------------------------------------------------------------------------
-- The pair calendar, in SQL
--
-- Mirrors src/lib/sync/day.ts. A question opens at 00:00 pair-local and stays
-- answerable for 30 hours — six hours past the next rollover. That grace window
-- is what stops the midnight cliff, where one partner answers at 23:55, the
-- other is asleep, and the day turns over on an orphaned answer.
-- ----------------------------------------------------------------------------

create or replace function public.pair_day_index(p_pair_id uuid, p_at timestamptz default now())
returns int
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select ((p_at at time zone p.time_zone)::date - p.day_zero)::int
  from public.pairs p
  where p.id = p_pair_id
$$;

create or replace function public.pair_day_is_open(
  p_pair_id uuid,
  p_day_index int,
  p_at timestamptz default now()
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_tz    text;
  v_today int;
  v_hour  int;
begin
  select time_zone into v_tz from public.pairs where id = p_pair_id;
  if v_tz is null then
    return false;
  end if;

  v_today := public.pair_day_index(p_pair_id, p_at);
  v_hour  := extract(hour from (p_at at time zone v_tz))::int;

  if p_day_index < 0 then
    return false;
  end if;

  -- Today's question is always open.
  if p_day_index = v_today then
    return true;
  end if;

  -- Yesterday's stays open until 06:00 pair-local.
  if p_day_index = v_today - 1 and v_hour < 6 then
    return true;
  end if;

  return false;
end;
$$;

create or replace function public.question_for_day(p_day_index int)
returns public.questions
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_count int;
  v_row   public.questions;
begin
  select count(*) into v_count from public.questions where sequence_position is not null;
  if v_count = 0 then
    raise exception 'question bank is empty — run: npm run seed:questions';
  end if;

  select * into v_row
  from public.questions
  where sequence_position = ((p_day_index % v_count) + v_count) % v_count;

  return v_row;
end;
$$;

-- ----------------------------------------------------------------------------
-- Scoring, in SQL
--
-- Mirrors src/lib/sync/score.ts exactly:
--   choice — 100 on an exact match, else 0
--   scale  — greatest(0, 100 - 2 * |difference|)
-- facets averaged equally, then the two directions averaged into one number
-- for the couple. Symmetric on purpose: both partners earn from the same score,
-- so scoring each person on their own accuracy alone can never leave the less
-- attuned partner unable to afford anything.
-- ----------------------------------------------------------------------------

create or replace function public.score_facet(
  p_kind  text,
  p_truth jsonb,
  p_guess jsonb
)
returns numeric
language plpgsql
immutable
as $$
declare
  v_t numeric;
  v_g numeric;
begin
  if p_truth is null or p_guess is null
     or jsonb_typeof(p_truth) = 'null' or jsonb_typeof(p_guess) = 'null' then
    return 0;
  end if;

  if p_kind = 'choice' then
    return case when p_truth = p_guess then 100 else 0 end;
  end if;

  begin
    v_t := least(100, greatest(0, round((p_truth #>> '{}')::numeric)));
    v_g := least(100, greatest(0, round((p_guess #>> '{}')::numeric)));
  exception when others then
    return 0;
  end;

  return greatest(0, 100 - 2 * abs(v_t - v_g));
end;
$$;

-- One direction: how well p_guess predicted p_truth. Returns
-- {"total": int, "facets": [{facetId, kind, score, truth, guess}, ...]}
create or replace function public.score_direction(
  p_facets jsonb,
  p_truth  jsonb,
  p_guess  jsonb
)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_facet  jsonb;
  v_id     text;
  v_kind   text;
  v_score  numeric;
  v_sum    numeric := 0;
  v_n      int := 0;
  v_detail jsonb := '[]'::jsonb;
begin
  for v_facet in select * from jsonb_array_elements(p_facets) loop
    v_id   := v_facet ->> 'id';
    v_kind := v_facet ->> 'kind';
    v_score := public.score_facet(v_kind, p_truth -> v_id, p_guess -> v_id);

    v_sum := v_sum + v_score;
    v_n := v_n + 1;
    v_detail := v_detail || jsonb_build_object(
      'facetId', v_id,
      'kind', v_kind,
      'score', v_score::int,
      'truth', p_truth -> v_id,
      'guess', p_guess -> v_id
    );
  end loop;

  return jsonb_build_object(
    'total', case when v_n = 0 then 0 else round(v_sum / v_n)::int end,
    'facets', v_detail
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- submit_answer
--
-- The only way an answer enters the system, and the only place both partners'
-- answers are ever visible at once. Validates, records, and — when the second
-- answer arrives — materializes the reveal.
-- ----------------------------------------------------------------------------

create or replace function public.submit_answer(
  p_day_index int,
  p_self      jsonb,
  p_guess     jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user       uuid := auth.uid();
  v_pair_id    uuid;
  v_question   public.questions;
  v_facet      jsonb;
  v_id         text;
  v_kind       text;
  v_value      jsonb;
  v_other      public.answers;
  v_a          public.answers;
  v_b          public.answers;
  v_a_read_b   jsonb;
  v_b_read_a   jsonb;
  v_sync       int;
  v_count      int;
begin
  if v_user is null then
    raise exception 'Not signed in.' using errcode = '28000';
  end if;

  v_pair_id := public.current_pair_id();
  if v_pair_id is null then
    raise exception 'No active pairing.' using errcode = 'P0002';
  end if;

  if not public.pair_day_is_open(v_pair_id, p_day_index) then
    raise exception 'That question has closed.' using errcode = 'P0003';
  end if;

  v_question := public.question_for_day(p_day_index);

  -- Re-validate both payloads here rather than trusting the client. This is the
  -- one place the client writes to, the submission is immutable once accepted,
  -- and it feeds a score that will pay out in Phase 3.
  for v_facet in select * from jsonb_array_elements(v_question.facets) loop
    v_id := v_facet ->> 'id';
    v_kind := v_facet ->> 'kind';

    foreach v_value in array array[p_self -> v_id, p_guess -> v_id] loop
      if v_value is null or jsonb_typeof(v_value) = 'null' then
        raise exception 'Missing answer for "%".', v_id using errcode = '22023';
      end if;

      if v_kind = 'choice' then
        if not exists (
          select 1
          from jsonb_array_elements(v_facet -> 'options') o
          where o -> 'id' = v_value
        ) then
          raise exception 'Invalid option for "%".', v_id using errcode = '22023';
        end if;
      else
        if jsonb_typeof(v_value) <> 'number' then
          raise exception 'Facet "%" must be a number.', v_id using errcode = '22023';
        end if;
      end if;
    end loop;
  end loop;

  -- Immutable. A second submission for the same question is a no-op, not an edit.
  insert into public.answers (pair_id, day_index, question_id, user_id, self_payload, guess_payload)
  values (v_pair_id, p_day_index, v_question.id, v_user, p_self, p_guess)
  on conflict (pair_id, day_index, user_id) do nothing;

  -- Has the other person answered this question yet?
  select * into v_other
  from public.answers
  where pair_id = v_pair_id
    and day_index = p_day_index
    and user_id <> v_user
  limit 1;

  if v_other.id is null then
    return jsonb_build_object('state', 'waiting', 'day_index', p_day_index);
  end if;

  -- Both in. Order deterministically so the reveal renders the same way for
  -- both people and on every subsequent open.
  select * into v_a
  from public.answers
  where pair_id = v_pair_id and day_index = p_day_index
  order by user_id asc
  limit 1;

  select * into v_b
  from public.answers
  where pair_id = v_pair_id and day_index = p_day_index
  order by user_id desc
  limit 1;

  v_a_read_b := public.score_direction(v_question.facets, v_b.self_payload, v_a.guess_payload);
  v_b_read_a := public.score_direction(v_question.facets, v_a.self_payload, v_b.guess_payload);
  v_sync := round(((v_a_read_b ->> 'total')::numeric + (v_b_read_a ->> 'total')::numeric) / 2)::int;

  insert into public.reveals (pair_id, day_index, question_id, sync_score, payload)
  values (
    v_pair_id,
    p_day_index,
    v_question.id,
    v_sync,
    jsonb_build_object(
      'a', jsonb_build_object(
        'user_id', v_a.user_id,
        'self', v_a.self_payload,
        'guess', v_a.guess_payload,
        'submitted_at', v_a.submitted_at
      ),
      'b', jsonb_build_object(
        'user_id', v_b.user_id,
        'self', v_b.self_payload,
        'guess', v_b.guess_payload,
        'submitted_at', v_b.submitted_at
      ),
      'a_read_b', v_a_read_b,
      'b_read_a', v_b_read_a
    )
  )
  on conflict (pair_id, day_index) do nothing;

  -- Both partners have now answered at least once, so the pairing is live.
  update public.pairs set status = 'active' where id = v_pair_id and status = 'pending';

  select count(*) into v_count from public.reveals where pair_id = v_pair_id;

  return jsonb_build_object(
    'state', 'revealed',
    'day_index', p_day_index,
    'sync_score', v_sync,
    'reveal_count', v_count
  );
end;
$$;

-- Whether the partner has answered a given day — a boolean and nothing else.
-- "Ada's already answered" is a far better nudge than silence, and the fact of
-- having answered leaks nothing about the content. Needed as a function because
-- the answers table is, correctly, unreadable across the pair.
create or replace function public.partner_answered(p_day_index int)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1
    from public.answers a
    where a.pair_id = public.current_pair_id()
      and a.day_index = p_day_index
      and a.user_id <> auth.uid()
  )
$$;

-- ----------------------------------------------------------------------------
-- Pairing
-- ----------------------------------------------------------------------------

-- Creates the caller's pair and its invite. Idempotent: calling it again for
-- somebody who already has an active pair returns that pair instead of tripping
-- the one-active-pair constraint.
create or replace function public.create_pair(
  p_time_zone  text,
  p_token_hash text,
  p_nonce      text,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user    uuid := auth.uid();
  v_pair_id uuid;
begin
  if v_user is null then
    raise exception 'Not signed in.' using errcode = '28000';
  end if;

  v_pair_id := public.current_pair_id();
  if v_pair_id is not null then
    return jsonb_build_object('pair_id', v_pair_id, 'created', false);
  end if;

  if not public.is_valid_time_zone(p_time_zone) then
    p_time_zone := 'UTC';
  end if;

  insert into public.pairs (time_zone, day_zero)
  values (p_time_zone, (now() at time zone p_time_zone)::date)
  returning id into v_pair_id;

  insert into public.pair_members (pair_id, user_id, role)
  values (v_pair_id, v_user, 'inviter');

  insert into public.invites (pair_id, token_hash, nonce, created_by, expires_at)
  values (v_pair_id, p_token_hash, p_nonce, v_user, p_expires_at);

  return jsonb_build_object('pair_id', v_pair_id, 'created', true);
end;
$$;

create or replace function public.is_valid_time_zone(p_tz text)
returns boolean
language plpgsql
immutable
as $$
begin
  if p_tz is null or p_tz = '' then
    return false;
  end if;
  perform now() at time zone p_tz;
  return true;
exception when others then
  return false;
end;
$$;

-- What the claim screen shows before anybody commits: who is inviting, and
-- nothing else. Never leaks answers, and never reveals whether a token exists
-- in a way that distinguishes "wrong token" from "expired token" beyond what
-- the recipient needs to act on.
create or replace function public.peek_invite(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_invite public.invites;
  v_name   text;
  v_taken  boolean;
begin
  select * into v_invite from public.invites where token_hash = p_token_hash;

  if v_invite.id is null then
    return jsonb_build_object('state', 'unknown');
  end if;

  if v_invite.revoked_at is not null then
    return jsonb_build_object('state', 'revoked');
  end if;

  select p.first_name into v_name
  from public.profiles p
  where p.id = v_invite.created_by;

  if v_invite.claimed_at is not null then
    -- Already claimed. Once claimed, this link stops being an invitation and
    -- becomes a recovery door: it can only send a sign-in code to the address
    -- already on the account, so holding the link alone grants nothing.
    return jsonb_build_object(
      'state', case when v_invite.claimed_by = auth.uid() then 'claimed_by_you' else 'claimed' end,
      'inviter_first_name', v_name
    );
  end if;

  if v_invite.expires_at < now() then
    return jsonb_build_object('state', 'expired', 'inviter_first_name', v_name);
  end if;

  select exists (
    select 1 from public.pair_members
    where pair_id = v_invite.pair_id and role = 'invitee' and left_at is null
  ) into v_taken;

  if v_taken then
    return jsonb_build_object('state', 'claimed', 'inviter_first_name', v_name);
  end if;

  return jsonb_build_object(
    'state', 'open',
    'inviter_first_name', v_name,
    'pair_id', v_invite.pair_id
  );
end;
$$;

create or replace function public.claim_invite(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user         uuid := auth.uid();
  v_invite       public.invites;
  v_existing     uuid;
  v_member_count int;
begin
  if v_user is null then
    raise exception 'Not signed in.' using errcode = '28000';
  end if;

  select * into v_invite
  from public.invites
  where token_hash = p_token_hash
  for update;

  if v_invite.id is null then
    raise exception 'That link is not valid.' using errcode = 'P0002';
  end if;
  if v_invite.revoked_at is not null then
    raise exception 'That link was cancelled.' using errcode = 'P0004';
  end if;
  if v_invite.expires_at < now() then
    raise exception 'That link has expired.' using errcode = 'P0005';
  end if;
  if v_invite.created_by = v_user then
    raise exception 'That is your own invite link.' using errcode = 'P0006';
  end if;

  -- First claim wins.
  if v_invite.claimed_at is not null then
    if v_invite.claimed_by = v_user then
      return jsonb_build_object('pair_id', v_invite.pair_id, 'already', true);
    end if;
    raise exception 'Somebody has already used that link.' using errcode = 'P0007';
  end if;

  v_existing := public.current_pair_id();
  if v_existing is not null then
    if v_existing = v_invite.pair_id then
      return jsonb_build_object('pair_id', v_existing, 'already', true);
    end if;

    -- Both people invited each other at once. Rather than failing on the
    -- one-active-pair constraint, accept theirs and discard the caller's own
    -- pair — but ONLY while that pair is genuinely empty, so an existing
    -- pairing can never be silently abandoned by following a new link.
    --
    -- The member count must be taken over the whole pair. Counting within a
    -- join already filtered to the caller's own row always yields 1, which
    -- would make every pair look empty and turn this escape hatch into a way
    -- to swap partners without ending anything.
    select count(*) into v_member_count
    from public.pair_members
    where pair_id = v_existing and left_at is null;

    if v_member_count = 1
       and (select status from public.pairs where id = v_existing) = 'pending'
       and exists (
         select 1 from public.pair_members
         where pair_id = v_existing and user_id = v_user and role = 'inviter'
       )
       and not exists (select 1 from public.answers where pair_id = v_existing)
    then
      delete from public.pairs where id = v_existing;
    else
      raise exception 'You are already paired with somebody.' using errcode = 'P0008';
    end if;
  end if;

  insert into public.pair_members (pair_id, user_id, role)
  values (v_invite.pair_id, v_user, 'invitee');

  update public.invites
  set claimed_at = now(), claimed_by = v_user
  where id = v_invite.id;

  return jsonb_build_object('pair_id', v_invite.pair_id, 'already', false);
end;
$$;

-- The 24-hour undo on a mis-sent link. Unpairs the invitee and reopens the
-- invite so the inviter can send it to the right person.
create or replace function public.revoke_claim()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user    uuid := auth.uid();
  v_pair_id uuid;
  v_invite  public.invites;
begin
  if v_user is null then
    raise exception 'Not signed in.' using errcode = '28000';
  end if;

  v_pair_id := public.current_pair_id();
  if v_pair_id is null then
    raise exception 'No active pairing.' using errcode = 'P0002';
  end if;

  select * into v_invite
  from public.invites
  where pair_id = v_pair_id and created_by = v_user
  order by created_at desc
  limit 1;

  if v_invite.id is null then
    raise exception 'Only the person who sent the link can undo it.' using errcode = 'P0009';
  end if;
  if v_invite.claimed_at is null then
    raise exception 'Nobody has used that link yet.' using errcode = 'P0010';
  end if;
  if v_invite.claimed_at < now() - interval '24 hours' then
    raise exception 'That window has closed.' using errcode = 'P0011';
  end if;

  -- Remove the wrong person and everything they submitted, then reopen the link.
  delete from public.answers where pair_id = v_pair_id and user_id = v_invite.claimed_by;
  delete from public.reveals where pair_id = v_pair_id;
  delete from public.pair_members where pair_id = v_pair_id and user_id = v_invite.claimed_by;

  update public.invites
  set claimed_at = null, claimed_by = null, expires_at = greatest(expires_at, now() + interval '7 days')
  where id = v_invite.id;

  update public.pairs set status = 'pending' where id = v_pair_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- ----------------------------------------------------------------------------
-- Grants.
--
-- Supabase's default privileges already extend table access to these roles, but
-- stating it makes the migration self-contained and turns a misconfigured
-- project into a clear permission error rather than an empty result set.
--
-- Note what is granted and what is not: `answers` gets SELECT only, and even
-- that is filtered by RLS down to the author's own rows. There is no INSERT
-- grant, because submit_answer() is the only permitted way in. No table gets
-- UPDATE or DELETE, which is what makes a submission immutable.
-- ----------------------------------------------------------------------------

grant select on public.questions to authenticated, anon;
grant select on public.pairs, public.pair_members, public.invites, public.reveals to authenticated;
grant select on public.answers to authenticated;
grant select, insert, update on public.profiles to authenticated;

-- ----------------------------------------------------------------------------
-- Function grants. Only these are callable.
-- ----------------------------------------------------------------------------

revoke all on function public.submit_answer(int, jsonb, jsonb) from public;
revoke all on function public.create_pair(text, text, text, timestamptz) from public;
revoke all on function public.peek_invite(text) from public;
revoke all on function public.claim_invite(text) from public;
revoke all on function public.revoke_claim() from public;

grant execute on function public.submit_answer(int, jsonb, jsonb) to authenticated;
grant execute on function public.create_pair(text, text, text, timestamptz) to authenticated;
grant execute on function public.peek_invite(text) to authenticated, anon;
grant execute on function public.claim_invite(text) to authenticated;
grant execute on function public.revoke_claim() to authenticated;
grant execute on function public.current_pair_id() to authenticated;
grant execute on function public.pair_day_index(uuid, timestamptz) to authenticated;
grant execute on function public.pair_day_is_open(uuid, int, timestamptz) to authenticated;
grant execute on function public.question_for_day(int) to authenticated, anon;
grant execute on function public.is_claimed() to authenticated;
grant execute on function public.partner_answered(int) to authenticated;
grant execute on function public.is_pair_member(uuid) to authenticated;
