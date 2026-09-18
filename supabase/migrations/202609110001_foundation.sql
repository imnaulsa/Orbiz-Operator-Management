begin;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
create type public.app_role as enum ('super_admin','operator_manager','staff');
create type public.employment_type as enum ('internal','mitra');
create type public.review_status as enum ('pending','approved','rejected');
create type public.assignment_layer as enum ('draft','published');
create table public.locations (
 id text primary key check (id in ('jakarta','bandung')), name text not null unique
);
create table public.profiles (
 id uuid primary key references auth.users(id) on delete restrict,
 display_name text not null check (length(trim(display_name)) between 1 and 120),
 role public.app_role not null default 'staff',
 location_id text references public.locations(id),
 employment_type public.employment_type not null default 'mitra',
 active boolean not null default true,
 created_at timestamptz not null default now(),
 unique(id,location_id),
 check (role='super_admin' or location_id is not null)
);
create table public.operator_rates (
 id uuid primary key default gen_random_uuid(), operator_id uuid not null,
 location_id text not null, effective_date date not null,
 hourly_fee numeric(14,2) not null check(hourly_fee>=0),
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
 foreign key(operator_id,location_id) references public.profiles(id,location_id),
 unique(operator_id,effective_date)
);
create table public.availability_submissions (
 id uuid primary key default gen_random_uuid(), operator_id uuid not null,
 location_id text not null, status public.review_status not null default 'pending',
 submitted_at timestamptz not null default now(), reviewed_by uuid references public.profiles(id),
 reviewed_at timestamptz, review_note text,
 foreign key(operator_id,location_id) references public.profiles(id,location_id),
 unique(id,operator_id,location_id),
 check((status='pending' and reviewed_by is null and reviewed_at is null) or
       (status<>'pending' and reviewed_by is not null and reviewed_at is not null))
);
create table public.availability_slots (
 id uuid primary key default gen_random_uuid(), submission_id uuid not null,
 operator_id uuid not null, location_id text not null,
 work_date date not null, hour smallint not null check(hour between 0 and 23),
 status public.review_status not null default 'pending',
 foreign key(submission_id,operator_id,location_id) references public.availability_submissions(id,operator_id,location_id)
);
-- Hour cells are atomic: a unique partial index is the non-overlap protection.
create unique index availability_no_overlap on public.availability_slots(operator_id,work_date,hour) where status<>'rejected';
create table public.leave_requests (
 id uuid primary key default gen_random_uuid(), operator_id uuid not null, location_id text not null,
 starts_at timestamptz not null, ends_at timestamptz not null,
 leave_type text not null check(length(trim(leave_type)) between 1 and 80),
 reason text not null check(length(trim(reason)) between 1 and 2000),
 status public.review_status not null default 'pending',
 submitted_at timestamptz not null default now(), reviewed_by uuid references public.profiles(id),
 reviewed_at timestamptz, review_note text,
 foreign key(operator_id,location_id) references public.profiles(id,location_id),
 check(ends_at>starts_at),
 check((status='pending' and reviewed_by is null and reviewed_at is null) or
       (status<>'pending' and reviewed_by is not null and reviewed_at is not null))
);
create table public.schedule_publications (
 id uuid primary key default gen_random_uuid(), location_id text not null references public.locations(id),
 week_start date not null check(extract(isodow from week_start)=1),
 version integer not null check(version>0), published_by uuid not null references public.profiles(id),
 published_at timestamptz not null default now(), unique(location_id,week_start,version), unique(id,location_id)
);
create table public.schedule_assignments (
 id uuid primary key default gen_random_uuid(), operator_id uuid not null, location_id text not null,
 work_date date not null, hour smallint not null check(hour between 0 and 23),
 layer public.assignment_layer not null default 'draft',
 publication_id uuid, rate_id uuid references public.operator_rates(id), hourly_fee numeric(14,2),
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
 cancelled_at timestamptz, cancelled_by uuid references public.profiles(id), cancellation_reason text,
 foreign key(operator_id,location_id) references public.profiles(id,location_id),
 foreign key(publication_id,location_id) references public.schedule_publications(id,location_id),
 check((layer='draft' and publication_id is null and rate_id is null and hourly_fee is null) or
       (layer='published' and publication_id is not null and rate_id is not null and hourly_fee>=0)),
 check((cancelled_at is null and cancelled_by is null and cancellation_reason is null) or
       (cancelled_at is not null and cancelled_by is not null and cancellation_reason is not null))
);
create unique index assignment_no_overlap on public.schedule_assignments(operator_id,work_date,hour,layer) where cancelled_at is null;
create table public.audit_logs (
 id uuid primary key default gen_random_uuid(), location_id text references public.locations(id),
 actor_id uuid not null references public.profiles(id), action text not null,
 entity_id uuid, details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index profiles_location on public.profiles(location_id,role);
create index rates_lookup on public.operator_rates(operator_id,effective_date desc);
create index submissions_queue on public.availability_submissions(location_id,status,submitted_at);
create index slots_date on public.availability_slots(location_id,work_date,operator_id);
create index leave_lookup on public.leave_requests(operator_id,starts_at,ends_at) where status<>'rejected';
create index leave_queue on public.leave_requests(location_id,status);
create index assignments_calendar on public.schedule_assignments(location_id,work_date,layer) where cancelled_at is null;
create index assignments_personal on public.schedule_assignments(operator_id,work_date,layer) where cancelled_at is null;
create index audit_history on public.audit_logs(location_id,created_at desc);
create function private.is_active() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and active)
$$;
create function private.is_super() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and active and role='super_admin')
$$;
create function private.can_manage(loc text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and active and
 (role='super_admin' or (role='operator_manager' and location_id=loc)))
$$;
create function private.can_read_person(op uuid,loc text) returns boolean language sql stable security definer set search_path='' as $$
 select private.can_manage(loc) or exists(select 1 from public.profiles where id=auth.uid() and active and id=op and location_id=loc)
$$;
create function private.hour_start(d date,h integer) returns timestamptz language sql immutable set search_path='' as $$
 select (d + make_interval(hours=>h)) at time zone 'Asia/Jakarta'
$$;
alter table public.locations enable row level security;
alter table public.profiles enable row level security;
alter table public.operator_rates enable row level security;
alter table public.availability_submissions enable row level security;
alter table public.availability_slots enable row level security;
alter table public.leave_requests enable row level security;
alter table public.schedule_publications enable row level security;
alter table public.schedule_assignments enable row level security;
alter table public.audit_logs enable row level security;
create policy locations_read on public.locations for select to authenticated using (
 private.can_manage(id) or exists(select 1 from public.profiles where profiles.id=auth.uid() and active and location_id=locations.id));
create policy profiles_read on public.profiles for select to authenticated using (
 private.is_active() and (id=auth.uid() or private.can_manage(location_id)));
create policy rates_read on public.operator_rates for select to authenticated using(private.can_read_person(operator_id,location_id));
create policy submissions_read on public.availability_submissions for select to authenticated using(private.can_read_person(operator_id,location_id));
create policy slots_read on public.availability_slots for select to authenticated using(private.can_read_person(operator_id,location_id));
create policy leave_read on public.leave_requests for select to authenticated using(private.can_read_person(operator_id,location_id));
create policy publication_read on public.schedule_publications for select to authenticated using(private.can_manage(location_id));
create policy assignments_read on public.schedule_assignments for select to authenticated using(
 private.can_manage(location_id) or (private.can_read_person(operator_id,location_id) and layer='published' and cancelled_at is null));
create policy audit_read on public.audit_logs for select to authenticated using(private.can_manage(location_id));
revoke all on public.locations,public.profiles,public.operator_rates,public.availability_submissions,
 public.availability_slots,public.leave_requests,public.schedule_publications,public.schedule_assignments,public.audit_logs from anon,authenticated;
grant select on public.locations,public.profiles,public.operator_rates,public.availability_submissions,
 public.availability_slots,public.leave_requests,public.schedule_publications,public.schedule_assignments,public.audit_logs to authenticated;
revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.is_active(),private.is_super(),private.can_manage(text),private.can_read_person(uuid,text) to authenticated;
commit;
