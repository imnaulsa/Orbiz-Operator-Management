begin;
create function private.lock_location(loc text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.locations where id=loc for update;
 if not found then raise exception 'Lokasi tidak valid' using errcode='22023'; end if;
 if not private.is_active() then raise exception 'Akses ditolak' using errcode='42501'; end if;
end $$;
create function private.require_manager(loc text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.lock_location(loc);
 if not private.can_manage(loc) then raise exception 'Akses lokasi ditolak' using errcode='42501'; end if;
end $$;
create function private.audit(loc text,act text,entity uuid,info jsonb default '{}'::jsonb) returns void language sql security definer set search_path='' as $$
 insert into public.audit_logs(location_id,actor_id,action,entity_id,details) values(loc,auth.uid(),act,entity,info)
$$;
create function private.slot_problem(op uuid,loc text,d date,h integer) returns text language plpgsql stable security definer set search_path='' as $$
begin
 if h is null or h<0 or h>23 or d is null then return 'Jam/tanggal tidak valid'; end if;
 if not exists(select 1 from public.profiles where id=op and location_id=loc and role='staff' and active) then return 'Operator tidak aktif atau lokasi berbeda'; end if;
 if not exists(select 1 from public.availability_slots where operator_id=op and location_id=loc and work_date=d and hour=h and status='approved') then return 'Availability belum approved'; end if;
 if exists(select 1 from public.leave_requests where operator_id=op and status='approved' and
 starts_at<private.hour_start(d,h+1) and ends_at>private.hour_start(d,h)) then return 'Overlap izin approved'; end if;
 return null;
end $$;
create function private.validate_assignment() returns trigger language plpgsql security definer set search_path='' as $$
declare problem text;
begin
 if new.cancelled_at is not null then return new; end if;
 problem:=private.slot_problem(new.operator_id,new.location_id,new.work_date,new.hour);
 if problem is not null then raise exception '%',problem using errcode='23514'; end if;
 if new.layer='published' then
  if not exists(select 1 from public.schedule_publications p where p.id=new.publication_id and p.location_id=new.location_id and new.work_date between p.week_start and p.week_start+6) then raise exception 'Publication mismatch'; end if;
  if not exists(select 1 from public.operator_rates r where r.id=new.rate_id and r.operator_id=new.operator_id and r.location_id=new.location_id and r.effective_date<=new.work_date and r.hourly_fee=new.hourly_fee) then raise exception 'Rate mismatch'; end if;
 end if;
 return new;
end $$;
create trigger assignment_validation before insert or update on public.schedule_assignments for each row execute function private.validate_assignment();
create function private.audit_cancellation() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.cancelled_at is null and new.cancelled_at is not null then
 perform private.audit(new.location_id,'assignment.cancel',new.id,jsonb_build_object('operator_id',new.operator_id,'date',new.work_date,'hour',new.hour,'layer',new.layer,'reason',new.cancellation_reason));
 end if;
 return new;
end $$;
create trigger assignment_cancellation after update on public.schedule_assignments for each row execute function private.audit_cancellation();
create function public.submit_partial_availability(p_slots jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare loc text; submission uuid; cell jsonb; d date; h integer;
begin
 select location_id into loc from public.profiles where id=auth.uid() and active and role='staff';
 if not found then raise exception 'Hanya staff aktif' using errcode='42501'; end if;
 perform private.lock_location(loc);
 if jsonb_typeof(p_slots) is distinct from 'array' or jsonb_array_length(p_slots) not between 1 and 744 then raise exception 'Pilih 1–744 slot'; end if;
 insert into public.availability_submissions(operator_id,location_id) values(auth.uid(),loc) returning id into submission;
 for cell in select value from jsonb_array_elements(p_slots) loop
  d:=(cell->>'date')::date; h:=(cell->>'hour')::integer;
  if d<(now() at time zone 'Asia/Jakarta')::date then raise exception 'Tanggal sudah lewat'; end if;
  insert into public.availability_slots(submission_id,operator_id,location_id,work_date,hour) values(submission,auth.uid(),loc,d,h);
 end loop;
 perform private.audit(loc,'availability.submit',submission);
 return submission;
end $$;
create function public.review_availability_submission(p_id uuid,p_approve boolean,p_note text default '') returns void language plpgsql security definer set search_path='' as $$
declare item public.availability_submissions; new_status public.review_status;
begin
 select * into item from public.availability_submissions where id=p_id;
 if not found then raise exception 'Pengajuan tidak ditemukan'; end if;
 perform private.require_manager(item.location_id);
 select * into item from public.availability_submissions where id=p_id for update;
 if item.status<>'pending' or p_approve is null then raise exception 'Pengajuan sudah direview / keputusan tidak valid'; end if;
 if not p_approve and length(trim(p_note))=0 then raise exception 'Alasan penolakan wajib'; end if;
 new_status:=case when p_approve then 'approved'::public.review_status else 'rejected'::public.review_status end;
 update public.availability_submissions set status=new_status,reviewed_by=auth.uid(),reviewed_at=now(),review_note=p_note where id=p_id;
 update public.availability_slots set status=new_status where submission_id=p_id;
 perform private.audit(item.location_id,'availability.review',p_id,jsonb_build_object('status',new_status,'note',p_note));
end $$;
create function public.submit_leave_request(p_date date,p_start text,p_end text,p_type text,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare loc text; a timestamptz; b timestamptz; rid uuid;
begin
 select location_id into loc from public.profiles where id=auth.uid() and active and role='staff';
 if not found then raise exception 'Hanya staff aktif' using errcode='42501'; end if;
 perform private.lock_location(loc);
 if p_start !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or p_end !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$|^24:00$' then raise exception 'Format jam HH:MM'; end if;
 a:=(p_date+p_start::time) at time zone 'Asia/Jakarta'; b:=(p_date+p_end::time) at time zone 'Asia/Jakarta';
 if a is null or b is null or b<=a then raise exception 'Rentang wajib dalam satu tanggal; lintas tengah malam belum diaktifkan'; end if;
 if p_date<(now() at time zone 'Asia/Jakarta')::date then raise exception 'Tanggal sudah lewat'; end if;
 if exists(select 1 from public.leave_requests where operator_id=auth.uid() and status<>'rejected' and starts_at<b and ends_at>a) then raise exception 'Overlap pengajuan izin'; end if;
 insert into public.leave_requests(operator_id,location_id,starts_at,ends_at,leave_type,reason) values(auth.uid(),loc,a,b,p_type,p_reason) returning id into rid;
 perform private.audit(loc,'leave.submit',rid); return rid;
end $$;
create function public.review_leave_request(p_id uuid,p_approve boolean,p_note text default '') returns integer language plpgsql security definer set search_path='' as $$
declare item public.leave_requests; n integer; new_status public.review_status;
begin
 select * into item from public.leave_requests where id=p_id;
 if not found then raise exception 'Pengajuan tidak ditemukan'; end if;
 perform private.require_manager(item.location_id);
 select * into item from public.leave_requests where id=p_id for update;
 if item.status<>'pending' or p_approve is null then raise exception 'Pengajuan sudah direview / keputusan tidak valid'; end if;
 if not p_approve and length(trim(p_note))=0 then raise exception 'Alasan penolakan wajib'; end if;
 new_status:=case when p_approve then 'approved'::public.review_status else 'rejected'::public.review_status end;
 update public.leave_requests set status=new_status,reviewed_by=auth.uid(),reviewed_at=now(),review_note=p_note where id=p_id;
 n:=0;
 if p_approve then
  update public.schedule_assignments set cancelled_at=now(),cancelled_by=auth.uid(),cancellation_reason='leave:'||p_id
  where operator_id=item.operator_id and cancelled_at is null and
  private.hour_start(work_date,hour)<item.ends_at and private.hour_start(work_date,hour+1)>item.starts_at;
  get diagnostics n=row_count;
 end if;
 perform private.audit(item.location_id,'leave.review',p_id,jsonb_build_object('status',new_status,'cancelled_cells',n,'note',p_note));
 return n;
end $$;
create function public.upsert_operator_assignment(p_operator uuid,p_location text,p_date date,p_start integer,p_end integer,p_remove boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare h integer; problem text;
begin
 perform private.require_manager(p_location);
 if p_remove is null or p_date is null or p_start is null or p_end is null or p_start<0 or p_end>24 or p_start>=p_end then raise exception 'Rentang jam tidak valid'; end if;
 if not exists(select 1 from public.profiles where id=p_operator and location_id=p_location and role='staff') then raise exception 'Operator/lokasi tidak sesuai' using errcode='42501'; end if;
 if p_remove then
  update public.schedule_assignments set cancelled_at=now(),cancelled_by=auth.uid(),cancellation_reason='manager_remove'
  where operator_id=p_operator and location_id=p_location and work_date=p_date and hour>=p_start and hour<p_end and layer='draft' and cancelled_at is null;
 else
  for h in p_start..p_end-1 loop
   problem:=private.slot_problem(p_operator,p_location,p_date,h);
   if problem is not null then raise exception '%: %:00',problem,h; end if;
   insert into public.schedule_assignments(operator_id,location_id,work_date,hour,created_by)
   values(p_operator,p_location,p_date,h,auth.uid()) on conflict (operator_id,work_date,hour,layer) where cancelled_at is null do nothing;
  end loop;
 end if;
 perform private.audit(p_location,'assignment.edit',p_operator,jsonb_build_object('date',p_date,'start',p_start,'end',p_end,'remove',p_remove));
end $$;
create function public.copy_schedule_day(p_location text,p_source date,p_targets date[],p_mode text,p_preview boolean default true) returns jsonb language plpgsql security definer set search_path='' as $$
declare target date; cell record; problem text; skipped jsonb:='[]'; valid_count integer:=0; existing_count integer:=0;
begin
 perform private.require_manager(p_location);
 if p_source is null or p_preview is null or p_mode is null or p_mode not in ('merge','replace') or coalesce(cardinality(p_targets),0) not between 1 and 31 then raise exception 'Parameter copy tidak valid'; end if;
 if p_source=any(p_targets) or array_position(p_targets,null) is not null then raise exception 'Hari sumber tidak boleh menjadi tujuan'; end if;
 if not exists(select 1 from public.schedule_assignments where location_id=p_location and work_date=p_source and layer='draft' and cancelled_at is null) then raise exception 'Jadwal sumber kosong'; end if;
 for target in select distinct unnest(p_targets) order by 1 loop
  if p_mode='replace' and not p_preview then
   update public.schedule_assignments set cancelled_at=now(),cancelled_by=auth.uid(),cancellation_reason='copy_replace'
   where location_id=p_location and work_date=target and layer='draft' and cancelled_at is null;
  end if;
  for cell in select operator_id,hour from public.schedule_assignments where location_id=p_location and work_date=p_source and layer='draft' and cancelled_at is null order by operator_id,hour loop
   problem:=private.slot_problem(cell.operator_id,p_location,target,cell.hour);
   if problem is not null then
    skipped:=skipped||jsonb_build_array(jsonb_build_object('operator_id',cell.operator_id,'date',target,'hour',cell.hour,'reason',problem));
   elsif p_mode='merge' and exists(select 1 from public.schedule_assignments where operator_id=cell.operator_id and work_date=target and hour=cell.hour and layer='draft' and cancelled_at is null) then
    existing_count:=existing_count+1;
   else
    valid_count:=valid_count+1;
    if not p_preview then insert into public.schedule_assignments(operator_id,location_id,work_date,hour,created_by) values(cell.operator_id,p_location,target,cell.hour,auth.uid()); end if;
   end if;
  end loop;
 end loop;
 if not p_preview then perform private.audit(p_location,'schedule.copy',null,jsonb_build_object('source',p_source,'targets',p_targets,'mode',p_mode,'valid',valid_count,'skipped',skipped)); end if;
 return jsonb_build_object('valid',valid_count,'existing',existing_count,'skipped',skipped,'preview',p_preview);
end $$;
create function public.publish_schedule_week(p_location text,p_week date) returns uuid language plpgsql security definer set search_path='' as $$
declare pub uuid; v integer; cell record; rate public.operator_rates; problem text;
begin
 perform private.require_manager(p_location);
 if p_week is null or extract(isodow from p_week)<>1 then raise exception 'Pilih Senin awal minggu'; end if;
 -- Validate everything before replacing the visible snapshot. Exceptions roll back the batch.
 for cell in select * from public.schedule_assignments where location_id=p_location and work_date between p_week and p_week+6 and layer='draft' and cancelled_at is null loop
  problem:=private.slot_problem(cell.operator_id,p_location,cell.work_date,cell.hour);
  if problem is not null then raise exception '%',problem; end if;
  if not exists(select 1 from public.operator_rates where operator_id=cell.operator_id and effective_date<=cell.work_date) then raise exception 'Fee belum tersedia pada tanggal assignment'; end if;
 end loop;
 select coalesce(max(version),0)+1 into v from public.schedule_publications where location_id=p_location and week_start=p_week;
 insert into public.schedule_publications(location_id,week_start,version,published_by) values(p_location,p_week,v,auth.uid()) returning id into pub;
 update public.schedule_assignments set cancelled_at=now(),cancelled_by=auth.uid(),cancellation_reason='superseded:'||pub
 where location_id=p_location and work_date between p_week and p_week+6 and layer='published' and cancelled_at is null;
 for cell in select * from public.schedule_assignments where location_id=p_location and work_date between p_week and p_week+6 and layer='draft' and cancelled_at is null loop
  select * into strict rate from public.operator_rates where operator_id=cell.operator_id and effective_date<=cell.work_date order by effective_date desc limit 1;
  insert into public.schedule_assignments(operator_id,location_id,work_date,hour,layer,publication_id,rate_id,hourly_fee,created_by)
  values(cell.operator_id,p_location,cell.work_date,cell.hour,'published',pub,rate.id,rate.hourly_fee,auth.uid());
 end loop;
 perform private.audit(p_location,'schedule.publish',pub,jsonb_build_object('week',p_week,'version',v));
 return pub;
end $$;
create function public.calculate_operator_cost(p_location text,p_start date,p_end date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.can_manage(p_location) or (p_location is null and not private.is_super()) then raise exception 'Akses ditolak' using errcode='42501'; end if;
 if p_start is null or p_end is null or p_end<p_start or p_end-p_start>366 then raise exception 'Rentang maksimal 367 hari'; end if;
 select coalesce(jsonb_agg(r),'[]') into result from (
  select a.operator_id,p.display_name,a.location_id,count(distinct a.work_date) working_days,count(*) total_hours,sum(a.hourly_fee) estimated_salary,
   jsonb_agg(distinct jsonb_build_object('rate_id',a.rate_id,'hourly_fee',a.hourly_fee)) applicable_rates
  from public.schedule_assignments a join public.profiles p on p.id=a.operator_id
  where a.layer='published' and a.cancelled_at is null and a.work_date between p_start and p_end and (p_location is null or a.location_id=p_location)
  group by a.operator_id,p.display_name,a.location_id order by p.display_name
 ) r;
 return result;
end $$;
-- Limited exception to staff privacy: names only, only while sharing a published hour.
create function public.get_overlapping_colleagues(p_start date,p_end date) returns table(work_date date,hour smallint,display_name text) language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_active() then raise exception 'Akses ditolak' using errcode='42501'; end if;
 if p_start is null or p_end is null or p_end<p_start or p_end-p_start>366 then raise exception 'Rentang tidak valid'; end if;
 return query select distinct other.work_date,other.hour,p.display_name
 from public.schedule_assignments own join public.schedule_assignments other on other.location_id=own.location_id and other.work_date=own.work_date and other.hour=own.hour
 join public.profiles p on p.id=other.operator_id
 where own.operator_id=auth.uid() and other.operator_id<>auth.uid() and own.layer='published' and other.layer='published'
 and own.cancelled_at is null and other.cancelled_at is null and own.work_date between p_start and p_end;
end $$;
revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.is_active(),private.is_super(),private.can_manage(text),private.can_read_person(uuid,text) to authenticated;
revoke all on function public.submit_partial_availability(jsonb),public.review_availability_submission(uuid,boolean,text),
 public.submit_leave_request(date,text,text,text,text),public.review_leave_request(uuid,boolean,text),
 public.upsert_operator_assignment(uuid,text,date,integer,integer,boolean),public.copy_schedule_day(text,date,date[],text,boolean),
 public.publish_schedule_week(text,date),public.calculate_operator_cost(text,date,date),public.get_overlapping_colleagues(date,date) from public,anon;
grant execute on function public.submit_partial_availability(jsonb),public.review_availability_submission(uuid,boolean,text),
 public.submit_leave_request(date,text,text,text,text),public.review_leave_request(uuid,boolean,text),
 public.upsert_operator_assignment(uuid,text,date,integer,integer,boolean),public.copy_schedule_day(text,date,date[],text,boolean),
 public.publish_schedule_week(text,date),public.calculate_operator_cost(text,date,date),public.get_overlapping_colleagues(date,date) to authenticated;
commit;
