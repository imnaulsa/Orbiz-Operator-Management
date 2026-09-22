import {db} from './supabase';
import type {Database,Json} from './database.generated';
type Row<K extends keyof Database['public']['Tables']> = Database['public']['Tables'][K]['Row'];
export type LiveSession=Omit<Row<'live_sessions'>,'host_fee'> & {host_fee?:number|null;has_pending?:boolean;edit_version?:string};
export type Quotation=Omit<Row<'production_quotations'>,'rate'> & {rate?:number;allocated_hours:number};
export type BestHourSlot={start:number;end:number};
export type OperatorDaily={work_date:string;planned_hours:number;eligible_hours:number};
export type ProductionData={brands:Row<'production_brands'>[];studios:Row<'production_studios'>[];quotations:Quotation[];hosts:{id:string;display_name:string;active:boolean;location_id:string}[];availability:Row<'host_availability'>[];leaves:Row<'host_leaves'>[];rates:Row<'host_rates'>[];sessions:LiveSession[];published_sessions?:LiveSession[];checks:Row<'live_checks'>[]};
export async function productionSnapshot(location:string|null,start:string,end:string):Promise<ProductionData>{
 const {data,error}=await db().rpc('production_snapshot_v2',{p_location:location,p_start:start,p_end:end});
 if(error)throw error;return data as unknown as ProductionData;
}
export async function productionAction(action:string,payload:Record<string,Json|undefined>){
 const management=['quotation_edit','quotation_delete','brand_edit','brand_delete','studio_edit','studio_delete','sessions_delete'].includes(action);
 const batch=['schedule_import','schedule_publish','host_publish','schedule_edit'].includes(action);
 const {data,error}=await db().rpc(batch?'production_schedule_tools':management?'production_manage':'production_action_v2',{p_action:action,p_payload:payload});
 if(error)throw error;return data as {id?:string;created?:number;remaining?:number;assigned?:number;imported?:number;published?:number};
}
export function parseHours(value:string){
 const hours=value.split(',').map(s=>s.trim()).filter(Boolean).map(Number);
 if(hours.some(n=>!Number.isInteger(n)||n<0||n>23))throw new Error('Isi jam 0–23 dipisahkan koma, misalnya 9,10,19,20');
 return [...new Set(hours)];
}
export function parseBestHourSlots(value:string):BestHourSlot[]{
 const slots=value.split(',').map(v=>v.trim()).filter(Boolean).map(v=>{const match=v.match(/^(\d{1,2})(?::00)?\s*-\s*(\d{1,2})(?::00)?$/);if(!match)throw new Error('Format best hour: 09-11, 19-22');return {start:Number(match[1]),end:Number(match[2])};});
 if(!slots.length||slots.some(s=>!Number.isInteger(s.start)||!Number.isInteger(s.end)||s.start<0||s.start>23||s.end<1||s.end>24||s.end<=s.start))throw new Error('Best hour harus berupa rentang valid, misalnya 09-11, 19-22');
 return slots;
}
export function hostDailySummary(data:ProductionData,hostId?:string){
 const result=new Map<string,{date:string;host:string;planned:number;actual:number;eligible:number;estimated:number;earned:number;pending:number}>();
 for(const s of data.published_sessions??data.sessions){
  if(s.status!=='published'||s.host_published===false||!s.host_id||(hostId&&s.host_id!==hostId))continue;
  const key=s.work_date+':'+s.host_id;
  const row=result.get(key)??{date:s.work_date,host:s.host_id,planned:0,actual:0,eligible:0,estimated:0,earned:0,pending:0};
  const check=data.checks.find(c=>c.session_id===s.id&&c.kind==='host'&&c.submitted_by===s.host_id);
  const actual=check?.actual_start&&check.actual_end?Math.max(0,(Date.parse(check.actual_end)-Date.parse(check.actual_start))/3600000):0;
  row.planned+=s.end_hour-s.start_hour;row.actual+=actual;row.eligible+=actual;
  row.estimated+=(s.end_hour-s.start_hour)*(s.host_fee??0);row.earned+=actual*(s.host_fee??0);row.pending+=check?0:1;
  result.set(key,row);
 }
 return [...result.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.host.localeCompare(b.host));
}
export async function exportHostLogbook(location:string,start:string,end:string,hostId:string,name:string){
 const data=await productionSnapshot(location,start,end);
 const rows=hostDailySummary(data,hostId);
 if(!rows.length)throw new Error('Tidak ada sesi published dalam periode ini');
 const {logbookWorkbook}=await import('./xlsx');
 const bytes=logbookWorkbook(rows.map(r=>[r.date,name,location,Number(r.eligible.toFixed(4)),r.planned,r.pending]),['Tanggal','Nama Host','Lokasi','Total Durasi Aktual Eligible (Jam)','Jam Terjadwal','Sesi Belum Check Host']);
 const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
 const a=document.createElement('a');a.href=url;a.download=`Logbook_Host_${name.replace(/[^a-zA-Z0-9_-]/g,'_')}_${start}_${end}.xlsx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export async function operatorDailyLogbook(location:string,start:string,end:string):Promise<OperatorDaily[]>{
 const result=await productionSnapshot(location,start,end);
 return (result as ProductionData & {operator_logbook:OperatorDaily[]}).operator_logbook;
}
export async function exportOperatorLiveLogbook(location:string,start:string,end:string,name:string){
 const rows=await operatorDailyLogbook(location,start,end);
 if(!rows.length)throw new Error('Tidak ada shift published');
 const {logbookWorkbook}=await import('./xlsx');
 const bytes=logbookWorkbook(rows.map(r=>[r.work_date,name,location,r.eligible_hours,r.planned_hours,r.planned_hours-r.eligible_hours]),['Tanggal','Nama Operator','Lokasi','Jam Eligible (Check Operator)','Jam Shift','Jam Pending / Belum Terhubung Live']);
 const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));const a=document.createElement('a');a.href=url;a.download=`Logbook_Production_Operator_${start}_${end}.xlsx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
