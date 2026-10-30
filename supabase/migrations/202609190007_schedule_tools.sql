begin;
create or replace function public.production_schedule_tools(p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.profiles; q public.production_quotations; st public.production_studios; s public.live_sessions;
 item jsonb; ids uuid[]; host_ids uuid[]; hid uuid; loc text; d date; hs integer; he integer;
 n integer:=0; row_number integer; result jsonb;
begin
 select * into actor from public.profiles where id=auth.uid() and active;
 if actor.id is null or actor.role not in ('super_admin','operator_manager','host_manager') then raise exception 'Hanya Manager' using errcode='42501'; end if;
 if p_action not in ('schedule_import','schedule_publish','schedule_edit') then raise exception 'Aksi tidak valid'; end if;
 -- Match the existing writer lock order. Batches span both studios/cities.
 for loc in select id from public.locations order by id loop perform private.lock_location(loc); end loop;
 lock table public.production_brands,public.production_studios,public.production_quotations,public.live_sessions,public.live_checks in share row exclusive mode;
 if p_action='schedule_import' then
  if jsonb_typeof(p_payload->'rows') is distinct from 'array' or jsonb_array_length(p_payload->'rows') not between 1 and 500 then raise exception 'Import memerlukan 1–500 baris'; end if;
  for item in select * from jsonb_array_elements(p_payload->'rows') loop
   row_number:=coalesce((item->>'row')::integer,n+2);
   begin
    loc:=lower(trim(item->>'location'));
    if loc is null or not private.production_manager(loc) or not exists(select 1 from public.locations where id=loc) then raise exception 'Lokasi tidak valid / di luar akses Anda'; end if;
    select * into q from public.production_quotations where reference=trim(item->>'quotation');
    if not found then raise exception 'Nomor quotation tidak ditemukan'; end if;
    if lower(trim(item->>'brand')) is distinct from lower(q.brand) or lower(trim(item->>'platform')) is distinct from lower(q.platform) then raise exception 'Brand/platform tidak cocok dengan quotation'; end if;
    select * into st from public.production_studios where location_id=loc and name=trim(item->>'studio');
    if not found then raise exception 'Studio tidak ditemukan di lokasi tersebut'; end if;
    d:=(item->>'date')::date;hs:=(item->>'start')::integer;he:=(item->>'end')::integer;
    if d is null or hs is null or he is null or hs not between 0 and 23 or he not between 1 and 24 or he<=hs then raise exception 'Tanggal/jam tidak valid'; end if;
    if (select coalesce(sum(end_hour-start_hour),0) from public.live_sessions where quotation_id=q.id and status<>'cancelled')+he-hs>q.hours then raise exception 'Melebihi sisa kuota quotation'; end if;
    hid:=null;
    if nullif(trim(item->>'host_id'),'') is not null then
     select id into hid from public.profiles where id=(item->>'host_id')::uuid and role='host' and active and location_id=loc;
     if hid is null then raise exception 'Host ID tidak valid untuk lokasi'; end if;
     if nullif(trim(item->>'host'),'') is not null and not exists(select 1 from public.profiles where id=hid and display_name=trim(item->>'host')) then raise exception 'Nama host tidak cocok dengan Host ID'; end if;
    elsif nullif(trim(item->>'host'),'') is not null then
     select array_agg(id) into host_ids from public.profiles where role='host' and active and location_id=loc and display_name=trim(item->>'host');
     if coalesce(cardinality(host_ids),0)<>1 then raise exception 'Nama host tidak ditemukan atau duplikat. Gunakan Host ID dari export.'; end if;
     hid:=host_ids[1];
    end if;
    result:=public.production_action_v2('session_multi',jsonb_build_object('location',loc,'quotation',q.id,'studio',st.id,'dates',jsonb_build_array(d),'start',hs,'end',he,'host',hid));
    if (result->>'created')::integer is distinct from he-hs then raise exception 'Sesi gagal dibuat'; end if;
    n:=n+1;
   exception when others then raise exception 'Baris %: %',row_number,sqlerrm;
   end;
  end loop;
  perform private.audit(null,'production.schedule_import',null,jsonb_build_object('imported',n));
  return jsonb_build_object('imported',n);
 elsif p_action='schedule_publish' then
  if jsonb_typeof(p_payload->'ids') is distinct from 'array' or jsonb_array_length(p_payload->'ids') not between 1 and 1000 then raise exception 'Pilih 1–1000 jadwal draft'; end if;
  select array_agg(distinct value::uuid) into ids from jsonb_array_elements_text(p_payload->'ids');
  if (select count(*) from public.live_sessions where id=any(ids))<>cardinality(ids) then raise exception 'Jadwal berubah/dihapus. Refresh terlebih dahulu.'; end if;
  if exists(select 1 from public.live_sessions where id=any(ids) and not private.production_manager(location_id)) then raise exception 'Akses lokasi ditolak' using errcode='42501'; end if;
  for s in select * from public.live_sessions where id=any(ids) order by location_id,work_date,start_hour,id loop
   if s.status='published' then continue; end if;
   begin
    perform public.production_action('publish',jsonb_build_object('location',s.location_id,'id',s.id));n:=n+1;
   exception when others then
    raise exception 'Publish dibatalkan. Sesi % %:00 (%): %',s.work_date,s.start_hour,s.id,sqlerrm;
   end;
  end loop;
  return jsonb_build_object('published',n);
 else
  select * into s from public.live_sessions where id=(p_payload->>'id')::uuid;
  if not found or not private.production_manager(s.location_id) then raise exception 'Sesi tidak ditemukan / di luar akses Anda' using errcode='42501'; end if;
  result:=public.production_action_v2('edit_session',p_payload);
  if s.status='published' then
   update public.live_sessions set status='draft' where id=s.id;
   perform public.production_action('publish',jsonb_build_object('id',s.id,'location',p_payload->>'location'));
  end if;
  return result;
 end if;
end $$;
revoke all on function public.production_schedule_tools(text,jsonb) from public,anon;
grant execute on function public.production_schedule_tools(text,jsonb) to authenticated;
commit;
