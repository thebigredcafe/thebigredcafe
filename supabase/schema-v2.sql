-- ============================================================
-- Café Roster — Schema v2
-- Run this AFTER schema.sql
-- ============================================================

-- Sport teams (soccer/rugby/netball)
create table sport_teams (
  id                   uuid primary key default uuid_generate_v4(),
  sport                text not null check (sport in ('soccer', 'rugby', 'netball')),
  name                 text not null,
  -- Soccer (SSFA mycompapp)
  ssfa_club_id         integer,
  ssfa_age_group_id    integer,
  ssfa_label           text,
  -- Rugby (MySideline PRL)
  prl_competition_id   bigint,
  prl_team_id          bigint,
  -- Netball (PlayHQ)
  playhq_team_id       text,
  created_at           timestamptz default now()
);

-- Link a staff member to a sport team
alter table profiles add column if not exists sport_team_id uuid references sport_teams(id);
alter table profiles add column if not exists min_hours_week numeric(4,1);
alter table profiles add column if not exists max_hours_week numeric(4,1);

-- Roles + skill levels per staff member
create table staff_roles (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references profiles(id) on delete cascade,
  role         text not null check (role in (
    'barista','customer_service','floor_staff',
    'kitchen_cook','kitchen_cook_prep','dishwasher'
  )),
  skill_level  integer not null default 1 check (skill_level between 1 and 5),
  created_at   timestamptz default now(),
  unique(user_id, role)
);

-- Cached fixture data fetched from sport sites
create table fixture_cache (
  id          uuid primary key default uuid_generate_v4(),
  team_id     uuid not null references sport_teams(id) on delete cascade,
  date        date not null,
  round       integer,
  kickoff     time,
  home_team   text,
  away_team   text,
  venue       text,
  is_home     boolean default false,
  fetched_at  timestamptz default now(),
  unique(team_id, date, round)
);

-- Future availability changes (e.g. new semester starting date X)
create table availability_changes (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references profiles(id) on delete cascade,
  effective_from  date not null,
  effective_to    date,
  day_of_week     text not null check (day_of_week in ('Mon','Tue','Wed','Thu','Fri','Sat','Sun')),
  start_time      time,
  end_time        time,
  unavailable     boolean default false,
  note            text,
  created_at      timestamptz default now()
);

-- ── RLS ─────────────────────────────────────────────────────

alter table sport_teams         enable row level security;
alter table staff_roles         enable row level security;
alter table fixture_cache       enable row level security;
alter table availability_changes enable row level security;

-- Sport teams: anyone can read, manager manages
create policy "Anyone: read sport teams"    on sport_teams for select using (true);
create policy "Manager: manage sport teams" on sport_teams for all    using (is_manager());

-- Staff roles: own + manager
create policy "Staff: read own roles"       on staff_roles for select using (user_id = auth.uid());
create policy "Staff: insert own roles"     on staff_roles for insert with check (user_id = auth.uid());
create policy "Manager: manage all roles"   on staff_roles for all    using (is_manager());

-- Fixture cache: anyone reads, manager/server refreshes
create policy "Anyone: read fixture cache"  on fixture_cache for select using (true);
create policy "Manager: manage fixture cache" on fixture_cache for all using (is_manager());

-- Availability changes: own + manager reads
create policy "Staff: manage own changes"   on availability_changes for all    using (user_id = auth.uid());
create policy "Manager: read all changes"   on availability_changes for select using (is_manager());
