import {addDays,calendarMonth,monday} from './domain';
import type {LiveSession,ProductionData} from './production';
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
