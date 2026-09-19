// Local UI fixture only; Vite's production entry never includes this file.
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ScheduleTablePage,StudioTimelinePage} from '../src/components/ProductionSchedule';
import {scheduleRange,type CalendarMode} from '../src/lib/schedule';
import {today} from '../src/lib/domain';
import {readScheduleWorkbook,scheduleHeaders} from '../src/lib/scheduleExcel';
import {logbookWorkbook} from '../src/lib/xlsx';
import type {Ctx} from '../src/components/ProductionWorkspace';
import '../src/styles.css';
const date=today(),first=date.slice(0,7)+'-01';
const sessions=Array.from({length:26},(_,i)=>({id:String(i),quotation_id:'q',studio_id:'st',location_id:'jakarta',work_date:i===25?first:date,start_hour:i%23,end_hour:i%23+1,host_id:null,status:'draft',lane:1}));
function Fixture(){
 const [range,setRange]=useState({start:date,end:date}),[mode,setMode]=useState<CalendarMode>('daily'),[timeline,setTimeline]=useState(false),[notice,setNotice]=useState('');
 const c={data:{sessions:sessions.filter(s=>s.work_date>=range.start&&s.work_date<=range.end),quotations:[{id:'q',brand_id:'b',reference:'Q-001',brand:'Test Brand',platform:'Mirror'}],brands:[{id:'b',name:'Test Brand',active:true}],studios:[{id:'st',name:'Studio Test',location_id:'jakarta',capacity:1}],hosts:[],checks:[]},profile:{role:'super_admin'},location:'jakarta',...range,busy:false,act:async(action:string)=>{setNotice(`Fixture action: ${action}`);return true},run:async()=>true} as unknown as Ctx;
 async function testExcel(){
  try{
   const blank=new Uint8Array(await (await fetch('/templates/livestream-schedule.xlsx')).arrayBuffer());
   try{readScheduleWorkbook(blank);throw new Error('Blank template should fail')}catch(e){if(!(e instanceof Error)||!e.message.includes('1–500'))throw e}
   const bytes=logbookWorkbook([['2099-01-01','Test Brand','Mirror','jakarta','Studio Test',9,11,'','']],scheduleHeaders,'Jadwal');
   const result=readScheduleWorkbook(bytes);if(result[0].brand!=='Test Brand'||result[0].end!==11)throw new Error('Round-trip mismatch');
   setNotice('Excel parser PASS: template headers, empty template, round-trip, duration, brand');
  }catch(e){setNotice(`FAIL: ${String(e)}`)}
 }
 return <div className="production"><main className="workspace"><h1>Local schedule UI fixture</h1><p role="status">{notice}</p><button onClick={()=>setTimeline(v=>!v)}>{timeline?'Jadwal':'Studio Timeline'}</button><button onClick={()=>void testExcel()}>Uji parser Excel</button>{timeline?<StudioTimelinePage {...c} calendar={{mode,change:(m,d,e)=>{setMode(m);setRange(scheduleRange(m,d,e))},refresh:()=>{}}}/>:<ScheduleTablePage key={range.start+range.end} {...c} calendar={{mode,change:(m,d,e)=>{setMode(m);setRange(scheduleRange(m,d,e))},refresh:()=>{}}}/>}</main></div>
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
