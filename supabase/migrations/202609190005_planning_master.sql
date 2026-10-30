begin;

insert into public.locations(id,name) values ('jakarta','Jakarta'),('bandung','Bandung')
on conflict(id) do update set name=excluded.name;
alter table public.production_quotations drop constraint if exists production_quotations_location_id_reference_key;
alter table public.production_quotations alter column location_id drop not null;
update public.production_quotations set location_id=null where location_id is not null;
create unique index if not exists production_quotations_reference_global_uidx on public.production_quotations(reference);

-- Commercial master. ST is a canonical Mirror/session key; TT/SP remain the
-- platform-specific keys used when joining the future Performance database.
create table if not exists public.production_brands (
 id uuid primary key default gen_random_uuid(),
 name text not null unique check(length(trim(name)) between 1 and 120),
 shop_id_tiktok text unique,
 shop_id_shopee text unique,
 shop_id_mirror text unique,
 active boolean not null default true,
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 check(shop_id_tiktok is null or shop_id_tiktok like 'TT%'),
 check(shop_id_shopee is null or shop_id_shopee like 'SP%'),
 check(shop_id_mirror is null or shop_id_mirror like 'ST%')
);
alter table public.production_brands enable row level security;
revoke all on public.production_brands from public,anon,authenticated;

alter table public.production_quotations drop constraint if exists production_quotations_platform_check;
alter table public.production_quotations add constraint production_quotations_platform_check check(platform in ('TikTok','Shopee','Mirror'));
alter table public.production_quotations add column if not exists brand_id uuid references public.production_brands(id);
alter table public.production_quotations add column if not exists best_hour_slots jsonb not null default '[]'::jsonb;

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
  'hosts',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'display_name',p.display_name,'active',p.active,'location_id',p.location_id) order by p.display_name) from public.profiles p where p.role='host' and (actor.role='super_admin' or (p.location_id=p_location and (private.production_manager(p_location) or p.id=actor.id)))),'[]'::jsonb),
  'availability',coalesce((select jsonb_agg(to_jsonb(a) order by a.work_date,a.hour,a.id) from public.host_availability a where a.work_date between p_start and p_end and (actor.role='super_admin' or (a.location_id=p_location and (private.production_manager(p_location) or a.host_id=actor.id)))),'[]'::jsonb),
  'leaves',coalesce((select jsonb_agg(to_jsonb(l) order by l.work_date,l.id) from public.host_leaves l where l.work_date between p_start and p_end and (actor.role='super_admin' or (l.location_id=p_location and (private.host_manager(p_location) or l.host_id=actor.id)))),'[]'::jsonb),
  'rates',coalesce((select jsonb_agg(to_jsonb(r) order by r.effective_date desc,r.id) from public.host_rates r where actor.role='super_admin' or (r.location_id=p_location and (private.host_manager(p_location) or r.host_id=actor.id))),'[]'::jsonb),
  'sessions',coalesce((select jsonb_agg(case when actor.role='super_admin' or private.host_manager(s.location_id) or s.host_id=actor.id then to_jsonb(s) else to_jsonb(s)-'host_fee' end order by s.work_date,s.start_hour,s.id) from public.live_sessions s where s.work_date between p_start and p_end and (actor.role='super_admin' or (s.location_id=p_location and (private.production_manager(p_location) or (s.status='published' and (actor.role<>'host' or s.host_id=actor.id)))))),'[]'::jsonb),
  'checks',coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at,c.id) from public.live_checks c join public.live_sessions s on s.id=c.session_id where s.work_date between p_start and p_end and (actor.role='super_admin' or (s.location_id=p_location and (private.production_manager(p_location) or (s.status='published' and (actor.role='staff' or s.host_id=actor.id)))))),'[]'::jsonb)
 ) into result;
 result:=result || jsonb_build_object('operator_logbook',coalesce((select jsonb_agg(to_jsonb(daily) order by daily.work_date) from (
  select a.work_date,count(*)::integer planned_hours,count(*) filter(where exists(select 1 from public.live_sessions s where s.location_id=p_location and s.work_date=a.work_date and s.status='published' and s.start_hour<=a.hour and s.end_hour>a.hour) and not exists(select 1 from public.live_sessions s where s.location_id=p_location and s.work_date=a.work_date and s.status='published' and s.start_hour<=a.hour and s.end_hour>a.hour and not exists(select 1 from public.live_checks c where c.session_id=s.id and c.kind='operator')))::integer eligible_hours
  from public.schedule_assignments a where actor.role='staff' and a.operator_id=actor.id and a.location_id=p_location and a.work_date between p_start and p_end and a.layer='published' and a.cancelled_at is null group by a.work_date
 ) daily),'[]'::jsonb));
 return result;
end $$;

create or replace function public.production_action_v2(p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.profiles; loc text; q public.production_quotations; st public.production_studios; s public.live_sessions; b public.production_brands;
 rid uuid; item jsonb; d date; hs integer; he integer; hid uuid; lane_value integer; used integer; made integer:=0; assigned integer:=0; target integer; host_ids uuid[]; day_value date; slot jsonb; account_value text;
begin
 select * into actor from public.profiles where id=auth.uid() and active;
 loc:=nullif(p_payload->>'location','');
 if actor.id is null then raise exception 'Akses ditolak' using errcode='42501'; end if;

 if p_action='master_brand' then
  if actor.role<>'super_admin' then raise exception 'Hanya Super Admin'; end if;
  insert into public.production_brands(name,shop_id_tiktok,shop_id_shopee,shop_id_mirror,created_by)
  values(trim(p_payload->>'name'),nullif(upper(trim(p_payload->>'tiktok')),''),nullif(upper(trim(p_payload->>'shopee')),''),nullif(upper(trim(p_payload->>'mirror')),''),actor.id) returning id into rid;
 elsif p_action='quotation' then
  if actor.role not in ('super_admin','admin_sales') then raise exception 'Hanya Admin Sales'; end if;
  select * into b from public.production_brands where id=(p_payload->>'brand')::uuid and active;
  if not found then raise exception 'Brand tidak valid'; end if;
  account_value:=case p_payload->>'platform' when 'TikTok' then b.shop_id_tiktok when 'Shopee' then b.shop_id_shopee when 'Mirror' then b.shop_id_mirror end;
  if account_value is null then raise exception 'Shop ID untuk platform tersebut belum diisi di Master Data'; end if;
  insert into public.production_quotations(brand_id,reference,brand,account,platform,period_start,period_end,hours,rate,best_hours,best_hour_slots,created_by)
  values(b.id,trim(p_payload->>'reference'),b.name,account_value,p_payload->>'platform',(p_payload->>'period_start')::date,(p_payload->>'period_end')::date,(p_payload->>'hours')::integer,(p_payload->>'rate')::numeric,'{}','[]',actor.id) returning id into rid;
 elsif p_action='best_hour_slots' then
  if actor.role not in ('super_admin','operator_manager','host_manager') then raise exception 'Hanya Manager'; end if;
  if jsonb_typeof(p_payload->'slots') is distinct from 'array' or jsonb_array_length(p_payload->'slots')<1 then raise exception 'Best hour wajib diisi'; end if;
  for item in select * from jsonb_array_elements(p_payload->'slots') loop
   hs:=(item->>'start')::integer;he:=(item->>'end')::integer;
   if hs<0 or hs>23 or he<1 or he>24 or he<=hs then raise exception 'Best hour tidak valid'; end if;
  end loop;
  update public.production_quotations set best_hour_slots=p_payload->'slots',best_hours=array(select distinct (x->>'start')::integer from jsonb_array_elements(p_payload->'slots') x) where id=(p_payload->>'quotation')::uuid returning id into rid;
  if rid is null then raise exception 'Quotation tidak ditemukan'; end if;
 elsif p_action in ('session_multi','auto_plot_blocks','auto_assign_hosts','edit_session') then
  if loc is null or (actor.role<>'super_admin' and (actor.role not in ('operator_manager','host_manager') or actor.location_id is distinct from loc)) then raise exception 'Akses lokasi ditolak'; end if;
  perform private.lock_location(loc);
  if p_action='edit_session' then
   select * into s from public.live_sessions where id=(p_payload->>'id')::uuid and status<>'cancelled';
   if not found or private.hour_start(s.work_date,s.start_hour)<=now() or exists(select 1 from public.live_checks where session_id=s.id) then raise exception 'Sesi tidak dapat diedit'; end if;
   select * into q from public.production_quotations where id=s.quotation_id;
   select * into st from public.production_studios where id=(p_payload->>'studio')::uuid and location_id=loc;
   if not found then raise exception 'Studio tidak valid untuk lokasi'; end if;
   hid:=nullif(p_payload->>'host','')::uuid;
   select n into lane_value from generate_series(1,st.capacity) n where not exists(select 1 from public.live_sessions x where x.id<>s.id and x.studio_id=st.id and x.lane=n and x.work_date=s.work_date and x.status<>'cancelled' and x.start_hour<s.end_hour and x.end_hour>s.start_hour) limit 1;
   if lane_value is null then raise exception 'Kapasitas studio penuh'; end if;
   if hid is not null and not private.host_available(hid,loc,s.work_date,s.start_hour,s.end_hour,s.id) then raise exception 'Host tidak available di lokasi/jam tersebut'; end if;
   if exists(select 1 from public.live_sessions x join public.production_quotations z on z.id=x.quotation_id where x.id<>s.id and x.status<>'cancelled' and z.account=q.account and z.platform=q.platform and x.work_date=s.work_date and x.start_hour<s.end_hour and x.end_hour>s.start_hour) then raise exception 'Akun toko bentrok'; end if;
   update public.live_sessions set location_id=loc,studio_id=st.id,lane=lane_value,host_id=hid,host_fee=null where id=s.id returning id into rid;
  else
   select * into q from public.production_quotations where id=(p_payload->>'quotation')::uuid;
   if not found then raise exception 'Quotation tidak valid'; end if;
   host_ids:=array(select value::uuid from jsonb_array_elements_text(coalesce(p_payload->'hosts','[]'::jsonb)));
   if p_action='auto_assign_hosts' then
    for s in select * from public.live_sessions where quotation_id=q.id and location_id=loc and status='draft' and host_id is null order by work_date,start_hour loop
     hid:=null;select h into hid from unnest(host_ids) with ordinality u(h,priority) where private.host_available(h,loc,s.work_date,s.start_hour,s.end_hour,s.id) order by priority limit 1;
     if hid is not null then update public.live_sessions set host_id=hid where id=s.id;assigned:=assigned+1;end if;
    end loop;
    return jsonb_build_object('assigned',assigned);
   end if;
   select * into st from public.production_studios where id=(p_payload->>'studio')::uuid and location_id=loc;
   if not found then raise exception 'Studio tidak valid untuk lokasi'; end if;
   select coalesce(sum(end_hour-start_hour),0) into used from public.live_sessions where quotation_id=q.id and status<>'cancelled';
   target:=q.hours-used;
   if target<=0 then return jsonb_build_object('created',0,'remaining',0); end if;
   if p_action='session_multi' then
    hs:=(p_payload->>'start')::integer;he:=(p_payload->>'end')::integer;
    for d in select value::date from jsonb_array_elements_text(p_payload->'dates') loop
     if d not between q.period_start and q.period_end or hs<0 or he>24 or he<=hs or private.hour_start(d,hs)<=now() then raise exception 'Pilih tanggal dan jam mendatang yang masih dalam periode quotation'; end if;
     if he-hs>target-made then raise exception 'Melebihi sisa kuota quotation'; end if;
     select n into lane_value from generate_series(1,st.capacity) n where not exists(select 1 from public.live_sessions x where x.studio_id=st.id and x.lane=n and x.work_date=d and x.status<>'cancelled' and x.start_hour<he and x.end_hour>hs) limit 1;
     if lane_value is null then raise exception 'Kapasitas studio penuh pada salah satu tanggal'; end if;
     if exists(select 1 from public.live_sessions x join public.production_quotations z on z.id=x.quotation_id where x.status<>'cancelled' and z.account=q.account and z.platform=q.platform and x.work_date=d and x.start_hour<he and x.end_hour>hs) then raise exception 'Akun toko bentrok pada salah satu tanggal'; end if;
     hid:=nullif(p_payload->>'host','')::uuid;if hid is not null and not private.host_available(hid,loc,d,hs,he) then raise exception 'Host tidak available pada salah satu tanggal'; end if;
     insert into public.live_sessions(location_id,quotation_id,studio_id,lane,work_date,start_hour,end_hour,host_id,created_by) values(loc,q.id,st.id,lane_value,d,hs,he,hid,actor.id);made:=made+he-hs;
    end loop;
   else
    if jsonb_array_length(q.best_hour_slots)=0 then raise exception 'Atur best hour terlebih dahulu'; end if;
    for day_value in select generate_series(greatest(q.period_start,(now() at time zone 'Asia/Jakarta')::date),q.period_end,interval '1 day')::date loop
     for slot in select * from jsonb_array_elements(q.best_hour_slots) loop
      hs:=(slot->>'start')::integer;he:=(slot->>'end')::integer;exit when made>=target;
      if he-hs>target-made or private.hour_start(day_value,hs)<=now() then continue; end if;
      if exists(select 1 from public.live_sessions x join public.production_quotations z on z.id=x.quotation_id where x.status<>'cancelled' and z.account=q.account and z.platform=q.platform and x.work_date=day_value and x.start_hour<he and x.end_hour>hs) then continue; end if;
      select n into lane_value from generate_series(1,st.capacity) n where not exists(select 1 from public.live_sessions x where x.studio_id=st.id and x.lane=n and x.work_date=day_value and x.status<>'cancelled' and x.start_hour<he and x.end_hour>hs) limit 1;
      if lane_value is null then continue; end if;
      hid:=null;select h into hid from unnest(host_ids) with ordinality u(h,priority) where private.host_available(h,loc,day_value,hs,he) order by priority limit 1;
      if cardinality(host_ids)>0 and hid is null then continue; end if;
      insert into public.live_sessions(location_id,quotation_id,studio_id,lane,work_date,start_hour,end_hour,host_id,created_by) values(loc,q.id,st.id,lane_value,day_value,hs,he,hid,actor.id);made:=made+he-hs;
     end loop;
     exit when made>=target;
    end loop;
   end if;
   return jsonb_build_object('created',made,'remaining',target-made);
  end if;
 else
  return public.production_action(p_action,p_payload);
 end if;
 perform private.audit(loc,'production.'||p_action,rid,jsonb_build_object('actor',actor.id));
 return jsonb_build_object('id',rid);
end $$;

revoke all on function public.production_snapshot_v2(text,date,date),public.production_action_v2(text,jsonb) from public,anon;
grant execute on function public.production_snapshot_v2(text,date,date),public.production_action_v2(text,jsonb) to authenticated;
commit;
