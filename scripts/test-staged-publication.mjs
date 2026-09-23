import assert from 'node:assert/strict';
export async function testStagedPublication({db,as,check,ids}){
 const people={};let n=2000;
 for(const [name,role,city] of [['operatorManager','operator_manager','jakarta'],['manager','host_manager','jakarta'],['otherManager','host_manager','bandung'],['hostA','host','jakarta'],['hostB','host','jakarta'],['operator','staff','jakarta'],['hostCityB','host','bandung']]){
  const id=`20000000-0000-4000-8000-${String(n++).padStart(12,'0')}`;people[name]=id;
  await db.query('insert into auth.users values($1)',[id]);
  await as(0,'select public.manage_account($1,$2,$3,$4,\'mitra\',true,25000,\'2099-01-01\')',[id,name,role,city]);
 }
 const action=async(user,name,payload)=>(await as(people[user]??user,'select public.production_action_v2($1,$2::jsonb) result',[name,JSON.stringify(payload)]))[0].result;
 const batch=async(user,name,payload)=>(await as(people[user]??user,'select public.production_schedule_tools($1,$2::jsonb) result',[name,JSON.stringify(payload)]))[0].result;
 const snap=async(user,loc='jakarta')=>(await as(people[user]??user,"select public.production_snapshot_v2($1,'2099-02-01','2099-02-28') result",[loc]))[0].result;
 const raw=async id=>(await db.query('select * from public.live_sessions where id=$1',[id])).rows[0];
 const studio=(await action(0,'studio',{location:'jakarta',name:'Staged A',capacity:1})).id;
 const studio2=(await action(0,'studio',{location:'jakarta',name:'Staged B',capacity:1})).id;
 const brand=(await action(0,'master_brand',{name:'Staged Brand',tiktok:'TT-STAGED'})).id;
 const quotation=(await action(0,'quotation',{brand,platform:'TikTok',reference:'Q-STAGED',period_start:'2099-02-01',period_end:'2099-02-28',hours:100,rate:100000})).id;
 const create=async(date,start=9,end=11,host='')=>{await action(0,'session_multi',{location:'jakarta',studio,quotation,dates:[date],start,end,host});return (await snap(0)).sessions.find(s=>s.quotation_id===quotation&&s.work_date===date&&s.start_hour===start).id};
 const first=await create('2099-02-01'),second=await create('2099-02-02');
 await check('upgrade preserves previously published host assignments',async()=>{const r=await db.query("select count(*)::int n from public.live_sessions where status='published' and host_id is not null and host_fee is not null and not host_published");assert.equal(r.rows[0].n,0)});
 await check('staff and hosts cannot see draft schedules',async()=>{assert.equal((await snap('hostA')).sessions.length,0);assert.equal((await snap('operator')).sessions.length,0)});
 await check('publish schedule without operator shift or host succeeds',async()=>{const r=await batch('manager','schedule_publish',{ids:[first,second]});assert.equal(r.published,2);assert.equal((await raw(first)).host_published,false)});
 await check('all published schedules visible to hosts and operators in their location',async()=>{for(const user of ['hostA','hostB','operator'])assert.equal((await snap(user)).sessions.filter(s=>[first,second].includes(s.id)).length,2);assert(!(await snap('hostCityB','bandung')).sessions.some(s=>s.id===first))});
 await check('staff cannot switch ecosystem',()=>assert.rejects(()=>snap('hostA','bandung')));
 for(const user of ['hostA','operator'])for(const name of ['schedule_edit','schedule_import','schedule_publish','host_publish'])await check(`${user} cannot ${name}`,()=>assert.rejects(()=>batch(user,name,{id:first,ids:[first],rows:[]})));
 await check('pending edits table is protected by RLS and grants',async()=>{assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.live_session_edits'::regclass")).rows[0].relrowsecurity,true);await assert.rejects(()=>as(people.hostA,'select * from public.live_session_edits'));await assert.rejects(()=>as(people.manager,'delete from public.live_session_edits'))});
 await check('legacy internals are not callable by staff',async()=>{for(const name of ['production_action','production_action_v2','production_schedule_tools'])await assert.rejects(()=>as(people.operator,`select private.${name}('publish','{}')`))});
 await check('host cannot submit check before host publication',()=>assert.rejects(()=>action('hostA','check',{location:'jakarta',id:first,kind:'host',answers:{ready:true,brief:true}}),/belum dipublish/));
 const slots=[1,2,3,4,5,6,7].flatMap(day=>[9,10,11].map(hour=>({date:`2099-02-${String(day).padStart(2,'0')}`,hour})));
 for(const h of ['hostA','hostB'])await action(h,'availability',{location:'jakarta',slots});
 await action('manager','review_availability',{location:'jakarta',ids:(await snap('manager')).availability.map(a=>a.id),approve:true});
 const edit=(user,id,host,st=studio)=>batch(user,'schedule_edit',{id,location:'jakarta',studio:st,host});
 await check('saving host and studio stages a change without altering published row',async()=>{await edit('manager',first,people.hostA,studio2);const r=await raw(first);assert.equal(r.host_id,null);assert.equal(r.studio_id,studio);const m=(await snap('manager')).sessions.find(s=>s.id===first);assert.equal(m.has_pending,true);assert.equal(m.host_id,people.hostA);assert.equal(m.studio_id,studio2);for(const u of ['hostA','operator']){const row=(await snap(u)).sessions.find(s=>s.id===first);assert.equal(row.host_id,null);assert.equal(row.studio_id,studio);assert(!row.has_pending)}});
 await check('cross-city manager cannot stage source schedule',()=>assert.rejects(()=>edit('otherManager',first,people.hostA)));
 await check('cross-city host placement rejected',()=>assert.rejects(()=>edit('manager',first,people.hostCityB)));
 await check('stale review version cannot publish another managers change',async()=>{const old=(await snap('manager')).sessions.find(s=>s.id===first).edit_version;await edit('manager',first,people.hostA,studio2);await assert.rejects(()=>batch('manager','host_publish',{ids:[first],versions:{[first]:old}}),/manager lain/);assert.equal((await raw(first)).host_id,null)});
 await check('host publication applies saved placement and cost without operator shift',async()=>{await batch('manager','host_publish',{ids:[first]});const r=await raw(first);assert.equal(r.host_id,people.hostA);assert.equal(Number(r.host_fee),25000);assert.equal(r.host_published,true);assert.equal(r.studio_id,studio2);assert(!(await snap('manager')).sessions.find(s=>s.id===first).has_pending)});
 await check('host all-schedule visibility does not reveal peer rates or availability',async()=>{const data=await snap('hostB'),other=data.sessions.find(s=>s.id===first);assert.equal(other.host_id,people.hostA);assert(!('host_fee' in other));assert(data.availability.every(a=>a.host_id===people.hostB));assert(data.rates.every(r=>r.host_id===people.hostB));assert(data.hosts.some(h=>h.id===people.hostA));assert.equal((await snap('hostA')).sessions.find(s=>s.id===first).host_fee,25000)});
 await check('reassigning a published host preserves old assignment until republished',async()=>{await edit('manager',first,people.hostB,studio2);assert.equal((await snap('hostA')).sessions.find(s=>s.id===first).host_id,people.hostA);await batch('manager','schedule_publish',{ids:[first]});assert.equal((await snap('hostA')).sessions.find(s=>s.id===first).host_id,people.hostB)});
 await check('pending edits do not alter confirmed cost/logbook snapshot',async()=>{await edit('manager',first,people.hostA,studio2);const data=await snap('manager');assert.equal(data.sessions.find(s=>s.id===first).host_id,people.hostA);assert.equal(data.published_sessions.find(s=>s.id===first).host_id,people.hostB);assert.equal(data.published_sessions.find(s=>s.id===first).host_fee,25000)});
 await check('removing host can be published without removing schedule visibility',async()=>{await edit('manager',first,'',studio2);await batch('manager','schedule_publish',{ids:[first]});const r=await raw(first);assert.equal(r.status,'published');assert.equal(r.host_id,null);assert.equal(r.host_fee,null);assert.equal(r.host_published,false)});
 await check('auto host plotting also stages assignments for published schedules',async()=>{const r=await action('manager','auto_assign_hosts',{location:'jakarta',quotation,hosts:[people.hostA]});assert.equal(r.assigned,2);assert.equal((await raw(second)).host_id,null);assert.equal((await snap('manager')).sessions.find(s=>s.id===second).host_id,people.hostA);await batch('manager','host_publish',{ids:[first,second]})});
 const third=await create('2099-02-03',9,11,people.hostA);
 await check('initial publish does not expose an unconfirmed draft host',async()=>{await batch('manager','schedule_publish',{ids:[third]});const s=(await snap('hostA')).sessions.find(s=>s.id===third);assert.equal(s.host_id,null);assert.equal(s.host_published,false);await batch('manager','host_publish',{ids:[third]});assert.equal((await snap('hostA')).sessions.find(s=>s.id===third).host_id,people.hostA)});
 const fourth=await create('2099-02-04'),fifth=await create('2099-02-05');
 await batch('manager','schedule_publish',{ids:[fourth,fifth]});
 await edit('manager',fourth,people.hostB);await edit('manager',fifth,people.hostB);
 await db.query("update public.host_availability set status='rejected' where host_id=$1 and work_date='2099-02-05'",[people.hostB]);
 await check('one invalid host rolls back whole publish batch and retains proposals',async()=>{await assert.rejects(()=>batch('manager','host_publish',{ids:[fourth,fifth]}),/Publish dibatalkan/);assert.equal((await raw(fourth)).host_id,null);assert.equal((await raw(fifth)).host_id,null);assert((await snap('manager')).sessions.filter(s=>[fourth,fifth].includes(s.id)).every(s=>s.has_pending))});
 await check('missing host rate blocks host publication only',async()=>{await db.query('delete from public.host_rates where host_id=$1',[people.hostB]);await assert.rejects(()=>batch('manager','host_publish',{ids:[fourth]}),/Rate host/);assert.equal((await raw(fourth)).status,'published')});
 await check('legacy edit RPC cannot bypass staged publication',async()=>{await action('manager','edit_session',{id:fourth,location:'jakarta',studio:studio2,host:''});assert.equal((await raw(fourth)).studio_id,studio);assert.equal((await snap('manager')).sessions.find(s=>s.id===fourth).studio_id,studio2)});
 await check('cancel removes pending changes',async()=>{await action('manager','cancel',{location:'jakarta',id:fourth});assert.equal((await db.query('select count(*)::int n from public.live_session_edits where session_id=$1',[fourth])).rows[0].n,0)});
 await check('host publication requires initial schedule publication',async()=>{const id=await create('2099-02-06');await assert.rejects(()=>batch('manager','host_publish',{ids:[id]}),/Publish jadwal/)});
 const capacitySession=await create('2099-02-07');await batch('manager','schedule_publish',{ids:[capacitySession]});
 const otherBrand=(await action(0,'master_brand',{name:'Capacity Brand',tiktok:'TT-CAPACITY'})).id;
 const otherQ=(await action(0,'quotation',{brand:otherBrand,platform:'TikTok',reference:'Q-CAPACITY',period_start:'2099-02-01',period_end:'2099-02-28',hours:10,rate:100000})).id;
 await action(0,'session_multi',{location:'jakarta',studio:studio2,quotation:otherQ,dates:['2099-02-07'],start:9,end:11,host:''});
 await check('capacity is rechecked before publishing a saved studio change',async()=>{await edit('manager',capacitySession,'',studio2);await assert.rejects(()=>batch('manager','schedule_publish',{ids:[capacitySession]}),/Kapasitas studio penuh/);assert.equal((await raw(capacitySession)).studio_id,studio)});
 await check('unconfirmed placement allows setting a rate before host publication',async()=>{const id=await create('2099-02-06',11,12,people.hostA);await batch('manager','schedule_publish',{ids:[id]});await action('manager','rate',{location:'jakarta',host:people.hostA,effective:'2099-02-06',fee:28000});await batch('manager','host_publish',{ids:[id]});assert.equal(Number((await raw(id)).host_fee),28000)});
 await check('past schedules remain unpublishable',async()=>{await db.query("update public.live_sessions set work_date='2020-01-01' where id=$1",[fifth]);await assert.rejects(()=>batch('manager','host_publish',{ids:[fifth]}),/berjalan/)});
 await check('operator manager reads quotation values and master references in own location',async()=>{
  const data=await snap('operatorManager');assert.equal(data.quotations.find(q=>q.id===quotation).rate,100000);assert(data.brands.some(b=>b.id===brand));assert(data.studios.some(s=>s.id===studio));assert(data.studios.every(s=>s.location_id==='jakarta'));
  await db.query('update public.production_brands set active=false where id=$1',[otherBrand]);assert((await snap('operatorManager')).brands.some(b=>b.id===otherBrand));
 });
 await check('operator reference access does not expose host fees or peer rates',async()=>{const data=await snap('operatorManager');assert.equal(data.rates.length,0);assert(data.sessions.every(s=>!('host_fee' in s)||s.host_fee===null));assert.equal((await snap('hostA')).quotations.find(q=>q.id===quotation).rate,undefined)});
 await check('operator reference access does not grant quotation or master management',async()=>{
  for(const name of ['quotation_edit','quotation_delete','brand_edit','brand_delete','studio_edit','studio_delete'])await assert.rejects(()=>as(people.operatorManager,'select public.production_manage($1,$2::jsonb)',[name,JSON.stringify({id:quotation,confirm:true})]));
  await assert.rejects(()=>action('operatorManager','quotation',{}));await assert.rejects(()=>action('operatorManager','master_brand',{}));
 });

}
