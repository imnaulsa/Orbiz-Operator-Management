begin;

-- Reference data required by every Operator and Production workflow.
insert into public.locations(id,name)
values ('jakarta','Jakarta'),('bandung','Bandung')
on conflict(id) do update set name=excluded.name;

-- Quotations are commercial master data shared by all locations. Location is
-- selected later when a session is plotted into a studio.
alter table public.production_quotations
 drop constraint if exists production_quotations_location_id_reference_key;
alter table public.production_quotations alter column location_id drop not null;
update public.production_quotations set location_id=null where location_id is not null;
create unique index if not exists production_quotations_reference_global_uidx
 on public.production_quotations(reference);

-- Upgrade databases that already ran 202609190002. Fresh databases already
-- contain these definitions, so every replacement below is intentionally
-- conditional and safe to rerun.
do $migration$
declare definition text;
begin
 select pg_get_functiondef('public.production_snapshot(text,date,date)'::regprocedure) into definition;
 if position('q.location_id=p_location and q.period_end>=p_start' in definition)>0 then
  definition:=replace(definition,'q.location_id=p_location and q.period_end>=p_start','q.period_end>=p_start');
  execute definition;
 end if;

 select pg_get_functiondef('public.production_action(text,jsonb)'::regprocedure) into definition;
 if position('if actor.id is null or loc is null or (actor.role<>''super_admin'' and actor.location_id is distinct from loc)' in definition)>0 then
  definition:=replace(definition,
   'if actor.id is null or loc is null or (actor.role<>''super_admin'' and actor.location_id is distinct from loc) then',
   'if actor.id is null or (p_action<>''quotation'' and (loc is null or (actor.role<>''super_admin'' and actor.location_id is distinct from loc))) then');
  definition:=replace(definition,'perform private.lock_location(loc);','if p_action<>''quotation'' then perform private.lock_location(loc); end if;');
  definition:=replace(definition,
   'insert into public.production_quotations(location_id,reference,brand,account,platform,period_start,period_end,hours,rate,best_hours,created_by)',
   'insert into public.production_quotations(reference,brand,account,platform,period_start,period_end,hours,rate,best_hours,created_by)');
  definition:=replace(definition,
   'values(loc,trim(p_payload->>''reference''),trim(p_payload->>''brand''),trim(p_payload->>''account''),p_payload->>''platform''',
   'values(trim(p_payload->>''reference''),trim(p_payload->>''brand''),trim(p_payload->>''account''),p_payload->>''platform''');
  definition:=replace(definition,
   'where id=(p_payload->>''id'')::uuid and location_id=loc returning id into rid',
   'where id=(p_payload->>''id'')::uuid returning id into rid');
  definition:=replace(definition,
   'where id=(p_payload->>''quotation'')::uuid and location_id=loc',
   'where id=(p_payload->>''quotation'')::uuid');
  definition:=replace(definition,
   'perform private.audit(loc,''production.''||p_action,rid,jsonb_build_object(''actor'',actor.id));',
   'perform private.audit(case when p_action=''quotation'' then null else loc end,''production.''||p_action,rid,jsonb_build_object(''actor'',actor.id));');
  execute definition;
 end if;
end $migration$;

commit;
