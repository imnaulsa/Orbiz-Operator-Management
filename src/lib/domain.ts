import type { Database } from './database.generated';
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Assignment = Database['public']['Tables']['schedule_assignments']['Row'];
export type Slot = Database['public']['Tables']['availability_slots']['Row'];
export type Submission = Database['public']['Tables']['availability_submissions']['Row'];
export type Leave = Database['public']['Tables']['leave_requests']['Row'];
export type Rate = Database['public']['Tables']['operator_rates']['Row'];
export type Cost = { operator_id: string; display_name: string; location_id: string; working_days: number; total_hours: number; estimated_salary: number; applicable_rates: { rate_id: string; hourly_fee: number }[] };
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export const addDays = (date: string, days: number) => { const d = new Date(date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
export const monday = (date: string) => addDays(date, -((new Date(date + 'T00:00:00Z').getUTCDay() + 6) % 7));
export const calendarMonth = (date: string) => { const d = new Date(date + 'T00:00:00Z'); return { start: date.slice(0,7)+'-01', end: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth()+1, 0)).toISOString().slice(0,10) }; };
export const prettyDate = (date: string) => new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(date + 'T00:00:00+07:00'));
export const money = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
export const hourLabel = (n: number) => `${String(n).padStart(2,'0')}:00`;
export function ranges(hours: number[]) {
  const out: { start: number; end: number }[] = [];
  for (const h of [...new Set(hours)].sort((a,b)=>a-b)) { const last = out.at(-1); if (last?.end === h) last.end = h+1; else out.push({start:h,end:h+1}); }
  return out;
}
export function groupAssignments(rows: Assignment[]) {
  const map = new Map<string,{date:string;operator:string;hours:number[]}>();
  for(const row of rows) { const key=row.work_date+':'+row.operator_id; const group=map.get(key)??{date:row.work_date,operator:row.operator_id,hours:[]};group.hours.push(row.hour);map.set(key,group); }
  return [...map.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.operator.localeCompare(b.operator)).map(g=>({...g,ranges:ranges(g.hours)}));
}
export function slotAllowed(operator:string,date:string,hour:number,slots:Slot[],leaves:Leave[]) {
  if(!slots.some(s=>s.operator_id===operator&&s.work_date===date&&s.hour===hour&&s.status==='approved')) return false;
  const a=Date.parse(date+'T'+hourLabel(hour)+':00+07:00');
  return !leaves.some(l=>l.operator_id===operator&&l.status==='approved'&&Date.parse(l.starts_at)<a+3600000&&Date.parse(l.ends_at)>a);
}

/** Period containing date; ends on the 20th. Filter only, not a payroll rule. */
export function logbookPeriod(date:string){
 const d=new Date(date+'T00:00:00Z');const y=d.getUTCFullYear(),m=d.getUTCMonth(),offset=d.getUTCDate()>=21?1:0;
 return {start:new Date(Date.UTC(y,m+offset-1,21)).toISOString().slice(0,10),end:new Date(Date.UTC(y,m+offset,20)).toISOString().slice(0,10)};
}
