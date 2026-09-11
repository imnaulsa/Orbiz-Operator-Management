import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth,public to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`);
for (const f of (await readdir('supabase/migrations')).sort()) await db.exec(await readFile('supabase/migrations/'+f,'utf8'));
await db.exec(await readFile('supabase/seed.sql','utf8'));
const ids = Array.from({length:6},(_,i)=>`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
for (const id of ids) await db.query('insert into auth.users values($1)',[id]);
await db.query(`insert into public.profiles(id,display_name,role,location_id,employment_type) values($1,'TEST Super Admin','super_admin',null,'internal')`,[ids[0]]);
async function as(user,sql,args=[]) {
 return db.transaction(async tx=>{
  await tx.exec('set local role authenticated');
  await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[ids[user]??user]);
  return (await tx.query(sql,args)).rows;
 });
}
let passed=0;
async function check(name,fn){await fn(); passed++; console.log('PASS',name);}
const deny=async(user,sql,args=[])=>assert.rejects(()=>as(user,sql,args));
const rpc=async(user,name,args=[],params=[])=>as(user,`select public.${name}(${params.map((t,i)=>'$'+(i+1)+(t?'::'+t:'')).join(',')}) as result`,args);
for(let i=1;i<6;i++) await rpc(0,'manage_account',[ids[i],`TEST ${i}`,i<3?'operator_manager':'staff',i===2||i===4?'bandung':'jakarta','mitra',true,i<3?null:20000,'2099-01-01'],['uuid','text','public.app_role','text','public.employment_type','boolean','numeric','date']);
await check('all ten tables have RLS',async()=>assert.equal((await db.query("select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity")).rows[0].n,10));
for (const [u,n] of [[0,6],[1,3],[2,2],[3,1],[4,1]]) await check(`profile visibility role ${u}`,async()=>assert.equal((await as(u,'select * from public.profiles')).length,n));
await check('anon cannot read profiles',async()=>assert.rejects(()=>db.transaction(async tx=>{await tx.exec('set local role anon');await tx.exec('select * from public.profiles');})));
for (const table of ['profiles','operator_rates','availability_submissions','availability_slots','leave_requests','schedule_publications','schedule_assignments','audit_logs']) {
 await check(`staff direct DELETE denied ${table}`,()=>deny(3,`delete from public.${table}`));
}
await check('staff cannot edit role',()=>deny(3,"update public.profiles set role='super_admin' where id=$1",[ids[3]]));
await check('manager cannot manage other ecosystem',()=>deny(1,"select public.manage_account($1,'X','staff','bandung','mitra',true)",[ids[4]]));
await check('manager cannot promote self',()=>deny(1,"select public.manage_account($1,'X','super_admin','jakarta','mitra',true)",[ids[1]]));
await check('staff cannot call account RPC',()=>deny(3,"select public.manage_account($1,'X','staff','jakarta','mitra',true)",[ids[3]]));
await check('plot before approved denied',()=>deny(1,"select public.upsert_operator_assignment($1,'jakarta','2099-01-05',8,9)",[ids[3]]));
const slots=JSON.stringify([5,6,7].flatMap(day=>[8,9,10].map(hour=>({date:`2099-01-0${day}`,hour}))));
const sub=(await rpc(3,'submit_partial_availability',[slots],['jsonb']))[0].result;
await check('pending submission locks cells',()=>deny(3,'select public.submit_partial_availability($1::jsonb)',[slots]));
await check('pending cannot be plotted',()=>deny(1,"select public.upsert_operator_assignment($1,'jakarta','2099-01-05',8,9)",[ids[3]]));
await check('other manager cannot approve',()=>deny(2,'select public.review_availability_submission($1,true)',[sub]));
await rpc(1,'review_availability_submission',[sub,true,''],['uuid','boolean','text']);
await check('review cannot be repeated',()=>deny(1,'select public.review_availability_submission($1,true)',[sub]));
const rejected=(await rpc(3,'submit_partial_availability',[JSON.stringify([{date:'2099-01-08',hour:8}])],['jsonb']))[0].result;
await rpc(1,'review_availability_submission',[rejected,false,'Revisi'],['uuid','boolean','text']);
await check('rejected cell can be resubmitted',()=>rpc(3,'submit_partial_availability',[JSON.stringify([{date:'2099-01-08',hour:8}])],['jsonb']));
await check('cross-location plotting denied',()=>deny(1,"select public.upsert_operator_assignment($1,'bandung','2099-01-05',8,9)",[ids[4]]));
await rpc(1,'upsert_operator_assignment',[ids[3],'jakarta','2099-01-05',8,9],['uuid','text','date','int','int']);
await check('staff cannot see draft',async()=>assert.equal((await as(3,'select * from public.schedule_assignments')).length,0));
await rpc(1,'upsert_operator_assignment',[ids[3],'jakarta','2099-01-05',8,9,true],['uuid','text','date','int','int','boolean']);
await check('one-hour assignment removable',async()=>assert.equal((await as(1,'select * from public.schedule_assignments where cancelled_at is null')).length,0));
await rpc(1,'upsert_operator_assignment',[ids[3],'jakarta','2099-01-05',8,11],['uuid','text','date','int','int']);
await rpc(1,'upsert_operator_assignment',[ids[3],'jakarta','2099-01-05',9,10],['uuid','text','date','int','int']);
await check('idempotent merge no duplicate hours',async()=>assert.equal((await as(1,'select * from public.schedule_assignments where cancelled_at is null')).length,3));
const copyArgs=['jakarta','2099-01-05',['2099-01-06','2099-01-08'],'merge',true];
const cp=(await rpc(1,'copy_schedule_day',copyArgs,['text','date','date[]','text','boolean']))[0].result;
await check('copy preview validates each target',async()=>{assert.equal(cp.valid,3);assert.equal(cp.skipped.length,3)});
await check('preview does not write',async()=>assert.equal((await as(1,'select * from public.schedule_assignments where cancelled_at is null')).length,3));
copyArgs[4]=false;await rpc(1,'copy_schedule_day',copyArgs,['text','date','date[]','text','boolean']);
await rpc(1,'publish_schedule_week',['jakarta','2099-01-05'],['text','date']);
await check('staff sees own published only',async()=>{const rows=await as(3,'select * from public.schedule_assignments');assert.equal(rows.length,6);assert(rows.every(r=>r.operator_id===ids[3]&&r.layer==='published'))});
await check('Bandung staff cannot read Jakarta assignments',async()=>assert.equal((await as(4,'select * from public.schedule_assignments')).length,0));
await check('Bandung manager cannot read Jakarta assignments',async()=>assert.equal((await as(2,'select * from public.schedule_assignments')).length,0));
await check('cost uses distinct days and hourly snapshot',async()=>{const c=(await rpc(1,'calculate_operator_cost',['jakarta','2099-01-05','2099-01-06'],['text','date','date']))[0].result[0];assert.equal(c.working_days,2);assert.equal(c.total_hours,6);assert.equal(c.estimated_salary,120000)});
await check('staff cannot calculate team cost',()=>deny(3,"select public.calculate_operator_cost('jakarta','2099-01-05','2099-01-06')"));
await check('manager cannot request combined cost',()=>deny(1,"select public.calculate_operator_cost(null,'2099-01-05','2099-01-06')"));
const leave=(await rpc(3,'submit_leave_request',['2099-01-05','08:30','09:30','Pribadi','TEST reason'],['date','text','text','text','text']))[0].result;
await check('cross-location leave review denied',()=>deny(2,'select public.review_leave_request($1,true)',[leave]));
const cancelled=(await rpc(1,'review_leave_request',[leave,true,''],['uuid','boolean','text']))[0].result;
await check('approved leave cancels draft and published atomically',async()=>{assert.equal(cancelled,4);assert.equal((await as(3,'select * from public.schedule_assignments')).length,4)});
await check('leave prevents replot',()=>deny(1,"select public.upsert_operator_assignment($1,'jakarta','2099-01-05',8,9)",[ids[3]]));
await check('cancellations audited',async()=>assert((await as(1,"select * from public.audit_logs where action='assignment.cancel'")).length>=5));
await check('retroactive rate on published dates rejected',()=>deny(1,'select public.add_operator_rate($1,$2,25000)',[ids[3],'2099-01-05']));
await rpc(1,'add_operator_rate',[ids[3],'2099-01-07',25000],['uuid','date','numeric']);
await rpc(1,'upsert_operator_assignment',[ids[3],'jakarta','2099-01-07',8,9],['uuid','text','date','int','int']);
await rpc(1,'publish_schedule_week',['jakarta','2099-01-05'],['text','date']);
await check('historical and new rates both applied',async()=>{const c=(await rpc(1,'calculate_operator_cost',['jakarta','2099-01-05','2099-01-07'],['text','date','date']))[0].result[0];assert.equal(c.estimated_salary,105000);assert.equal(c.applicable_rates.length,2)});
await check('staff cannot read peer rates',async()=>assert((await as(3,'select * from public.operator_rates')).every(r=>r.operator_id===ids[3])));
const peerSub=(await rpc(5,'submit_partial_availability',[JSON.stringify([{date:'2099-01-06',hour:8}])],['jsonb']))[0].result;
await rpc(1,'review_availability_submission',[peerSub,true,''],['uuid','boolean','text']);
await rpc(1,'upsert_operator_assignment',[ids[5],'jakarta','2099-01-06',8,9],['uuid','text','date','int','int']);
await rpc(1,'publish_schedule_week',['jakarta','2099-01-05'],['text','date']);
await check('colleague endpoint returns only overlapping name/hour',async()=>{const rows=await as(3,"select * from public.get_overlapping_colleagues('2099-01-05','2099-01-07')");assert.deepEqual(Object.keys(rows[0]).sort(),['display_name','hour','work_date']);assert.equal(rows.length,1)});
await check('staff cannot read peer rows even if sharing shift',async()=>assert.equal((await as(3,'select * from public.profiles where id=$1',[ids[5]])).length,0));
// Populate Bandung too so isolation assertions cannot pass only because it is empty.
const bsub=(await rpc(4,'submit_partial_availability',[JSON.stringify([{date:'2099-01-05',hour:8}])],['jsonb']))[0].result;
await rpc(2,'review_availability_submission',[bsub,true,''],['uuid','boolean','text']);
await rpc(2,'upsert_operator_assignment',[ids[4],'bandung','2099-01-05',8,9],['uuid','text','date','int','int']);
await rpc(2,'publish_schedule_week',['bandung','2099-01-05'],['text','date']);
await rpc(4,'submit_leave_request',['2099-01-06','08:00','09:00','TEST','TEST'],['date','text','text','text','text']);
for(const [u,loc] of [[1,'jakarta'],[2,'bandung']])for(const table of ['profiles','operator_rates','availability_submissions','availability_slots','leave_requests','schedule_publications','schedule_assignments','audit_logs','schedule_signals']) await check(`manager ${loc} isolation ${table}`,async()=>assert((await as(u,`select * from public.${table}`)).every(r=>r.location_id===loc)));
for(const u of [3,4])for(const table of ['profiles','operator_rates','availability_submissions','availability_slots','leave_requests','schedule_assignments']) await check(`staff ${u} personal isolation ${table}`,async()=>assert((await as(u,`select * from public.${table}`)).every(r=>(table==='profiles'?r.id:r.operator_id)===ids[u])));
for(const table of ['profiles','operator_rates','availability_submissions','availability_slots','leave_requests','schedule_publications','schedule_assignments','audit_logs','schedule_signals']){
 await check(`DML grants denied ${table}`,async()=>{
  await assert.rejects(()=>as(3,`insert into public.${table} default values`),e=>e.code==='42501');
  await assert.rejects(()=>as(3,`delete from public.${table}`),e=>e.code==='42501');
 });
}
await check('copy respects leave and replacement stays draft only',async()=>{
 const result=(await rpc(1,'copy_schedule_day',['jakarta','2099-01-06',['2099-01-05'],'replace',false],['text','date','date[]','text','boolean']))[0].result;
 assert(result.skipped.some(s=>s.reason==='Overlap izin approved'));
 assert.equal((await as(3,"select * from public.schedule_assignments where work_date='2099-01-05'")).length,1);
});
await check('invalid copy target rolls back whole operation',async()=>{
 const before=(await as(1,'select * from public.schedule_assignments where cancelled_at is null')).length;
 await deny(1,"select public.copy_schedule_day('jakarta','2099-01-06',array['2099-01-06'::date],'replace',false)");
 assert.equal((await as(1,'select * from public.schedule_assignments where cancelled_at is null')).length,before);
});
await check('signal rows contain no personal data',async()=>{const rows=await as(3,'select * from public.schedule_signals');assert.equal(rows.length,1);assert.deepEqual(Object.keys(rows[0]).sort(),['location_id','revision']);assert.equal(rows[0].location_id,'jakarta');assert(rows[0].revision>0)});
await rpc(1,'manage_account',[ids[3],'TEST 3','staff','jakarta','mitra',false],['uuid','text','public.app_role','text','public.employment_type','boolean']);
await check('inactive token cannot read data',async()=>assert.equal((await as(3,'select * from public.schedule_assignments')).length,0));
await check('inactive token cannot mutate',()=>deny(3,'select public.submit_partial_availability($1::jsonb)',[slots]));
await check('missing-profile token fails closed',async()=>assert.equal((await as('00000000-0000-4000-8000-999999999999','select * from public.profiles')).length,0));
// Generate types from the actual migrated catalog, including nullability and RPC arguments.
const enums=(await db.query("select t.typname, e.enumlabel from pg_type t join pg_enum e on e.enumtypid=t.oid join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' order by t.typname,e.enumsortorder")).rows;
const enumMap={}; for(const e of enums)(enumMap[e.typname]??=[]).push(e.enumlabel);
const map=t=>enumMap[t]?`Database['public']['Enums']['${t}']`:t.startsWith('_')?`(${map(t.slice(1))})[]`:['int2','int4','int8','numeric','float4','float8'].includes(t)?'number':t==='bool'?'boolean':t==='jsonb'?'Json':t==='void'?'undefined':'string';
const cols=(await db.query("select table_name,column_name,udt_name,is_nullable from information_schema.columns where table_schema='public' order by table_name,ordinal_position")).rows;
let out='// Generated from migrated PostgreSQL catalog by scripts/test-db.mjs. Do not hand-edit.\nexport type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];\nexport type Database = { public: { Tables: {\n';
for(const name of [...new Set(cols.map(c=>c.table_name))]) out+=`${name}: { Row: { ${cols.filter(c=>c.table_name===name).map(c=>`${c.column_name}: ${map(c.udt_name)}${c.is_nullable==='YES'?' | null':''}`).join('; ')} }; Insert: never; Update: never; Relationships: [] };\n`;
out+='}; Views: {}; Functions: {\n';
const fs=(await db.query("select p.proname,p.proargnames,p.proargtypes::oid[] as argtypes,p.pronargdefaults,p.prorettype::regtype::text rettype,p.proretset from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'")).rows;
for(const f of fs){const args=[];for(let i=0;i<f.argtypes.length;i++){const t=(await db.query('select typname from pg_type where oid=$1',[f.argtypes[i]])).rows[0].typname;args.push(`${f.proargnames[i]}${i>=f.argtypes.length-f.pronargdefaults?'?':''}: ${map(t)}${f.proargnames[i]==='p_location'?' | null':''}`)}out+=`${f.proname}: { Args: { ${args.join('; ')} }; Returns: ${f.proretset?'{work_date:string;hour:number;display_name:string}[]':map(f.rettype==='integer'?'int4':f.rettype==='boolean'?'bool':f.rettype)} };\n`}
out+='}; Enums: {'+Object.entries(enumMap).map(([k,v])=>`${k}: ${v.map(x=>JSON.stringify(x)).join(' | ')}`).join('; ')+'}; CompositeTypes: {} } };\n';
await writeFile('src/lib/database.generated.ts',out);
await writeFile('docs/database-test-results.txt',`${passed} passed. Engine: PGlite PostgreSQL; synthetic auth.uid/JWT claims, real PostgreSQL roles, grants, RLS and unmodified migrations. Hosted Supabase Auth, REST, concurrency and Realtime NOT covered.\n`);
console.log(`${passed} database checks passed; types generated.`);
await db.close();
