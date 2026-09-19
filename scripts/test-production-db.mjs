import assert from 'node:assert/strict';
export async function testProduction({db,as,check,ids}){
 const roleIds={};let serial=100;
 for(const [name,role,loc] of [['hm','host_manager','jakarta'],['hb','host_manager','bandung'],['h1','host','jakarta'],['h2','host','jakarta'],['h3','host','bandung'],['sales','admin_sales','jakarta'],['op','staff','jakarta']]){
  const id=`10000000-0000-4000-8000-${String(serial++).padStart(12,'0')}`;roleIds[name]=id;
  await db.query('insert into auth.users values($1)',[id]);
  await as(0,"select public.manage_account($1,$2,$3,'"+loc+"','mitra',true,30000,'2099-01-01')",[id,name,role]);
 }
 const call=async(user,action,payload)=> (await as(roleIds[user]??user,'select public.production_action($1,$2::jsonb) result',[action,JSON.stringify({location:'jakarta',...payload})]))[0].result;
 const snap=async(user,location='jakarta',start='2099-01-05',end='2099-01-11')=>(await as(roleIds[user]??user,'select public.production_snapshot($1,$2,$3) result',[location,start,end]))[0].result;
 const callV2=async(user,action,payload)=> (await as(roleIds[user]??user,'select public.production_action_v2($1,$2::jsonb) result',[action,JSON.stringify(payload)]))[0].result;
 const snapV2=async(user,location=null,start='2099-01-05',end='2099-01-11')=>(await as(roleIds[user]??user,'select public.production_snapshot_v2($1,$2,$3) result',[location,start,end]))[0].result;
 const denied=(u,a,p)=>assert.rejects(()=>call(u,a,p));
 await check('production anon RPC denied',()=>assert.rejects(()=>db.transaction(async tx=>{await tx.exec('set local role anon');await tx.exec("select public.production_snapshot('jakarta','2099-01-05','2099-01-11')");})));
 for(const t of ['production_studios','production_quotations','host_availability','host_leaves','host_rates','live_sessions','live_checks']){
  await check('production direct DML/read denied '+t,async()=>{await assert.rejects(()=>as(roleIds.h1,`delete from public.${t}`));await assert.rejects(()=>as(roleIds.sales,`select * from public.${t}`));});
 }
 await check('host cannot create quotation',()=>denied('h1','quotation',{}));
 await check('sales cannot create studio',()=>denied('sales','studio',{name:'NO',capacity:1}));
 await check('host manager cannot create sales account',()=>assert.rejects(()=>as(roleIds.hm,"select public.manage_account($1,'NO','admin_sales','jakarta','mitra',true)",[roleIds.h1])));
 await check('host cannot use operator availability workflow',()=>assert.rejects(()=>as(roleIds.h1,"select public.submit_partial_availability('[{\"date\":\"2099-01-05\",\"hour\":8}]')")));
 const studio=(await call(1,'studio',{name:'Studio A',capacity:1})).id;
 const studioMirror=(await call(1,'studio',{name:'Studio Mirror',capacity:1})).id;
 const brand=(await callV2(0,'master_brand',{name:'Mirror Brand',tiktok:'TT-MIRROR',shopee:'SP-MIRROR',mirror:'ST-MIRROR'})).id;
 const mirrorQuotation=(await callV2('sales','quotation',{reference:'QM',brand,platform:'Mirror',period_start:'2099-01-05',period_end:'2099-01-11',hours:6,rate:83333})).id;
 await callV2(1,'best_hour_slots',{location:'jakarta',quotation:mirrorQuotation,slots:[{start:8,end:10}]});
 await check('Mirror quotation uses ST mapping and stays general',async()=>{const data=await snapV2(0);const q=data.quotations.find(q=>q.id===mirrorQuotation);assert.equal(q.account,'ST-MIRROR');assert.equal(q.location_id,null);assert.equal(data.brands[0].shop_id_tiktok,'TT-MIRROR');assert.equal(data.brands[0].shop_id_shopee,'SP-MIRROR');});
 const multi=await callV2(1,'session_multi',{location:'jakarta',quotation:mirrorQuotation,studio:studioMirror,dates:['2099-01-05','2099-01-06'],start:8,end:10,host:''});
 await check('manual multi-date creates duration blocks with automatic capacity lane',async()=>{assert.equal(multi.created,4);const rows=(await snapV2(0)).sessions.filter(s=>s.quotation_id===mirrorQuotation);assert.equal(rows.length,2);assert(rows.every(s=>s.end_hour-s.start_hour===2&&s.lane===1));});
 const automatic=await callV2(1,'auto_plot_blocks',{location:'jakarta',quotation:mirrorQuotation,studio:studioMirror,hosts:[]});
 await check('best-hour auto plot preserves block duration',async()=>{assert.equal(automatic.created,2);const rows=(await snapV2(0)).sessions.filter(s=>s.quotation_id===mirrorQuotation);assert.equal(rows.length,3);assert(rows.every(s=>s.end_hour-s.start_hour===2));});
 await check('non-superadmin cannot request global operational snapshot',()=>assert.rejects(()=>snapV2('hm')));
 const quotation=(await call('sales','quotation',{reference:'Q1',brand:'Test brand',account:'Test store',platform:'TikTok',period_start:'2099-01-05',period_end:'2099-01-11',hours:8,rate:100000,best_hours:[8,9]})).id;
 await check('quotation reference duplicate rejected',()=>denied('sales','quotation',{reference:'Q1',brand:'Test',account:'Test',platform:'TikTok',period_start:'2099-01-05',period_end:'2099-01-11',hours:8,rate:1,best_hours:[8]}));
 await check('quotation is general and visible in both locations',async()=>{const other=await snap('hb','bandung');assert.equal(other.quotations[0].id,quotation);assert.equal(other.quotations[0].location_id,null);});
 await check('cross location snapshot denied',()=>assert.rejects(()=>snap('hb')));
 await check('cross location action denied',()=>denied('hb','studio',{name:'NO',capacity:1}));
 const slots=[5,6,7,8].flatMap(day=>[8,9,10].map(hour=>({date:`2099-01-0${day}`,hour})));
 await call('h1','availability',{slots});await call('h2','availability',{slots});
 await check('host partial submit locked',()=>denied('h1','availability',{slots:slots.slice(0,1)}));
 await check('host sees own availability only',async()=>assert((await snap('h1')).availability.every(a=>a.host_id===roleIds.h1)));
 const pending=(await snap('hm')).availability;
 await check('operator manager cannot approve host availability',()=>denied(1,'review_availability',{ids:[pending[0].id],approve:true}));
 await check('host cannot self approve',()=>denied('h1','review_availability',{ids:[pending[0].id],approve:true}));
 await call('hm','review_availability',{ids:pending.filter(a=>a.host_id===roleIds.h1).map(a=>a.id),approve:true});
 await call('hm','review_availability',{ids:pending.filter(a=>a.host_id===roleIds.h2).map(a=>a.id),approve:false,note:'Resubmit'});
 await check('host can resubmit rejected slots',()=>call('h2','availability',{slots}));
 await call('hm','review_availability',{ids:(await snap('hm')).availability.filter(a=>a.status==='pending').map(a=>a.id),approve:true});
 const base={quotation,studio,lane:1,date:'2099-01-05',start:8,end:9,host:roleIds.h1};
 await check('host cannot plot session',()=>denied('h1','session',base));
 await check('studio lane capacity enforced',()=>denied(1,'session',{...base,lane:2}));
 await check('availability required for full session',()=>denied(1,'session',{...base,start:11,end:12}));
 const session=(await call(1,'session',base)).id;
 await check('studio overlap denied',()=>denied(1,'session',{...base,host:roleIds.h2}));
 await check('host cannot read draft sessions',async()=>assert.equal((await snap('h1')).sessions.length,0));
 await check('publish requires operator coverage',()=>denied(1,'publish',{id:session}));
 const sub=(await as(roleIds.op,'select public.submit_partial_availability($1::jsonb) id',[JSON.stringify(slots)]))[0].id;
 await as(1,'select public.review_availability_submission($1,true)',[sub]);
 for(const day of [5,6,7,8])await as(1,"select public.upsert_operator_assignment($1,'jakarta',$2,8,11)",[roleIds.op,`2099-01-0${day}`]);
 await as(1,"select public.publish_schedule_week('jakarta','2099-01-05')");
 await call(1,'publish',{id:session});
 await check('host sees published assigned session',async()=>assert.equal((await snap('h1')).sessions.length,1));
 await check('other host cannot see session',async()=>assert.equal((await snap('h2')).sessions.length,0));
 await check('sales cannot publish',()=>denied('sales','publish',{id:session}));
 await check('host manager cannot read quotation selling rate',async()=>assert(!('rate' in (await snap('hm')).quotations[0])));
 await check('sales cannot read host rate snapshots',async()=>assert(!('host_fee' in (await snap('sales')).sessions[0])));
 await check('operator manager cannot read host rates',async()=>assert.equal((await snap(1)).rates.length,0));
 await check('future checklist denied',()=>denied('h1','check',{id:session,kind:'host',answers:{ready:true,brief:true},actual_start:'2099-01-05T08:00:00+07:00',actual_end:'2099-01-05T09:00:00+07:00'}));
 await check('retroactive rate modification denied',()=>denied('hm','rate',{host:roleIds.h1,effective:'2099-01-05',fee:50000}));
 const leave=(await call('h1','leave',{date:'2099-01-05',start:8,end:9,reason:'Test'})).id;
 await check('host cannot self approve leave',()=>denied('h1','review_leave',{id:leave,approve:true}));
 await call('hm','review_leave',{id:leave,approve:true});
 await check('approved leave removes host without republish',async()=>{assert.equal((await snap('h1')).sessions.length,0);assert.equal((await snap('hm')).sessions[0].host_id,null);});
 await check('approved leave prevents replot',()=>denied('hm','assign_host',{id:session,host:roleIds.h1}));
 await call('hm','assign_host',{id:session,host:roleIds.h2});
 await check('replacement host visible immediately',async()=>assert.equal((await snap('h2')).sessions.length,1));
 const auto=await call(1,'auto_plot',{quotation,studio,hosts:[roleIds.h1,roleIds.h2]});
 await check('auto plotting respects residual quota',async()=>{assert.equal(auto.created,7);assert.equal(auto.remaining,0);assert.equal((await snap('sales')).quotations[0].allocated_hours,8);});
 await check('repeat auto plot is idempotent when quota full',async()=>assert.equal((await call(1,'auto_plot',{quotation,studio,hosts:[roleIds.h1]})).created,0));
 await check('over quota manual slot denied',()=>denied(1,'session',{...base,date:'2099-01-08',start:10,end:11}));
 await check('account role changes with host history denied',()=>assert.rejects(()=>as(0,"select public.manage_account($1,'NO','staff','jakarta','mitra',true)",[roleIds.h1])));
 await check('host deactivation with active sessions denied',()=>assert.rejects(()=>as(roleIds.hm,"select public.manage_account($1,'H','host','jakarta','mitra',false)",[roleIds.h2])));
 // Historical fixtures are inserted only by the test DB owner to exercise completed-session authorization.
 const past='2020-01-06';
 const pastSession=(await db.query("insert into public.live_sessions(location_id,quotation_id,studio_id,lane,work_date,start_hour,end_hour,host_id,host_fee,status,created_by) values('jakarta',$1,$2,1,$3,8,10,$4,30000,'published',$5) returning id",[quotation,studio,past,roleIds.h1,ids[0]])).rows[0].id;
 const checkPayload={id:pastSession,kind:'host',answers:{ready:true,brief:true},actual_start:past+'T08:15:00+07:00',actual_end:past+'T09:45:00+07:00'};
 await check('different host cannot submit checklist',()=>denied('h2','check',checkPayload));
 await check('manager cannot impersonate host checklist',()=>denied('hm','check',checkPayload));
 await check('invalid actual duration rejected',()=>denied('h1','check',{...checkPayload,actual_end:past+'T11:00:00+07:00'}));
 await check('incomplete checklist rejected',()=>denied('h1','check',{...checkPayload,answers:{ready:true,brief:false}}));
 await call('h1','check',checkPayload);
 await check('check duplicate rejected',()=>denied('h1','check',checkPayload));
 await check('completed session cannot be cancelled',()=>denied(1,'cancel',{id:pastSession}));
 await check('unassigned operator cannot submit check',()=>denied('op','check',{id:pastSession,kind:'operator',answers:{audio:true,camera:true,network:true}}));
 await check('actual check persisted with owning host',async()=>{const value=await snap('h1','jakarta',past,past);assert.equal(value.checks.length,1);assert.equal(value.checks[0].submitted_by,roleIds.h1);assert.equal((Date.parse(value.checks[0].actual_end)-Date.parse(value.checks[0].actual_start))/3600000,1.5);});
 const pub=(await db.query("insert into public.schedule_publications(location_id,week_start,version,published_by) values('jakarta','2020-01-06',1,$1) returning id",[ids[0]])).rows[0].id;
 for(const operator of [roleIds.op,ids[5]]){
  const rate=(await db.query("insert into public.operator_rates(operator_id,location_id,effective_date,hourly_fee,created_by) values($1,'jakarta','2020-01-01',20000,$2) returning id",[operator,ids[0]])).rows[0].id;
  const sub=(await db.query("insert into public.availability_submissions(operator_id,location_id,status,reviewed_by,reviewed_at) values($1,'jakarta','approved',$2,now()) returning id",[operator,ids[0]])).rows[0].id;
  for(const hour of [8,9]){
   await db.query("insert into public.availability_slots(submission_id,operator_id,location_id,work_date,hour,status) values($1,$2,'jakarta',$3,$4,'approved')",[sub,operator,past,hour]);
   await db.query("insert into public.schedule_assignments(operator_id,location_id,work_date,hour,layer,publication_id,rate_id,hourly_fee,created_by) values($1,'jakarta',$2,$3,'published',$4,$5,20000,$6)",[operator,past,hour,pub,rate,ids[0]]);
  }
 }
 await check('operator logbook hours pending without check',async()=>assert.equal((await snap('op','jakarta',past,past)).operator_logbook[0].eligible_hours,0));
 await call('op','check',{id:pastSession,kind:'operator',answers:{audio:true,camera:true,network:true}});
 await check('assigned operator technical check succeeds and unlocks logbook',async()=>assert.equal((await snap('op','jakarta',past,past)).operator_logbook[0].eligible_hours,2));
 await check('one operator check covers another assigned operator in same shift',async()=>assert.equal((await snap(5,'jakarta',past,past)).operator_logbook[0].eligible_hours,2));
 await check('second operator cannot duplicate session technical check',()=>denied(5,'check',{id:pastSession,kind:'operator',answers:{audio:true,camera:true,network:true}}));
 await db.query('update public.profiles set active=false where id=$1',[roleIds.h1]);
 await check('inactive host snapshot denied',()=>assert.rejects(()=>snap('h1')));
 await check('inactive host mutation denied',()=>denied('h1','availability',{slots}));
}
