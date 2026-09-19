begin;
-- Preserve existing operator account behavior behind a guarded dispatcher.
alter function public.manage_account(uuid,text,public.app_role,text,public.employment_type,boolean,numeric,date) set schema private;
alter function private.manage_account(uuid,text,public.app_role,text,public.employment_type,boolean,numeric,date) rename to manage_operator_account;
revoke all on function private.manage_operator_account(uuid,text,public.app_role,text,public.employment_type,boolean,numeric,date) from public,anon,authenticated;
create function public.manage_account(p_id uuid,p_name text,p_role public.app_role,p_location text,p_employment public.employment_type,p_active boolean,p_initial_fee numeric default null,p_effective date default null) returns void language plpgsql security definer set search_path='' as $$
declare actor public.profiles; existing public.profiles;
begin
 perform 1 from public.locations order by id for update;
 select * into actor from public.profiles where id=auth.uid() and active;
 select * into existing from public.profiles where id=p_id;
 if actor.id is null then raise exception 'Akses ditolak' using errcode='42501'; end if;
 if existing.id is not null and (existing.role is distinct from p_role or existing.location_id is distinct from p_location) and
 (exists(select 1 from public.host_availability where host_id=p_id) or exists(select 1 from public.host_rates where host_id=p_id) or exists(select 1 from public.live_sessions where host_id=p_id) or exists(select 1 from public.host_leaves where host_id=p_id)) then raise exception 'Akun dengan histori host tidak dapat dipindah role/lokasi'; end if;
 if p_role in ('staff','operator_manager','super_admin') then
  perform private.manage_operator_account(p_id,p_name,p_role,p_location,p_employment,p_active,p_initial_fee,p_effective); return;
 end if;
 if actor.role<>'super_admin' and not(actor.role='host_manager' and p_role='host' and p_location=actor.location_id and (existing.id is null or (existing.role='host' and existing.location_id=actor.location_id))) then raise exception 'Akses role/lokasi ditolak' using errcode='42501'; end if;
 if existing.id is not null and existing.role not in ('host','host_manager','admin_sales') then raise exception 'Migrasi akun operator ke role production perlu proses terpisah'; end if;
 if p_id=auth.uid() and (p_role is distinct from existing.role or p_location is distinct from existing.location_id or not p_active) then raise exception 'Tidak dapat mengubah akses sendiri'; end if;
 if not p_active and exists(select 1 from public.live_sessions where host_id=p_id and status<>'cancelled' and private.hour_start(work_date,end_hour)>now()) then raise exception 'Ganti host/batalkan sesi aktif sebelum menonaktifkan akun'; end if;
 insert into public.profiles(id,display_name,role,location_id,employment_type,active) values(p_id,p_name,p_role,p_location,p_employment,p_active)
 on conflict(id) do update set display_name=excluded.display_name,role=excluded.role,location_id=excluded.location_id,employment_type=excluded.employment_type,active=excluded.active;
 if existing.id is null and p_role='host' then
  if p_initial_fee is null or p_effective is null then raise exception 'Fee dan effective date host wajib'; end if;
  insert into public.host_rates(host_id,location_id,effective_date,hourly_fee,created_by) values(p_id,p_location,p_effective,p_initial_fee,auth.uid());
 end if;
 perform private.audit(p_location,'production.account',p_id,jsonb_build_object('role',p_role,'active',p_active));
end $$;
revoke all on function public.manage_account(uuid,text,public.app_role,text,public.employment_type,boolean,numeric,date) from public,anon;
grant execute on function public.manage_account(uuid,text,public.app_role,text,public.employment_type,boolean,numeric,date) to authenticated;
commit;
