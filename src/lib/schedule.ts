import {addDays,calendarMonth,monday} from './domain';
import type {LiveSession,ProductionData} from './production';
import type {ImportScheduleRow} from './scheduleExcel';
export type CalendarMode='daily'|'weekly'|'monthly'|'custom';
export function scheduleRange(mode:CalendarMode,anchor:string,end=anchor){
 if(mode==='monthly')return calendarMonth(anchor);
 if(mode==='weekly'){const start=monday(anchor);return {start,end:addDays(start,6)}}
 return {start:anchor,end:mode==='custom'?end:anchor};
}
export type ScheduleFilters={location:string;platform:string;brand:string;host:string};
export function filterSchedule(data:ProductionData,filters:ScheduleFilters){
 const quotations=new Map(data.quotations.map(q=>[q.id,q]));
 return data.sessions.filter(s=>{
  const q=quotations.get(s.quotation_id);
  return s.status!=='cancelled'&&(filters.location==='all'||s.location_id===filters.location)&&
   (filters.platform==='all'||q?.platform===filters.platform)&&(filters.brand==='all'||q?.brand_id===filters.brand)&&
   (filters.host==='all'||s.host_id===filters.host);
 }).sort((a,b)=>a.work_date.localeCompare(b.work_date)||a.start_hour-b.start_hour||a.id.localeCompare(b.id));
}
export function schedulePage<T>(rows:T[],page:number,size:number){
 const pages=Math.max(1,Math.ceil(rows.length/size)),current=Math.min(Math.max(1,page),pages);
 return {pages,current,rows:rows.slice((current-1)*size,current*size)};
}
export function selectedSchedule(rows:LiveSession[],selected:Set<string>){return rows.filter(s=>selected.has(s.id))}

export function scheduleSummary(sessions:LiveSession[],data:ProductionData){
 const quotations=new Map(data.quotations.map(q=>[q.id,q]));
 const groups=new Map<string,{key:string;brand:string;platform:string;location:string;hours:number;sessions:number}>();
 for(const s of sessions){
  if(s.status==='cancelled')continue;
  const q=quotations.get(s.quotation_id),brand=q?.brand??'Brand tidak tersedia',platform=q?.platform??'—';
  const key=JSON.stringify([q?.brand_id??brand,platform,s.location_id]);
  const group=groups.get(key)??{key,brand,platform,location:s.location_id,hours:0,sessions:0};
  group.hours+=s.end_hour-s.start_hour;group.sessions++;groups.set(key,group);
 }
 return [...groups.values()].sort((a,b)=>a.brand.localeCompare(b.brand)||a.platform.localeCompare(b.platform)||a.location.localeCompare(b.location));
}

export function matchingQuotations(row:ImportScheduleRow,quotations:ProductionData['quotations']){
 return quotations.filter(q=>q.brand.trim().toLowerCase()===row.brand.toLowerCase()&&q.platform.toLowerCase()===row.platform.toLowerCase()&&q.period_start<=row.date&&q.period_end>=row.date);
}
export function resolveImport(rows:ImportScheduleRow[],quotations:ProductionData['quotations'],choices:Record<number,string>){
 const used=new Map<string,number>();
 return rows.map(row=>{
  const candidates=matchingQuotations(row,quotations),q=candidates.find(q=>q.id===choices[row.row])??(candidates.length===1?candidates[0]:undefined);
  if(!q)throw new Error(`Baris ${row.row}: ${candidates.length?'pilih periode quotation terlebih dahulu':'quotation brand/platform pada tanggal ini belum tersedia'}.`);
  const hours=(used.get(q.id)??0)+row.end-row.start;used.set(q.id,hours);
  if(hours>q.hours-q.allocated_hours)throw new Error(`Baris ${row.row}: total import melebihi sisa kuota ${q.brand} (${q.period_start} – ${q.period_end}).`);
  return {...row,quotation:q.reference};
 });
}
