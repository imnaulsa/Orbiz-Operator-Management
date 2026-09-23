import {useState} from 'react';
import {addDays,calendarMonth,prettyDate,today} from '../lib/domain';

export function MultiDatePicker({anchor,value,onChange}:{anchor:string;value:string[];onChange:(dates:string[])=>void}){
 const [month,setMonth]=useState((anchor||today()).slice(0,7));
 const range=calendarMonth(month+'-01'),days:string[]=[];
 for(let d=range.start;d<=range.end;d=addDays(d,1))days.push(d);
 const offset=(new Date(range.start+'T12:00:00Z').getUTCDay()+6)%7;
 function toggle(date:string){onChange(value.includes(date)?value.filter(d=>d!==date):[...value,date].sort())}
 return <div className="multi-date-picker"><label>Bulan tanggal pilihan<input type="month" value={month} onChange={e=>{if(e.target.value)setMonth(e.target.value)}}/></label>
  <p className="muted">Klik tanggal untuk memilih atau membatalkan. Hanya tanggal terpilih yang akan dibuat; tanggal acuan tidak ikut otomatis.</p>
  <div className="multi-date-grid">{['Sen','Sel','Rab','Kam','Jum','Sab','Min'].map(day=><span key={day}>{day}</span>)}
   {Array.from({length:offset},(_,i)=><span key={'blank'+i}/>)}
   {days.map(d=><button type="button" key={d} disabled={d<today()} aria-label={prettyDate(d)} aria-pressed={value.includes(d)} className={value.includes(d)?'selected':''} onClick={()=>toggle(d)}>{Number(d.slice(-2))}</button>)}
  </div><p>{value.length} tanggal dipilih</p><div className="row-actions">{value.map(d=><button type="button" key={d} onClick={()=>toggle(d)} aria-label={'Hapus tanggal '+prettyDate(d)}>{prettyDate(d)} ×</button>)}</div>
  {!!value.length&&<button type="button" onClick={()=>onChange([])}>Kosongkan pilihan</button>}
 </div>;
}
