-- ============================================================
-- Café Roster — Supabase Schema (no Xero integration)
-- ============================================================

create extension if not exists "uuid-ossp";


-- ------------------------------------------------------------
-- PROFILES
-- ------------------------------------------------------------
create table profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  full_name        text not null,
  email            text not null,
  role             text not null default 'staff' check (role in ('staff', 'manager')),
  phone            text,
  hourly_rate      numeric(8, 2),
  employment_type  text default 'casual'
    check (employment_type in ('casual', 'part_time', 'full_time')),
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'New Staff'),
    new.email
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();


-- ------------------------------------------------------------
-- AVAILABILITY
-- Recurring weekly availability
-- ------------------------------------------------------------
create table availability (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references profiles(id) on delete cascade,
  day_of_week  text not null check (day_of_week in ('Mon','Tue','Wed','Thu','Fri','Sat','Sun')),
  start_time   time not null,
  end_time     time not null,
  note         text,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),
  constraint valid_time_range check (end_time > start_time)
);


-- ------------------------------------------------------------
-- UNAVAILABILITY
-- One-off dates a staff member can't work
-- ------------------------------------------------------------
create table unavailability (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references profiles(id) on delete cascade,
  date        date not null,
  reason      text,
  all_day     boolean default true,
  start_time  time,
  end_time    time,
  created_at  timestamptz default now()
);


-- ------------------------------------------------------------
-- SHIFTS
-- Rostered shifts created by manager
-- ------------------------------------------------------------
create table shifts (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references profiles(id) on delete cascade,
  date        date not null,
  start_time  time not null,
  end_time    time not null,
  role        text,
  notes       text,
  published   boolean default false,
  created_by  uuid references profiles(id),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);


-- ------------------------------------------------------------
-- SHIFT COMPLETIONS
-- Actual hours worked — source of truth for pay export
-- ------------------------------------------------------------
create table shift_completions (
  id                      uuid primary key default uuid_generate_v4(),
  shift_id                uuid references shifts(id) on delete set null,
  user_id                 uuid not null references profiles(id) on delete cascade,
  date                    date not null,
  scheduled_start         time,
  scheduled_end           time,
  actual_start            time,
  actual_end              time,
  break_minutes           integer default 0,
  hourly_rate_snapshot    numeric(8, 2),
  leave_type              text default 'worked'
    check (leave_type in ('worked', 'sick', 'annual', 'unpaid', 'public_holiday')),
  status                  text default 'pending'
    check (status in ('pending', 'approved', 'adjusted')),
  manager_notes           text,
  approved_by             uuid references profiles(id),
  approved_at             timestamptz,
  created_at              timestamptz default now(),
  updated_at              timestamptz default now()
);


-- ------------------------------------------------------------
-- PAY PERIODS
-- ------------------------------------------------------------
create table pay_periods (
  id            uuid primary key default uuid_generate_v4(),
  period_start  date not null,
  period_end    date not null,
  status        text default 'open'
    check (status in ('open', 'locked', 'exported')),
  exported_at   timestamptz,
  exported_by   uuid references profiles(id),
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);


-- ------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ------------------------------------------------------------
alter table profiles          enable row level security;
alter table availability      enable row level security;
alter table unavailability    enable row level security;
alter table shifts            enable row level security;
alter table shift_completions enable row level security;
alter table pay_periods       enable row level security;

create or replace function is_manager()
returns boolean as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'manager'
  );
$$ language sql security definer;

-- Profiles
create policy "Staff: read own profile"     on profiles for select using (id = auth.uid());
create policy "Staff: update own profile"   on profiles for update using (id = auth.uid());
create policy "Manager: read all profiles"  on profiles for select using (is_manager());
create policy "Manager: update profiles"    on profiles for update using (is_manager());

-- Availability
create policy "Staff: manage own availability"   on availability for all using (user_id = auth.uid());
create policy "Manager: read all availability"   on availability for select using (is_manager());

-- Unavailability
create policy "Staff: manage own unavailability" on unavailability for all using (user_id = auth.uid());
create policy "Manager: read all unavailability" on unavailability for select using (is_manager());

-- Shifts
create policy "Staff: read own published shifts" on shifts for select
  using (user_id = auth.uid() and published = true);
create policy "Manager: manage all shifts"       on shifts for all using (is_manager());

-- Shift completions
create policy "Staff: read own completions"       on shift_completions for select using (user_id = auth.uid());
create policy "Manager: manage all completions"   on shift_completions for all using (is_manager());

-- Pay periods (manager only)
create policy "Manager: manage pay periods"       on pay_periods for all using (is_manager());


-- ------------------------------------------------------------
-- VIEW: weekly hours summary (powers the CSV pay export)
-- ------------------------------------------------------------
create or replace view weekly_hours_summary as
select
  sc.user_id,
  p.full_name,
  p.employment_type,
  p.hourly_rate,
  pp.id             as pay_period_id,
  pp.period_start,
  pp.period_end,
  count(*)          filter (where sc.leave_type = 'worked') as shifts_worked,
  sum(
    extract(epoch from (sc.actual_end - sc.actual_start)) / 60
    - sc.break_minutes
  )                 filter (where sc.leave_type = 'worked') as total_paid_minutes,
  round(
    sum(
      extract(epoch from (sc.actual_end - sc.actual_start)) / 60
      - sc.break_minutes
    ) filter (where sc.leave_type = 'worked') / 60.0
  , 2)              as total_hours,
  round(
    sum(
      extract(epoch from (sc.actual_end - sc.actual_start)) / 60
      - sc.break_minutes
    ) filter (where sc.leave_type = 'worked') / 60.0
    * sc.hourly_rate_snapshot
  , 2)              as gross_pay
from shift_completions sc
join profiles p on p.id = sc.user_id
join pay_periods pp on sc.date between pp.period_start and pp.period_end
where sc.status = 'approved'
group by sc.user_id, p.full_name, p.employment_type, p.hourly_rate,
         pp.id, pp.period_start, pp.period_end, sc.hourly_rate_snapshot;
