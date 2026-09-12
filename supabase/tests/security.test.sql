-- Supabase-native smoke test. Isolated synthetic identities; rollback at end.
-- Run with `supabase test db` on LOCAL development only.
begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(10);
insert into auth.users(id) values
 ('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002'),
 ('10000000-0000-4000-8000-000000000003'),('10000000-0000-4000-8000-000000000004'),('10000000-0000-4000-8000-000000000005');
insert into public.locations values('jakarta','Jakarta'),('bandung','Bandung') on conflict do nothing;
insert into public.profiles(id,display_name,role,location_id) values
 ('10000000-0000-4000-8000-000000000001','TEST SA','super_admin',null),
 ('10000000-0000-4000-8000-000000000002','TEST MJ','operator_manager','jakarta'),
 ('10000000-0000-4000-8000-000000000003','TEST MB','operator_manager','bandung'),
 ('10000000-0000-4000-8000-000000000004','TEST SJ','staff','jakarta'),
 ('10000000-0000-4000-8000-000000000005','TEST SB','staff','bandung');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select is((select count(*)::int from public.profiles where display_name like 'TEST %'),5,'Super Admin reads all test identities');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select is((select count(*)::int from public.profiles where location_id='bandung'),0,'Jakarta manager cannot read Bandung');
select throws_ok($$select public.publish_schedule_week('bandung','2099-01-05')$$,'42501','Akses lokasi ditolak','Jakarta manager cannot publish Bandung');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select is((select count(*)::int from public.profiles where location_id='jakarta'),0,'Bandung manager cannot read Jakarta');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',true);
select is((select count(*)::int from public.profiles),1,'Jakarta staff only reads own profile');
select throws_ok($$update public.profiles set role='super_admin'$$,'42501','permission denied for table profiles','Staff cannot escalate role');
select is((select count(*)::int from public.audit_logs),0,'Staff cannot read audit logs');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000005',true);
select is((select count(*)::int from public.profiles),1,'Bandung staff only reads own profile');
select throws_ok($$insert into public.schedule_assignments default values$$,'42501','permission denied for table schedule_assignments','Direct assignment insert denied');
select throws_ok($$select public.publish_schedule_week('bandung','2099-01-05')$$,'42501','Akses lokasi ditolak','Staff cannot publish');
reset role;
select * from finish();
rollback;
