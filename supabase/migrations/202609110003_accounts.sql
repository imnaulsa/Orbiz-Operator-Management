begin;
create function public.manage_account(p_id uuid,p_name text,p_role public.app_role,p_location text,p_employment public.employment_type,p_active boolean,p_initial_fee numeric default null,p_effective date default null) returns void language plpgsql security definer set search_path='' as $$
declare existing public.profiles; loc text;
begin
 -- Same lock order for account changes spanning ecosystems.
 perform 1 from public.locations order by id for update;
 if not private.can_manage(p_location) then raise exception 'Akses ditolak' using errcode='42501'; end if;
 select * into existing from public.profiles where id=p_id for update;
 if not private.is_super() and (p_role<>'staff' or (existing.id is not null and (existing.role<>'staff' or existing.location_id is distinct from p_location))) then raise exception 'Manager hanya dapat mengelola staff lokasi sendiri' using errcode='42501'; end if;
 if p_id=auth.uid() and (p_role is distinct from existing.role or p_location is distinct from existing.location_id or not p_active) then raise exception 'Tidak dapat menonaktifkan/mengubah akses sendiri'; end if;
 if existing.id is not null and existing.location_id is distinct from p_location then
  if exists(select 1 from public.schedule_assignments where operator_id=p_id) or exists(select 1 from public.availability_submissions where operator_id=p_id) or exists(select 1 from public.operator_rates where operator_id=p_id) or exists(select 1 from public.leave_requests where operator_id=p_id) then raise exception 'Transfer lokasi dengan histori memerlukan proses migrasi terpisah'; end if;
 end if;
 if existing.id is not null and existing.role='staff' and p_role<>'staff' and exists(select 1 from public.schedule_assignments where operator_id=p_id and cancelled_at is null and work_date>=(now() at time zone 'Asia/Jakarta')::date) then raise exception 'Batalkan jadwal aktif sebelum mengganti role'; end if;
 insert into public.profiles(id,display_name,role,location_id,employment_type,active) values(p_id,p_name,p_role,p_location,p_employment,p_active)
 on conflict(id) do update set display_name=excluded.display_name,role=excluded.role,location_id=excluded.location_id,employment_type=excluded.employment_type,active=excluded.active;
 if existing.id is null and p_role='staff' then
  if p_initial_fee is null or p_effective is null then raise exception 'Fee awal dan effective date wajib'; end if;
  insert into public.operator_rates(operator_id,location_id,effective_date,hourly_fee,created_by) values(p_id,p_location,p_effective,p_initial_fee,auth.uid());
  perform private.audit(p_location,'rate.create',p_id,jsonb_build_object('fee',p_initial_fee,'effective_date',p_effective));
 end if;
 if not p_active then
  update public.schedule_assignments set cancelled_at=now(),cancelled_by=auth.uid(),cancellation_reason='account_inactive'
  where operator_id=p_id and cancelled_at is null and work_date>=(now() at time zone 'Asia/Jakarta')::date;
 end if;
 perform private.audit(p_location,'account.manage',p_id,jsonb_build_object('previous',to_jsonb(existing),'role',p_role,'active',p_active,'name',p_name,'employment',p_employment));
end $$;
create function public.add_operator_rate(p_operator uuid,p_effective date,p_fee numeric) returns uuid language plpgsql security definer set search_path='' as $$
declare loc text; rid uuid;
begin
 select location_id into loc from public.profiles where id=p_operator and role='staff';
 if not found then raise exception 'Operator tidak ditemukan'; end if;
 perform private.require_manager(loc);
 if p_effective is null or p_effective<(now() at time zone 'Asia/Jakarta')::date then raise exception 'Effective date perubahan fee tidak boleh mundur'; end if;
 -- Never change fees for dates already published, including a later republish.
 if exists(select 1 from public.schedule_assignments where operator_id=p_operator and layer='published' and work_date>=p_effective) then raise exception 'Tanggal ini atau sesudahnya sudah pernah dipublikasikan. Pilih effective date setelah jadwal published terakhir'; end if;
 insert into public.operator_rates(operator_id,location_id,effective_date,hourly_fee,created_by) values(p_operator,loc,p_effective,p_fee,auth.uid()) returning id into rid;
 perform private.audit(loc,'rate.create',rid,jsonb_build_object('operator',p_operator,'effective_date',p_effective,'fee',p_fee));
 return rid;
end $$;
create function private.immutable_rate() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Rate history is append-only'; end $$;
create trigger rate_immutable before update or delete on public.operator_rates for each row execute function private.immutable_rate();
revoke all on function private.immutable_rate() from public,anon,authenticated;
revoke all on function public.manage_account(uuid,text,public.app_role,text,public.employment_type,boolean,numeric,date),public.add_operator_rate(uuid,date,numeric) from public,anon;
grant execute on function public.manage_account(uuid,text,public.app_role,text,public.employment_type,boolean,numeric,date),public.add_operator_rate(uuid,date,numeric) to authenticated;
commit;
