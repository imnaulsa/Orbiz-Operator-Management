begin;
-- Publish the schedule independently from confirmed host assignments.
alter table public.live_sessions add column host_published boolean not null default false;
update public.live_sessions set host_published=true where status='published' and host_id is not null;
create table public.live_session_edits (
 session_id uuid primary key references public.live_sessions(id) on delete cascade,
 location_id text not null references public.locations(id),
 studio_id uuid not null references public.production_studios(id),
 host_id uuid references public.profiles(id),
 version uuid not null default gen_random_uuid(),
 updated_by uuid not null references public.profiles(id),
 updated_at timestamptz not null default now()
);
alter table public.live_session_edits enable row level security;
revoke all on public.live_session_edits from public,anon,authenticated;
-- Internal legacy implementations remain available only to definer functions.
alter function public.production_action(text,jsonb) set schema private;
alter function public.production_action_v2(text,jsonb) set schema private;
alter function public.production_schedule_tools(text,jsonb) set schema private;
revoke all on function private.production_action(text,jsonb),private.production_action_v2(text,jsonb),private.production_schedule_tools(text,jsonb) from public,anon,authenticated;
create or replace function public.production_snapshot_v2(p_location text,p_start date,p_end date) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.profiles; result jsonb; global_scope boolean;
begin
 select * into actor from public.profiles where id=auth.uid() and active;
 global_scope:=p_location is null;
 if actor.id is null or (global_scope and actor.role not in ('super_admin','admin_sales')) or (not global_scope and actor.role<>'super_admin' and actor.location_id is distinct from p_location) then raise exception 'Akses ditolak' using errcode='42501'; end if;
 if p_start is null or p_end is null or p_end<p_start or p_end-p_start>366 then raise exception 'Rentang maksimal 367 hari'; end if;
 select jsonb_build_object(
  'brands',coalesce((select jsonb_agg(to_jsonb(b) order by b.name) from public.production_brands b where b.active or actor.role='super_admin'),'[]'::jsonb),
  'studios',coalesce((select jsonb_agg(to_jsonb(s) order by s.location_id,s.name) from public.production_studios s where global_scope or s.location_id=p_location),'[]'::jsonb),
  'quotations',coalesce((select jsonb_agg(case when actor.role in ('super_admin','admin_sales') then to_jsonb(q) else to_jsonb(q)-'rate' end || jsonb_build_object('allocated_hours',(select coalesce(sum(x.end_hour-x.start_hour),0) from public.live_sessions x where x.quotation_id=q.id and x.status<>'cancelled')) order by q.period_start,q.reference) from public.production_quotations q where q.period_end>=p_start and q.period_start<=p_end),'[]'::jsonb),
  'hosts',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'display_name',p.display_name,'active',p.active,'location_id',p.location_id) order by p.display_name) from public.profiles p where p.role='host' and (actor.role='super_admin' or (p.location_id=p_location ))),'[]'::jsonb),
  'availability',coalesce((select jsonb_agg(to_jsonb(a) order by a.work_date,a.hour,a.id) from public.host_availability a where a.work_date between p_start and p_end and (actor.role='super_admin' or (a.location_id=p_location and (private.production_manager(p_location) or a.host_id=actor.id)))),'[]'::jsonb),
  'leaves',coalesce((select jsonb_agg(to_jsonb(l) order by l.work_date,l.id) from public.host_leaves l where l.work_date between p_start and p_end and (actor.role='super_admin' or (l.location_id=p_location and (private.host_manager(p_location) or l.host_id=actor.id)))),'[]'::jsonb),
  'rates',coalesce((select jsonb_agg(to_jsonb(r) order by r.effective_date desc,r.id) from public.host_rates r where actor.role='super_admin' or (r.location_id=p_location and (private.host_manager(p_location) or r.host_id=actor.id))),'[]'::jsonb),
  'sessions',coalesce((select jsonb_agg(case when private.production_manager(s.location_id) then
    (case when private.host_manager(s.location_id) then to_jsonb(s) else to_jsonb(s)-'host_fee' end)
    || case when e.session_id is not null then jsonb_build_object('location_id',e.location_id,'studio_id',e.studio_id,'host_id',e.host_id,'host_fee',null,'host_published',false,'has_pending',true,'edit_version',e.version) else jsonb_build_object('has_pending',false) end
   else (case when s.host_published and s.host_id=actor.id then to_jsonb(s) else to_jsonb(s)-'host_fee' end)
    || case when not s.host_published then jsonb_build_object('host_id',null,'host_fee',null) else '{}'::jsonb end end order by s.work_date,s.start_hour,s.id) from public.live_sessions s left join public.live_session_edits e on e.session_id=s.id where s.work_date between p_start and p_end and (actor.role='super_admin' or (s.location_id=p_location and (private.production_manager(p_location) or s.status='published')))),'[]'::jsonb),
  'checks',coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at,c.id) from public.live_checks c join public.live_sessions s on s.id=c.session_id where s.work_date between p_start and p_end and (actor.role='super_admin' or (s.location_id=p_location and (private.production_manager(p_location) or (s.status='published' and (actor.role='staff' or s.host_id=actor.id)))))),'[]'::jsonb)
 ) into result;
 result:=result || jsonb_build_object('published_sessions',coalesce((select jsonb_agg(case when private.host_manager(x.location_id) or x.host_id=actor.id then to_jsonb(x) else to_jsonb(x)-'host_fee' end order by x.work_date,x.start_hour,x.id) from public.live_sessions x where x.status='published' and x.host_published and x.work_date between p_start and p_end and (actor.role='super_admin' or (x.location_id=p_location and (private.production_manager(p_location) or x.host_id=actor.id)))),'[]'::jsonb));
 result:=result || jsonb_build_object('operator_logbook',coalesce((select jsonb_agg(to_jsonb(daily) order by daily.work_date) from (
  select a.work_date,count(*)::integer planned_hours,count(*) filter(where exists(select 1 from public.live_sessions s where s.location_id=p_location and s.work_date=a.work_date and s.status='published' and s.start_hour<=a.hour and s.end_hour>a.hour) and not exists(select 1 from public.live_sessions s where s.location_id=p_location and s.work_date=a.work_date and s.status='published' and s.start_hour<=a.hour and s.end_hour>a.hour and not exists(select 1 from public.live_checks c where c.session_id=s.id and c.kind='operator')))::integer eligible_hours
  from public.schedule_assignments a where actor.role='staff' and a.operator_id=actor.id and a.location_id=p_location and a.work_date between p_start and p_end and a.layer='published' and a.cancelled_at is null group by a.work_date
 ) daily),'[]'::jsonb));
 return result;
end $$;

create or replace function public.production_schedule_tools(p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.profiles; s public.live_sessions; e public.live_session_edits;
 st public.production_studios; ids uuid[]; loc text; hid uuid; fee numeric; n integer:=0; result jsonb;
begin
 select * into actor from public.profiles where id=auth.uid() and active;
 if actor.id is null or actor.role not in ('super_admin','operator_manager','host_manager') then raise exception 'Hanya Manager' using errcode='42501'; end if;
 for loc in select id from public.locations order by id loop perform private.lock_location(loc); end loop;
 lock table public.production_brands,public.production_studios,public.production_quotations,public.live_sessions,public.live_checks,public.live_session_edits in share row exclusive mode;
 if p_action='schedule_import' then return private.production_schedule_tools(p_action,p_payload); end if;
 if p_action='schedule_edit' then
  select * into s from public.live_sessions where id=(p_payload->>'id')::uuid;
  if not found or not private.production_manager(s.location_id) then raise exception 'Sesi tidak ditemukan / di luar akses Anda' using errcode='42501'; end if;
  if s.status='cancelled' or private.hour_start(s.work_date,s.start_hour)<=now() or exists(select 1 from public.live_checks where session_id=s.id) then raise exception 'Sesi sudah berjalan/tercatat; tidak dapat diedit'; end if;
  loc:=p_payload->>'location';hid:=nullif(p_payload->>'host','')::uuid;
  if loc is null or not private.production_manager(loc) then raise exception 'Akses lokasi ditolak' using errcode='42501'; end if;
  select * into st from public.production_studios where id=(p_payload->>'studio')::uuid and location_id=loc;
  if not found then raise exception 'Studio tidak valid untuk lokasi'; end if;
  if hid is not null and not exists(select 1 from public.profiles where id=hid and role='host' and active and location_id=loc) then raise exception 'Host tidak valid untuk lokasi'; end if;
  -- Save only the proposal. The published placement, fee and assignment stay intact.
  insert into public.live_session_edits(session_id,location_id,studio_id,host_id,updated_by)
  values(s.id,loc,st.id,hid,actor.id)
  on conflict(session_id) do update set location_id=excluded.location_id,studio_id=excluded.studio_id,host_id=excluded.host_id,updated_by=excluded.updated_by,version=gen_random_uuid(),updated_at=now();
  perform private.audit(s.location_id,'production.schedule_edit_pending',s.id,p_payload);
  return jsonb_build_object('id',s.id,'pending',true);
 end if;
 if p_action not in ('schedule_publish','host_publish') then raise exception 'Aksi tidak valid'; end if;
 if jsonb_typeof(p_payload->'ids') is distinct from 'array' or jsonb_array_length(p_payload->'ids') not between 1 and 1000 then raise exception 'Pilih 1–1000 jadwal'; end if;
 select array_agg(distinct value::uuid) into ids from jsonb_array_elements_text(p_payload->'ids');
 if (select count(*) from public.live_sessions where id=any(ids))<>cardinality(ids) then raise exception 'Jadwal berubah/dihapus. Refresh terlebih dahulu.'; end if;
 if exists(select 1 from public.live_sessions where id=any(ids) and not private.production_manager(location_id)) then raise exception 'Akses lokasi ditolak' using errcode='42501'; end if;
 for s in select * from public.live_sessions where id=any(ids) order by location_id,work_date,start_hour,id loop
  select * into e from public.live_session_edits where session_id=s.id;
  if s.status='published' and e.session_id is null and (p_action='schedule_publish' or s.host_published) then continue; end if;
  begin
   if s.status='cancelled' or private.hour_start(s.work_date,s.start_hour)<=now() or exists(select 1 from public.live_checks where session_id=s.id) then raise exception 'Sesi dibatalkan/sudah berjalan/tercatat'; end if;
   if p_action='host_publish' and s.status<>'published' then raise exception 'Publish jadwal terlebih dahulu'; end if;
   if e.session_id is not null then
    if not private.production_manager(e.location_id) then raise exception 'Akses lokasi tujuan ditolak'; end if;
    if p_payload ? 'versions' and (p_payload->'versions'->>s.id::text) is distinct from e.version::text then raise exception 'Perubahan diperbarui manager lain. Refresh dan review ulang.'; end if;
    -- Revalidate studio capacity, brand collision and approved availability at publication.
    perform private.production_action_v2('edit_session',jsonb_build_object('id',s.id,'location',e.location_id,'studio',e.studio_id,'host',e.host_id));
    select * into s from public.live_sessions where id=s.id;
   end if;
   if p_action='host_publish' or e.session_id is not null then
    fee:=null;
    if s.host_id is not null then
     if not private.host_available(s.host_id,s.location_id,s.work_date,s.start_hour,s.end_hour,s.id) then raise exception 'Host belum approved / bentrok / izin'; end if;
     select hourly_fee into fee from public.host_rates where host_id=s.host_id and effective_date<=s.work_date order by effective_date desc limit 1;
     if fee is null then raise exception 'Rate host belum tersedia'; end if;
    elsif p_action='host_publish' then raise exception 'Pilih host sebelum Publish Host';
    end if;
    update public.live_sessions set status='published',host_published=(host_id is not null),host_fee=fee where id=s.id;
   else
    -- First publish needs neither an operator shift nor a confirmed host.
    update public.live_sessions set status='published',host_published=false,host_fee=null where id=s.id;
   end if;
   delete from public.live_session_edits where session_id=s.id;
   perform private.audit(s.location_id,'production.'||p_action,s.id,jsonb_build_object('host',s.host_id));
   n:=n+1;
  exception when others then raise exception 'Publish dibatalkan. Sesi % %:00 (%): %',s.work_date,s.start_hour,s.id,sqlerrm;
  end;
 end loop;
 return jsonb_build_object('published',n);
end $$;

-- Unconfirmed host placements must not prevent a manager setting the first rate.
do $migration$
declare definition text;
begin
 select pg_get_functiondef('private.production_action(text,jsonb)'::regprocedure) into definition;
 definition:=replace(definition, 'host_id=hid and status=''published'' and work_date>=d', 'host_id=hid and status=''published'' and host_published and work_date>=d');
 execute definition;
end $migration$;

create or replace function public.production_action(p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.live_sessions; result jsonb;
begin
 if p_action='publish' then return public.production_schedule_tools('schedule_publish',jsonb_build_object('ids',jsonb_build_array(p_payload->>'id'))); end if;
 if p_action='assign_host' then
  select * into s from public.live_sessions where id=(p_payload->>'id')::uuid;
  return public.production_schedule_tools('schedule_edit',jsonb_build_object('id',s.id,'location',s.location_id,'studio',s.studio_id,'host',p_payload->>'host'));
 end if;
 if p_action='check' and p_payload->>'kind'='host' then
  select * into s from public.live_sessions where id=(p_payload->>'id')::uuid;
  if not coalesce(s.host_published,false) then raise exception 'Penugasan host belum dipublish'; end if;
 end if;
 result:=private.production_action(p_action,p_payload);
 if p_action='cancel' then delete from public.live_session_edits where session_id=(p_payload->>'id')::uuid; end if;
 return result;
end $$;

create or replace function public.production_action_v2(p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.profiles; s public.live_sessions; loc text; hid uuid; host_ids uuid[]; n integer:=0;
begin
 if p_action in ('edit_session','schedule_edit') then return public.production_schedule_tools('schedule_edit',p_payload); end if;
 if p_action in ('publish','assign_host','check','cancel') then return public.production_action(p_action,p_payload); end if;
 if p_action='auto_assign_hosts' then
  select * into actor from public.profiles where id=auth.uid() and active;
  loc:=p_payload->>'location';
  if actor.id is null or loc is null or not private.production_manager(loc) then raise exception 'Akses lokasi ditolak' using errcode='42501'; end if;
  -- Same lock order as schedule tools, including when called inside this loop.
  for loc in select id from public.locations order by id loop perform private.lock_location(loc); end loop;
  loc:=p_payload->>'location';
  host_ids:=array(select value::uuid from jsonb_array_elements_text(coalesce(p_payload->'hosts','[]')));
  for s in select x.* from public.live_sessions x where x.location_id=loc and x.quotation_id=(p_payload->>'quotation')::uuid and x.status<>'cancelled' and x.host_id is null and not exists(select 1 from public.live_session_edits e where e.session_id=x.id) and private.hour_start(x.work_date,x.start_hour)>now() order by x.work_date,x.start_hour loop
   select h into hid from unnest(host_ids) with ordinality u(h,priority)
   where private.host_available(h,loc,s.work_date,s.start_hour,s.end_hour,s.id)
    and not exists(select 1 from public.live_session_edits e join public.live_sessions x on x.id=e.session_id where e.host_id=h and x.work_date=s.work_date and x.status<>'cancelled' and x.start_hour<s.end_hour and x.end_hour>s.start_hour)
   order by priority limit 1;
   if hid is not null then
    perform public.production_schedule_tools('schedule_edit',jsonb_build_object('id',s.id,'location',loc,'studio',s.studio_id,'host',hid));n:=n+1;
   end if;
  end loop;
  return jsonb_build_object('assigned',n);
 end if;
 return private.production_action_v2(p_action,p_payload);
end $$;

-- Legacy readers receive the same published-only staff view.
create or replace function public.production_snapshot(p_location text,p_start date,p_end date)
returns jsonb language sql stable security definer set search_path='' as $$
 select public.production_snapshot_v2(p_location,p_start,p_end)
$$;
revoke all on function public.production_schedule_tools(text,jsonb),public.production_action(text,jsonb),public.production_action_v2(text,jsonb),public.production_snapshot(text,date,date) from public,anon;
grant execute on function public.production_schedule_tools(text,jsonb),public.production_action(text,jsonb),public.production_action_v2(text,jsonb),public.production_snapshot(text,date,date) to authenticated;
commit;
