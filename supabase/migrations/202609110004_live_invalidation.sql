begin;
-- Contains no user identity, schedule, fee, or leave information.
-- Staff can receive cancellation invalidation even after RLS hides the cancelled row.
create table public.schedule_signals(location_id text primary key references public.locations(id), revision bigint not null default 0);
alter table public.schedule_signals enable row level security;
revoke all on public.schedule_signals from anon,authenticated;
grant select on public.schedule_signals to authenticated;
create policy signal_read on public.schedule_signals for select to authenticated using(
 private.can_manage(location_id) or exists(select 1 from public.profiles where id=auth.uid() and active and profiles.location_id=schedule_signals.location_id));
create function private.signal_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.schedule_signals(location_id,revision) values(new.location_id,1)
 on conflict(location_id) do update set revision=public.schedule_signals.revision+1;
 return new;
end $$;
create trigger assignments_signal after insert or update on public.schedule_assignments for each row execute function private.signal_change();
create trigger leave_signal after insert or update on public.leave_requests for each row execute function private.signal_change();
create trigger availability_signal after insert or update on public.availability_submissions for each row execute function private.signal_change();
revoke all on function private.signal_change() from public,anon,authenticated;
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  alter publication supabase_realtime add table public.schedule_signals;
 end if;
end $$;
commit;
