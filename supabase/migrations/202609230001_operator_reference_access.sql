begin;
-- Extend reference reads only; quotation/master mutation permissions stay unchanged.
do $migration$
declare definition text; updated text;
begin
 select pg_get_functiondef('public.production_snapshot_v2(text,date,date)'::regprocedure) into definition;
 updated:=replace(definition,
  'case when actor.role in (''super_admin'',''admin_sales'') then to_jsonb(q)',
  'case when actor.role in (''super_admin'',''admin_sales'',''operator_manager'') then to_jsonb(q)');
 updated:=replace(updated,
  'b.active or actor.role=''super_admin''',
  'b.active or actor.role in (''super_admin'',''operator_manager'')');
 if updated=definition and position('''admin_sales'',''operator_manager'') then to_jsonb(q)' in definition)=0 then
  raise exception 'Snapshot tidak sesuai. Jalankan staged_publication terlebih dahulu.';
 end if;
 execute updated;
end $migration$;
commit;
