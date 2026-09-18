begin;
create table public.production_studios (
 id uuid primary key default gen_random_uuid(), location_id text not null references public.locations(id),
 name text not null check(length(trim(name)) between 1 and 120), capacity integer not null check(capacity between 1 and 50),
 unique(location_id,name)
);
create table public.production_quotations (
 id uuid primary key default gen_random_uuid(), location_id text not null references public.locations(id),
 reference text not null check(length(trim(reference)) between 1 and 120), brand text not null check(length(trim(brand)) between 1 and 120),
 account text not null check(length(trim(account)) between 1 and 120), platform text not null check(platform in ('TikTok','Shopee')),
 period_start date not null, period_end date not null, hours integer not null check(hours between 1 and 10000),
 rate numeric(14,2) not null check(rate>=0), best_hours integer[] not null default '{}',
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
 check(period_end>=period_start and period_end-period_start<=366), unique(location_id,reference)
);
create table public.host_availability (
 id uuid primary key default gen_random_uuid(), host_id uuid not null references public.profiles(id),
 location_id text not null references public.locations(id), work_date date not null, hour integer not null check(hour between 0 and 23),
 status public.review_status not null default 'pending', reviewed_by uuid references public.profiles(id), review_note text,
 created_at timestamptz not null default now()
);
create unique index host_availability_lock on public.host_availability(host_id,work_date,hour) where status<>'rejected';
create table public.host_leaves (
 id uuid primary key default gen_random_uuid(), host_id uuid not null references public.profiles(id),
 location_id text not null references public.locations(id), work_date date not null,
 start_hour integer not null check(start_hour between 0 and 23), end_hour integer not null check(end_hour between 1 and 24),
 reason text not null check(length(trim(reason)) between 1 and 2000), status public.review_status not null default 'pending',
 reviewed_by uuid references public.profiles(id), review_note text, created_at timestamptz not null default now(), check(end_hour>start_hour)
);
create table public.host_rates (
 id uuid primary key default gen_random_uuid(), host_id uuid not null references public.profiles(id),
 location_id text not null references public.locations(id), effective_date date not null,
 hourly_fee numeric(14,2) not null check(hourly_fee>=0), created_by uuid not null references public.profiles(id), unique(host_id,effective_date)
);
create table public.live_sessions (
 id uuid primary key default gen_random_uuid(), location_id text not null references public.locations(id),
 quotation_id uuid not null references public.production_quotations(id), studio_id uuid not null references public.production_studios(id),
 lane integer not null check(lane>0), work_date date not null, start_hour integer not null check(start_hour between 0 and 23),
 end_hour integer not null check(end_hour between 1 and 24), host_id uuid references public.profiles(id),
 host_fee numeric(14,2), status text not null default 'draft' check(status in ('draft','published','cancelled')),
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), check(end_hour>start_hour)
);
create index live_sessions_calendar on public.live_sessions(location_id,work_date);
create index live_sessions_host on public.live_sessions(host_id,work_date);
create table public.live_checks (
 id uuid primary key default gen_random_uuid(), session_id uuid not null references public.live_sessions(id),
 location_id text not null references public.locations(id), kind text not null check(kind in ('operator','host')),
 submitted_by uuid not null references public.profiles(id), answers jsonb not null, note text not null default '',
 actual_start timestamptz, actual_end timestamptz, created_at timestamptz not null default now(), unique(session_id,kind),
 check((kind='operator' and actual_start is null and actual_end is null) or (kind='host' and actual_start is not null and actual_end>actual_start))
);
-- Mutations are exclusively RPCs: clients cannot bypass validation or alter a role.
do $$ declare t text; begin
 foreach t in array array['production_studios','production_quotations','host_availability','host_leaves','host_rates','live_sessions','live_checks'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
 end loop;
end $$;
create function private.production_manager(loc text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and active and (role='super_admin' or (role in ('operator_manager','host_manager') and location_id=loc)))
$$;
create function private.host_manager(loc text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and active and (role='super_admin' or (role='host_manager' and location_id=loc)))
$$;
create function private.host_available(hid uuid,loc text,d date,hs integer,he integer,excluded uuid default null) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=hid and role='host' and active and location_id=loc)
 and not exists(select 1 from generate_series(hs,he-1) h where not exists(select 1 from public.host_availability a where a.host_id=hid and a.work_date=d and a.hour=h and a.status='approved'))
 and not exists(select 1 from public.host_leaves l where l.host_id=hid and l.work_date=d and l.status='approved' and l.start_hour<he and l.end_hour>hs)
 and not exists(select 1 from public.live_sessions s where s.host_id=hid and s.work_date=d and s.status<>'cancelled' and s.start_hour<he and s.end_hour>hs and (excluded is null or s.id<>excluded))
$$;
create function public.production_snapshot(p_location text,p_start date,p_end date) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.profiles; result jsonb;
begin
 select * into actor from public.profiles where id=auth.uid() and active;
 if actor.id is null or (actor.role<>'super_admin' and actor.location_id is distinct from p_location) then raise exception 'Akses ditolak' using errcode='42501'; end if;
 if p_start is null or p_end is null or p_end<p_start or p_end-p_start>366 then raise exception 'Rentang maksimal 367 hari'; end if;
 select jsonb_build_object(
 'studios',coalesce((select jsonb_agg(to_jsonb(s) order by s.name) from public.production_studios s where s.location_id=p_location),'[]'::jsonb),
 'quotations',coalesce((select jsonb_agg(case when actor.role in ('super_admin','admin_sales') then to_jsonb(q) else to_jsonb(q)-'rate' end || jsonb_build_object('allocated_hours',(select coalesce(sum(x.end_hour-x.start_hour),0) from public.live_sessions x where x.quotation_id=q.id and x.status<>'cancelled')) order by q.period_start,q.reference) from public.production_quotations q where q.location_id=p_location and q.period_end>=p_start and q.period_start<=p_end),'[]'::jsonb),
 'hosts',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'display_name',p.display_name,'active',p.active) order by p.display_name) from public.profiles p where p.location_id=p_location and p.role='host' and (private.production_manager(p_location) or p.id=actor.id)),'[]'::jsonb),
 'availability',coalesce((select jsonb_agg(to_jsonb(a) order by a.work_date,a.hour,a.id) from public.host_availability a where a.location_id=p_location and a.work_date between p_start and p_end and (private.production_manager(p_location) or a.host_id=actor.id)),'[]'::jsonb),
 'leaves',coalesce((select jsonb_agg(to_jsonb(l) order by l.work_date,l.id) from public.host_leaves l where l.location_id=p_location and l.work_date between p_start and p_end and (private.host_manager(p_location) or l.host_id=actor.id)),'[]'::jsonb),
 'rates',coalesce((select jsonb_agg(to_jsonb(r) order by r.effective_date desc,r.id) from public.host_rates r where r.location_id=p_location and (private.host_manager(p_location) or r.host_id=actor.id)),'[]'::jsonb),
 'sessions',coalesce((select jsonb_agg(case when private.host_manager(p_location) or s.host_id=actor.id then to_jsonb(s) else to_jsonb(s)-'host_fee' end order by s.work_date,s.start_hour,s.id) from public.live_sessions s where s.location_id=p_location and s.work_date between p_start and p_end and (private.production_manager(p_location) or (s.status='published' and (actor.role<>'host' or s.host_id=actor.id)))),'[]'::jsonb),
 'checks',coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at,c.id) from public.live_checks c join public.live_sessions s on s.id=c.session_id where s.location_id=p_location and s.work_date between p_start and p_end and (private.production_manager(p_location) or (s.status='published' and (actor.role='staff' or s.host_id=actor.id)))),'[]'::jsonb)
 ) into result;
 -- A shared operator check gates each covered shift hour once, even when several lives overlap.
 result:=result || jsonb_build_object('operator_logbook',coalesce((
  select jsonb_agg(to_jsonb(daily) order by daily.work_date) from (
   select a.work_date,count(*)::integer planned_hours,
    count(*) filter(where exists(select 1 from public.live_sessions s where s.location_id=p_location and s.work_date=a.work_date and s.status='published' and s.start_hour<=a.hour and s.end_hour>a.hour)
    and not exists(select 1 from public.live_sessions s where s.location_id=p_location and s.work_date=a.work_date and s.status='published' and s.start_hour<=a.hour and s.end_hour>a.hour and not exists(select 1 from public.live_checks c where c.session_id=s.id and c.kind='operator')))::integer eligible_hours
   from public.schedule_assignments a where actor.role='staff' and a.operator_id=actor.id and a.location_id=p_location and a.work_date between p_start and p_end and a.layer='published' and a.cancelled_at is null
   group by a.work_date
  ) daily
 ),'[]'::jsonb));
 return result;
end $$;
create function public.production_action(p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.profiles; loc text; sid uuid; q public.production_quotations; st public.production_studios; s public.live_sessions;
 l public.host_leaves; item jsonb; d date; hs integer; he integer; hid uuid; fee numeric; used integer;
 rid uuid; approved boolean; host_ids uuid[]; hour_value integer; day_value date; lane_value integer; made integer:=0; target integer; result jsonb;
begin
 select * into actor from public.profiles where id=auth.uid() and active;
 loc:=p_payload->>'location';
 if actor.id is null or loc is null or (actor.role<>'super_admin' and actor.location_id is distinct from loc) then raise exception 'Akses ditolak' using errcode='42501'; end if;
 perform private.lock_location(loc);
 if p_action='studio' then
  if actor.role not in ('super_admin','operator_manager') then raise exception 'Hanya pengelola production'; end if;
  insert into public.production_studios(location_id,name,capacity) values(loc,trim(p_payload->>'name'),(p_payload->>'capacity')::integer) returning id into rid;
 elsif p_action='quotation' then
  if actor.role not in ('super_admin','admin_sales') then raise exception 'Hanya Admin Sales'; end if;
  if exists(select 1 from jsonb_array_elements_text(p_payload->'best_hours') h where h::integer not between 0 and 23) then raise exception 'Best hours tidak valid'; end if;
  insert into public.production_quotations(location_id,reference,brand,account,platform,period_start,period_end,hours,rate,best_hours,created_by)
  values(loc,trim(p_payload->>'reference'),trim(p_payload->>'brand'),trim(p_payload->>'account'),p_payload->>'platform',(p_payload->>'period_start')::date,(p_payload->>'period_end')::date,(p_payload->>'hours')::integer,(p_payload->>'rate')::numeric,array(select distinct value::integer from jsonb_array_elements_text(p_payload->'best_hours')),actor.id) returning id into rid;
 elsif p_action='best_hours' then
  if not private.production_manager(loc) then raise exception 'Hanya manager'; end if;
  if exists(select 1 from jsonb_array_elements_text(p_payload->'hours') h where h::integer not between 0 and 23) then raise exception 'Jam tidak valid'; end if;
  update public.production_quotations set best_hours=array(select distinct value::integer from jsonb_array_elements_text(p_payload->'hours')) where id=(p_payload->>'id')::uuid and location_id=loc returning id into rid;
  if rid is null then raise exception 'Quotation tidak ditemukan'; end if;
 elsif p_action='availability' then
  if actor.role<>'host' then raise exception 'Hanya Host'; end if;
  if jsonb_typeof(p_payload->'slots') is distinct from 'array' or jsonb_array_length(p_payload->'slots') not between 1 and 168 then raise exception 'Pilih 1 sampai 168 slot'; end if;
  for item in select * from jsonb_array_elements(p_payload->'slots') loop
   d:=(item->>'date')::date; hs:=(item->>'hour')::integer;
   if private.hour_start(d,hs)<now()+interval '1 hour' then raise exception 'Cutoff availability satu jam'; end if;
   insert into public.host_availability(host_id,location_id,work_date,hour) values(actor.id,loc,d,hs) returning id into rid;
  end loop;
 elsif p_action='review_availability' then
  if not private.host_manager(loc) then raise exception 'Hanya Host Manager'; end if;
  approved:=(p_payload->>'approve')::boolean;
  if approved is null then raise exception 'Keputusan wajib'; end if;
  for item in select * from jsonb_array_elements(p_payload->'ids') loop
   update public.host_availability set status=case when approved then 'approved'::public.review_status else 'rejected'::public.review_status end,reviewed_by=actor.id,review_note=p_payload->>'note'
   where id=(item#>>'{}')::uuid and location_id=loc and status='pending' returning id into rid;
   if rid is null then raise exception 'Availability tidak pending'; end if;
  end loop;
 elsif p_action='leave' then
  if actor.role<>'host' then raise exception 'Hanya Host'; end if;
  d:=(p_payload->>'date')::date; hs:=(p_payload->>'start')::integer; he:=(p_payload->>'end')::integer;
  if private.hour_start(d,hs)<=now() then raise exception 'Izin harus sebelum sesi'; end if;
  if not exists(select 1 from public.live_sessions where host_id=actor.id and work_date=d and status='published' and start_hour<he and end_hour>hs) then raise exception 'Tidak ada jadwal published yang overlap'; end if;
  insert into public.host_leaves(host_id,location_id,work_date,start_hour,end_hour,reason) values(actor.id,loc,d,hs,he,trim(p_payload->>'reason')) returning id into rid;
 elsif p_action='review_leave' then
  if not private.host_manager(loc) then raise exception 'Hanya Host Manager'; end if;
  select * into l from public.host_leaves where id=(p_payload->>'id')::uuid and location_id=loc and status='pending';
  if not found then raise exception 'Izin tidak pending'; end if;
  approved:=(p_payload->>'approve')::boolean;
  if approved is null then raise exception 'Keputusan wajib'; end if;
  if approved and private.hour_start(l.work_date,l.start_hour)<=now() then raise exception 'Izin sudah melewati waktu mulai; perlu koreksi terpisah'; end if;
  update public.host_leaves set status=case when approved then 'approved'::public.review_status else 'rejected'::public.review_status end,reviewed_by=actor.id,review_note=p_payload->>'note' where id=l.id;
  if approved then
   -- Preserve the live session/studio. Remove host from whole overlapping sessions; manager replots a replacement.
   update public.live_sessions set host_id=null,host_fee=null where host_id=l.host_id and work_date=l.work_date and status<>'cancelled' and start_hour<l.end_hour and end_hour>l.start_hour;
  end if; rid:=l.id;
 elsif p_action='rate' then
  if not private.host_manager(loc) then raise exception 'Hanya Host Manager'; end if;
  hid:=(p_payload->>'host')::uuid; d:=(p_payload->>'effective')::date;
  if not exists(select 1 from public.profiles where id=hid and role='host' and active and location_id=loc) then raise exception 'Host tidak valid'; end if;
  if d<(now() at time zone 'Asia/Jakarta')::date or exists(select 1 from public.live_sessions where host_id=hid and status='published' and work_date>=d) then raise exception 'Rate harus setelah jadwal published terakhir dan tidak retroaktif'; end if;
  insert into public.host_rates(host_id,location_id,effective_date,hourly_fee,created_by) values(hid,loc,d,(p_payload->>'fee')::numeric,actor.id) returning id into rid;
 elsif p_action='session' then
  if not private.production_manager(loc) then raise exception 'Hanya manager'; end if;
  select * into q from public.production_quotations where id=(p_payload->>'quotation')::uuid and location_id=loc;
  if not found then raise exception 'Quotation tidak valid'; end if;
  select * into st from public.production_studios where id=(p_payload->>'studio')::uuid and location_id=loc;
  if not found then raise exception 'Studio tidak valid'; end if;
  d:=(p_payload->>'date')::date; hs:=(p_payload->>'start')::integer; he:=(p_payload->>'end')::integer; lane_value:=(p_payload->>'lane')::integer; hid:=nullif(p_payload->>'host','')::uuid;
  if d is null or d not between q.period_start and q.period_end or hs is null or he is null or hs<0 or he>24 or hs>=he or lane_value is null or lane_value not between 1 and st.capacity or private.hour_start(d,hs)<=now() then raise exception 'Tanggal/jam/kapasitas studio tidak valid'; end if;
  if exists(select 1 from public.live_sessions where studio_id=st.id and lane=lane_value and work_date=d and status<>'cancelled' and start_hour<he and end_hour>hs) then raise exception 'Studio penuh/bentrok'; end if;
  if exists(select 1 from public.live_sessions x join public.production_quotations b on b.id=x.quotation_id where x.status<>'cancelled' and b.account=q.account and b.platform=q.platform and x.work_date=d and x.start_hour<he and x.end_hour>hs) then raise exception 'Akun toko bentrok'; end if;
  select coalesce(sum(end_hour-start_hour),0) into used from public.live_sessions where quotation_id=q.id and status<>'cancelled';
  if used+he-hs>q.hours then raise exception 'Melebihi kuota quotation'; end if;
  if hid is not null and not private.host_available(hid,loc,d,hs,he) then raise exception 'Host tidak available/bentrok/izin'; end if;
  insert into public.live_sessions(location_id,quotation_id,studio_id,lane,work_date,start_hour,end_hour,host_id,created_by) values(loc,q.id,st.id,lane_value,d,hs,he,hid,actor.id) returning id into rid;
 elsif p_action='auto_plot' then
  if not private.production_manager(loc) then raise exception 'Hanya manager'; end if;
  select * into q from public.production_quotations where id=(p_payload->>'quotation')::uuid and location_id=loc;
  if not found or cardinality(q.best_hours)=0 then raise exception 'Isi best hours quotation terlebih dahulu'; end if;
  select * into st from public.production_studios where id=(p_payload->>'studio')::uuid and location_id=loc;
  if not found then raise exception 'Studio tidak valid'; end if;
  host_ids:=array(select value::uuid from jsonb_array_elements_text(p_payload->'hosts'));
  select q.hours-coalesce(sum(end_hour-start_hour),0) into target from public.live_sessions where quotation_id=q.id and status<>'cancelled';
  -- One-hour drafts; ordered host list defines manually entered priority. Unfillable hours remain visible.
  for day_value in select generate_series(greatest(q.period_start,(now() at time zone 'Asia/Jakarta')::date),q.period_end,interval '1 day')::date loop
   foreach hour_value in array q.best_hours loop
    exit when made>=target;
    if private.hour_start(day_value,hour_value)<=now() then continue; end if;
    if exists(select 1 from public.live_sessions x join public.production_quotations b on b.id=x.quotation_id where x.status<>'cancelled' and b.account=q.account and b.platform=q.platform and x.work_date=day_value and x.start_hour<=hour_value and x.end_hour>hour_value) then continue; end if;
    select n into lane_value from generate_series(1,st.capacity) n where not exists(select 1 from public.live_sessions x where x.studio_id=st.id and x.lane=n and x.work_date=day_value and x.status<>'cancelled' and x.start_hour<=hour_value and x.end_hour>hour_value) limit 1;
    if lane_value is null then continue; end if;
    hid:=null;
    select h into hid from unnest(host_ids) with ordinality as u(h,priority) where private.host_available(h,loc,day_value,hour_value,hour_value+1) order by priority limit 1;
    if cardinality(host_ids)>0 and hid is null then continue; end if;
    result:=public.production_action('session',jsonb_build_object('location',loc,'quotation',q.id,'studio',st.id,'date',day_value,'start',hour_value,'end',hour_value+1,'lane',lane_value,'host',hid)); made:=made+1;
   end loop;
   exit when made>=target;
  end loop;
  perform private.audit(loc,'production.auto_plot',q.id,jsonb_build_object('created',made,'remaining',target-made));
  return jsonb_build_object('created',made,'remaining',target-made);
 elsif p_action in ('assign_host','publish','cancel','check') then
  select * into s from public.live_sessions where id=(p_payload->>'id')::uuid and location_id=loc and status<>'cancelled';
  if not found then raise exception 'Sesi tidak ditemukan'; end if;
  rid:=s.id;
  if p_action<>'check' and not private.production_manager(loc) then raise exception 'Hanya manager'; end if;
  if p_action in ('assign_host','cancel') and (private.hour_start(s.work_date,s.start_hour)<=now() or exists(select 1 from public.live_checks where session_id=s.id)) then raise exception 'Sesi sudah berjalan/tercatat; perlu koreksi terpisah'; end if;
  if p_action='assign_host' then
   hid:=(p_payload->>'host')::uuid;
   if hid is null or not private.host_available(hid,loc,s.work_date,s.start_hour,s.end_hour,s.id) then raise exception 'Host tidak available'; end if;
   select hourly_fee into fee from public.host_rates where host_id=hid and effective_date<=s.work_date order by effective_date desc limit 1;
   if s.status='published' and fee is null then raise exception 'Rate host belum tersedia'; end if;
   update public.live_sessions set host_id=hid,host_fee=case when status='published' then fee else null end where id=s.id;
  elsif p_action='publish' then
   if s.status<>'draft' then raise exception 'Sesi sudah dipublish'; end if;
   if private.hour_start(s.work_date,s.start_hour)<=now() then raise exception 'Tidak dapat publish sesi lampau'; end if;
   if s.host_id is null or not private.host_available(s.host_id,loc,s.work_date,s.start_hour,s.end_hour,s.id) then raise exception 'Host approved wajib sebelum publish'; end if;
   select hourly_fee into fee from public.host_rates where host_id=s.host_id and effective_date<=s.work_date order by effective_date desc limit 1;
   if fee is null then raise exception 'Rate host belum tersedia'; end if;
   if exists(select 1 from generate_series(s.start_hour,s.end_hour-1) h where not exists(select 1 from public.schedule_assignments a join public.profiles p on p.id=a.operator_id where a.location_id=loc and a.work_date=s.work_date and a.hour=h and a.layer='published' and a.cancelled_at is null and p.active)) then raise exception 'Shift operator published wajib mencakup setiap jam sesi'; end if;
   update public.live_sessions set status='published',host_fee=fee where id=s.id;
  elsif p_action='cancel' then
   update public.live_sessions set status='cancelled' where id=s.id;
  else
   if s.status<>'published' then raise exception 'Sesi belum published'; end if;
   if now()<private.hour_start(s.work_date,s.start_hour) then raise exception 'Checklist baru dapat diisi saat sesi mulai'; end if;
   if length(coalesce(p_payload->>'note',''))>2000 then raise exception 'Catatan terlalu panjang'; end if;
   if p_payload->>'kind'='host' then
    if actor.role<>'host' or actor.id is distinct from s.host_id then raise exception 'Hanya Host pada sesi ini'; end if;
    if (p_payload->'answers'->>'ready')::boolean is distinct from true or (p_payload->'answers'->>'brief')::boolean is distinct from true then raise exception 'Checklist host belum lengkap'; end if;
    if (p_payload->>'actual_start')::timestamptz is null or (p_payload->>'actual_end')::timestamptz is null or (p_payload->>'actual_start')::timestamptz<private.hour_start(s.work_date,s.start_hour) or (p_payload->>'actual_end')::timestamptz>least(now(),private.hour_start(s.work_date,s.end_hour)) or (p_payload->>'actual_end')::timestamptz<=(p_payload->>'actual_start')::timestamptz then raise exception 'Durasi aktual harus di dalam sesi dan tidak di masa depan'; end if;
   elsif p_payload->>'kind'='operator' then
    if actor.role<>'staff' or not exists(select 1 from public.schedule_assignments where operator_id=actor.id and location_id=loc and work_date=s.work_date and hour>=s.start_hour and hour<s.end_hour and layer='published' and cancelled_at is null) then raise exception 'Hanya operator pada shift sesi ini'; end if;
    if (p_payload->'answers'->>'audio')::boolean is distinct from true or (p_payload->'answers'->>'camera')::boolean is distinct from true or (p_payload->'answers'->>'network')::boolean is distinct from true then raise exception 'Checklist teknis belum lengkap'; end if;
   else raise exception 'Jenis checklist tidak valid'; end if;
   insert into public.live_checks(session_id,location_id,kind,submitted_by,answers,note,actual_start,actual_end) values(s.id,loc,p_payload->>'kind',actor.id,p_payload->'answers',coalesce(p_payload->>'note',''),case when p_payload->>'kind'='host' then (p_payload->>'actual_start')::timestamptz end,case when p_payload->>'kind'='host' then (p_payload->>'actual_end')::timestamptz end) returning id into rid;
  end if;
 else raise exception 'Aksi tidak dikenal'; end if;
 perform private.audit(loc,'production.'||p_action,rid,jsonb_build_object('actor',actor.id));
 return jsonb_build_object('id',rid);
end $$;
revoke all on function private.production_manager(text),private.host_manager(text),private.host_available(uuid,text,date,integer,integer,uuid) from public,anon,authenticated;
revoke all on function public.production_snapshot(text,date,date),public.production_action(text,jsonb) from public,anon;
grant execute on function public.production_snapshot(text,date,date),public.production_action(text,jsonb) to authenticated;
commit;
