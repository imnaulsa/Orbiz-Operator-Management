begin;
-- UUID remains the relational PK. The public code never changes, even after rescheduling.
create sequence private.live_code_sequence;
revoke all on sequence private.live_code_sequence from public,anon,authenticated;
alter table public.live_sessions
 add column live_code text,
 add column live_label text,
 add column legacy_live_id text;

create function private.live_session_identifiers() returns trigger
language plpgsql security definer set search_path='' as $$
declare shop text;
begin
 if tg_op='UPDATE' then
  new.live_code:=old.live_code;
 else
  new.live_code:='LS-'||to_char(new.work_date,'YY')||'-'||lpad(nextval('private.live_code_sequence'::regclass)::text,6,'0');
 end if;
 select regexp_replace(upper(account),'[^A-Z0-9]','','g') into shop
 from public.production_quotations where id=new.quotation_id;
 if shop is null or shop='' then raise exception 'Shop ID tidak tersedia'; end if;
 new.live_label:=to_char(new.work_date,'YYYYMMDD')||'_'||lpad(new.start_hour::text,2,'0')||'00-'||lpad(new.end_hour::text,2,'0')||'00_'||shop;
 -- Historical DMYY spelling is an alias only: 1 November and 11 January collide.
 new.legacy_live_id:=extract(day from new.work_date)::integer::text||extract(month from new.work_date)::integer::text||to_char(new.work_date,'YY')||'_'||lpad(new.start_hour::text,2,'0')||lpad(new.end_hour::text,2,'0')||'_'||shop;
 return new;
end $$;

-- Deterministic backfill of existing sessions before installing the insert trigger.
with numbered as (
 select id,row_number() over(order by work_date,created_at,id) as n
 from public.live_sessions
)
update public.live_sessions s set live_code='LS-'||to_char(s.work_date,'YY')||'-'||lpad(numbered.n::text,6,'0')
from numbered where numbered.id=s.id;
select setval('private.live_code_sequence',greatest((select count(*) from public.live_sessions),1),
 (select count(*)>0 from public.live_sessions));
create trigger live_session_identifiers before insert or update of work_date,start_hour,end_hour,quotation_id,live_code
on public.live_sessions for each row execute function private.live_session_identifiers();
-- Recompute the date/account labels for backfilled rows, keeping their assigned code.
update public.live_sessions set quotation_id=quotation_id;
alter table public.live_sessions alter column live_code set not null,alter column live_label set not null,alter column legacy_live_id set not null;
alter table public.live_sessions add constraint live_sessions_live_code_unique unique(live_code);
create index live_sessions_legacy_live_id_idx on public.live_sessions(legacy_live_id);

-- A commercial account edit must also update the displayed/legacy label.
create function private.refresh_session_shop_label() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.account is distinct from old.account then
  update public.live_sessions set quotation_id=quotation_id where quotation_id=new.id;
 end if;
 return new;
end $$;
create trigger refresh_session_shop_label after update of account on public.production_quotations
for each row execute function private.refresh_session_shop_label();
commit;
