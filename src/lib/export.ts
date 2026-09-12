import {db} from './supabase';
import {allPages} from './data';
import {groupAssignments,hourLabel,prettyDate,type Assignment,type Profile} from './domain';
export async function exportLogbook(profile:Profile,start:string,end:string){
 if(profile.role!=='staff')throw new Error('Export personal hanya untuk akun staff');
 if(!start||!end||start>end||Date.parse(end)-Date.parse(start)>366*86400000)throw new Error('Rentang maksimal 367 hari');
 // Re-read database at export time; never trust rows from a visible mock/table.
 const rows=await allPages<Assignment>((a,b)=>db().from('schedule_assignments').select('*').eq('operator_id',profile.id).eq('layer','published').is('cancelled_at',null).gte('work_date',start).lte('work_date',end).order('work_date').order('hour').range(a,b));
 if(!rows.length)throw new Error('Tidak ada jadwal published dalam periode ini');
 if(rows.some(r=>r.operator_id!==profile.id||r.location_id!==profile.location_id))throw new Error('Data export tidak sesuai akun');
 const {logbookWorkbook}=await import('./xlsx');
 const cells=groupAssignments(rows).flatMap(g=>g.ranges.map(r=>[prettyDate(g.date),profile.display_name,profile.location_id==='jakarta'?'Jakarta':'Bandung',hourLabel(r.start),hourLabel(r.end),r.end-r.start]));
 const bytes=logbookWorkbook(cells);const blob=new Blob([new Uint8Array(bytes)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`Logbook_${profile.display_name.replace(/[^a-zA-Z0-9_-]/g,'_')}_${start}_${end}.xlsx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
