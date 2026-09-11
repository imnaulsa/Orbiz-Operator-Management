import {useState,type ReactNode,type FormEvent} from 'react';
import {NavLink,Navigate,useLocation} from 'react-router-dom';
import {useAuth} from '../lib/auth';
import {db,errorText} from '../lib/supabase';
import {useData,type Data} from '../lib/data';
import {today,monday,addDays,prettyDate,calendarMonth,type Profile} from '../lib/domain';
import {Plotting} from './Plotting';
import {Availability} from './Availability';
import {Accounts} from './Accounts';
import {CostReport,PersonalSchedule} from './Reports';
export type Context={data:Data;profile:Profile;location:string;start:string;end:string;busy:boolean;run:(label:string,fn:()=>Promise<unknown>,confirm?:string)=>Promise<boolean>};
const links=[['/overview','Ringkasan'],['/plotting','Plotting Jadwal'],['/availability','Availability & Izin'],['/accounts','Operator Staff'],['/cost','Cost Operator']];
export function Workspace(){
 const {profile}=useAuth();const path=useLocation().pathname;const [city,setCity]=useState('jakarta');const [start,setStart]=useState(monday(today())),[end,setEnd]=useState(addDays(monday(today()),6));const [revision,setRevision]=useState(0),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[actionError,setActionError]=useState('');
 const staff=profile?.role==='staff';const location=profile?.role==='super_admin'?city:profile?.location_id??'jakarta';
 const {data,loading,error,live}=useData(location,start,end,staff,revision);
 if(!profile)return <Navigate to="/login" replace/>;
 if(staff&&!['/my-schedule','/availability'].includes(path))return <Navigate to="/my-schedule" replace/>;
 if(!staff&&!links.some(([to])=>to===path))return <Navigate to="/overview" replace/>;
 const run:Context['run']=async(label,fn,confirm)=>{if(busy)return false;if(confirm&&!window.confirm(confirm))return false;setBusy(true);setMessage('');setActionError('');try{await fn();setMessage(label);setRevision(r=>r+1);return true;}catch(e){setActionError(errorText(e));return false;}finally{setBusy(false);}};
 const context={data,profile,location,start,end,busy,run};
 const title=path==='/my-schedule'?'Jadwal & Logbook Saya':links.find(([to])=>to===path)?.[1];
 const resetDates=(s:string,e:string)=>{setStart(s);setEnd(e);setMessage('');setActionError('');};
 let content:ReactNode;
 if(loading)content=<div className="card loading" role="status">Memuat data…</div>;
 else if(error)content=<div className="notice error" role="alert">{error} <button onClick={()=>setRevision(r=>r+1)}>Coba lagi</button></div>;
 else if(path==='/plotting')content=<Plotting {...context}/>;
 else if(path==='/availability')content=<Availability {...context}/>;
 else if(path==='/accounts')content=<Accounts {...context}/>;
 else if(path==='/cost')content=<CostReport {...context}/>;
 else if(path==='/my-schedule')content=<PersonalSchedule {...context}/>;
 else content=<><div className="metrics"><Metric label="Operator aktif" value={data.profiles.filter(p=>p.active&&p.role==='staff').length}/><Metric label="Jam draft" value={data.assignments.length}/><Metric label="Hari terisi" value={new Set(data.assignments.map(a=>a.work_date)).size}/><Metric label="Menunggu review" value={data.submissions.filter(s=>s.status==='pending').length+data.leaves.filter(l=>l.status==='pending').length}/></div><section className="card"><div className="section-head"><h2>Jam jaga per hari</h2><span className="muted">Draft · {location==='jakarta'?'Jakarta':'Bandung'}</span></div><div className="bar-list">{Array.from({length:Math.min(31,Math.round((Date.parse(end)-Date.parse(start))/86400000)+1)},(_,i)=>addDays(start,i)).map(date=>{const n=data.assignments.filter(a=>a.work_date===date).length;const max=Math.max(1,...Object.values(data.assignments.reduce<Record<string,number>>((s,a)=>{s[a.work_date]=(s[a.work_date]??0)+1;return s;},{})));return <div className="bar-row" key={date}><span>{prettyDate(date)}</span><div><i style={{width:n/max*100+'%'}}/></div><strong>{n} jam</strong></div>;})}</div></section><div className="notice">Ringkasan menggunakan jadwal draft. Cost dan logbook menggunakan jadwal published.</div></>;
 return <div className="app"><aside><div className="brand"><span className="logo">O</span><div><strong>Orbiz Ops</strong><small>Operator Management</small></div></div><p className="eyebrow">WORKSPACE</p><nav>{(staff?[['/my-schedule','Jadwal & Logbook'],['/availability','Availability & Izin']]:links).map(([to,label])=><NavLink key={to} to={to}>{label}</NavLink>)}</nav><div className="identity"><strong>{profile.display_name}</strong><small>{profile.role.replaceAll('_',' ')}</small><button disabled={busy} onClick={()=>void run('Keluar',async()=>{const{error}=await db().auth.signOut();if(error)throw error;})}>Keluar</button></div></aside><main className="workspace"><header><div><p className="eyebrow">ORBIZ / OPERATOR MANAGEMENT</p><h1>{title}</h1></div>{profile.role==='super_admin'?<div className="segmented">{['jakarta','bandung'].map(c=><button disabled={busy} className={c===city?'selected':''} key={c} onClick={()=>{setCity(c);setMessage('');setActionError('');}}>{c==='jakarta'?'Jakarta':'Bandung'}</button>)}</div>:<span className="pill">{location==='jakarta'?'Jakarta':'Bandung'}</span>}</header><div className="toolbar"><label>Dari<input type="date" value={start} max={end} disabled={busy} onChange={e=>{if(e.target.value)setStart(e.target.value);}}/></label><label>Sampai<input type="date" value={end} min={start} disabled={busy} onChange={e=>{if(e.target.value)setEnd(e.target.value);}}/></label><button disabled={busy} onClick={()=>resetDates(monday(today()),addDays(monday(today()),6))}>Minggu ini</button><button disabled={busy} onClick={()=>{const p=calendarMonth(today());resetDates(p.start,p.end);}}>Bulan ini</button><small className="sync">WIB · {live?'Pembaruan langsung aktif':'Memeriksa pembaruan setiap 15 detik'}</small></div>{message&&<div className="notice success" role="status">{message}</div>}{actionError&&<div className="notice error" role="alert">{actionError}</div>}<div key={location+':'+path} aria-busy={busy}>{content}</div><footer>Orbiz Operator Management · Asia/Jakarta</footer></main></div>;
}
export function Metric({label,value}:{label:string;value:string|number}){return <article className="card metric"><p>{label}</p><strong>{value}</strong></article>;}
export function Status({value}:{value:string}){return <span className={'status '+value}>{({pending:'Menunggu',approved:'Disetujui',rejected:'Ditolak'} as Record<string,string>)[value]??value}</span>;}
export async function checked<T>({data,error}:{data:T;error:unknown}){if(error)throw error;return data;}
export const fields=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();return new FormData(e.currentTarget);};
