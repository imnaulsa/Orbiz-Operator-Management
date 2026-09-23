import {useState,useEffect,useCallback,useRef,type ReactNode} from 'react';
import {hourLabel,prettyDate,today} from '../lib/domain';
import {errorText} from '../lib/supabase';
import {filterSchedule,schedulePage,selectedSchedule,scheduleSummary,matchingQuotations,resolveImport,type CalendarMode,type ScheduleFilters} from '../lib/schedule';
import {productionSnapshot,type LiveSession,type Quotation} from '../lib/production';
import type {ImportScheduleRow} from '../lib/scheduleExcel';
import {LiveCheckForm,LocationField,type Ctx} from './ProductionWorkspace';

export type ScheduleCalendar={mode:CalendarMode;change:(mode:CalendarMode,start:string,end?:string)=>void;refresh:()=>void};
type Props=Ctx & {calendar:ScheduleCalendar};
export function ScheduleDateToolbar({c,actions}:{c:Pick<Props,'calendar'|'start'|'end'|'busy'>;actions?:ReactNode}){
 const mode=c.calendar.mode;
 return <div className="toolbar schedule-toolbar"><div className="schedule-date-controls">
  <label>Filter tanggal<select value={mode} disabled={c.busy} onChange={e=>c.calendar.change(e.target.value as CalendarMode,c.start,c.end)}>
   <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="custom">Custom Date</option>
  </select></label>
  {mode==='monthly'?<label>Bulan / Tahun<input type="month" value={c.start.slice(0,7)} disabled={c.busy} onChange={e=>{if(e.target.value)c.calendar.change(mode,e.target.value+'-01')}}/></label>:
   mode==='custom'?<><label>Dari<input type="date" value={c.start} max={c.end} disabled={c.busy} onChange={e=>{if(e.target.value)c.calendar.change(mode,e.target.value,c.end)}}/></label><label>Sampai<input type="date" value={c.end} min={c.start} disabled={c.busy} onChange={e=>{if(e.target.value)c.calendar.change(mode,c.start,e.target.value)}}/></label></>:
   <label>{mode==='daily'?'Tanggal':'Tanggal acuan'}<input type="date" value={c.start} disabled={c.busy} onChange={e=>{if(e.target.value)c.calendar.change(mode,e.target.value)}}/></label>}
  <button disabled={c.busy} onClick={c.calendar.refresh}>Refresh</button>
 </div><div className="row-actions schedule-primary-actions">{actions}</div></div>;
}

export function StudioTimelinePage(c:Props){
 const [location,setLocation]=useState(c.profile.role==='super_admin'?'jakarta':c.location);
 const studios=c.data.studios.filter(s=>s.location_id===location);
 const sessions=c.data.sessions.filter(s=>s.location_id===location&&s.status!=='cancelled'&&s.work_date===c.start);
 const quotations=new Map(c.data.quotations.map(q=>[q.id,q]));
 return <><div className="toolbar"><label>Tanggal timeline<input type="date" value={c.start} disabled={c.busy} onChange={e=>{if(e.target.value)c.calendar.change('daily',e.target.value)}}/></label><LocationField c={c} value={location} onChange={setLocation}/><button disabled={c.busy} onClick={c.calendar.refresh}>Refresh</button></div>
  <section className="card"><h2>Studio Timeline · {prettyDate(c.start)}</h2><div className="table-wrap"><table className="studio-timeline"><thead><tr><th>Studio / kapasitas</th>{Array.from({length:24},(_,h)=><th key={h}>{hourLabel(h)}</th>)}</tr></thead><tbody>
   {studios.flatMap(st=>Array.from({length:st.capacity},(_,i)=><tr key={st.id+':'+i}><th>{st.name} / {i+1}</th>{Array.from({length:24},(_,h)=>{
    const s=sessions.find(x=>x.studio_id===st.id&&x.lane===i+1&&x.start_hour<=h&&x.end_hour>h),q=s?quotations.get(s.quotation_id):undefined;
    return <td key={h} className={s?'occupied '+s.status:''} title={s?`${s.live_code??'Sesi'} · ${q?.brand} · ${q?.platform} · ${hourLabel(s.start_hour)}–${hourLabel(s.end_hour)}`:'Kosong'}>{s?q?.brand:'—'}</td>;
   })}</tr>))}
  </tbody></table></div>{!studios.length&&<p className="empty">Belum ada studio di lokasi ini.</p>}<p className="muted">Terpakai {sessions.reduce((n,s)=>n+s.end_hour-s.start_hour,0)} dari {studios.reduce((n,s)=>n+s.capacity*24,0)} studio-jam. Mirror memakai satu kapasitas sesi.</p></section>
 </>;
}

export function ScheduleTablePage(c:Props){
 const [filters,setFilters]=useState<ScheduleFilters>({location:'all',platform:'all',brand:'all',host:'all'});
 const [scope,setScope]=useState<'all'|'mine'>('all');
 const [page,setPage]=useState(1),[size,setSize]=useState(10),[mode,setMode]=useState<'view'|'edit'|'delete'>('view');
 const [selected,setSelected]=useState<Set<string>>(()=>new Set()),[check,setCheck]=useState<LiveSession|null>(null);
 const [importRows,setImportRows]=useState<ImportScheduleRow[]>([]),[fileError,setFileError]=useState(''),[reading,setReading]=useState(false);
 const [importQuotes,setImportQuotes]=useState<Quotation[]>([]),[choices,setChoices]=useState<Record<number,string>>({});
 const [review,setReview]=useState<LiveSession[]|null>(null),[dirty,setDirty]=useState<Set<string>>(()=>new Set());
 const markDirty=useCallback((id:string,changed:boolean)=>setDirty(old=>{const next=new Set(old);if(changed)next.add(id);else next.delete(id);return next}),[]);
 const manager=['super_admin','operator_manager','host_manager'].includes(c.profile.role);
 const rows=filterSchedule(c.data,scope==='mine'?{...filters,host:c.profile.id}:filters),pagination=schedulePage(rows,page,size),selectedRows=selectedSchedule(rows,selected);
 const drafts=rows.filter(s=>s.status==='draft'||s.has_pending),hostDrafts=rows.filter(s=>s.status==='published'&&s.host_id&&(!s.host_published||s.has_pending)),working=c.busy||reading;
 const pending=c.data.sessions.filter(s=>s.has_pending);
 const editingCalendar={...c.calendar,change:(...args:Parameters<ScheduleCalendar['change']>)=>{if(mode!=='edit')c.calendar.change(...args)}};
 const quotations=new Map(c.data.quotations.map(q=>[q.id,q]));
 function filter(key:keyof ScheduleFilters,value:string){if(dirty.size){setFileError('Save perubahan baris sebelum mengganti filter.');return}setFilters(old=>({...old,[key]:value}));setPage(1);setSelected(new Set())}
 function toggle(id:string,checked:boolean){setSelected(old=>{const next=new Set(old);if(checked)next.add(id);else next.delete(id);return next})}
 async function remove(){
  if(!selectedRows.length||!window.confirm(`Hapus permanen ${selectedRows.length} jadwal terpilih? Checklist dan jam logbook terkait ikut hilang. Kuota quotation kembali tersedia.`))return;
  if(await c.act('sessions_delete',{ids:selectedRows.map(s=>s.id),confirm:true})){setSelected(new Set());setMode('view')}
 }
 async function publishHosts(){
  if(!hostDrafts.length||!window.confirm(`Publish ${hostDrafts.length} penugasan host pada seluruh hasil filter? Availability, rate, studio, dan perubahan tersimpan diperiksa kembali.`))return;
  await c.act('host_publish',{ids:hostDrafts.map(s=>s.id),versions:Object.fromEntries(hostDrafts.filter(s=>s.edit_version).map(s=>[s.id,s.edit_version!]))});
 }
 async function publishChanges(){
  const targets=review??[];
  if(!targets.length||dirty.size)return;
  if(await c.act('schedule_publish',{ids:targets.map(s=>s.id),versions:Object.fromEntries(targets.filter(s=>s.edit_version).map(s=>[s.id,s.edit_version!]))})){setReview(null);setMode('view');setDirty(new Set())}
 }
 async function readFile(file:File){
  setReading(true);setFileError('');setImportRows([]);
  try{
   const {readScheduleFile}=await import('../lib/scheduleExcel'),parsed=await readScheduleFile(file);
   const dates=parsed.map(r=>r.date).sort();
   if(Date.parse(dates[dates.length-1])-Date.parse(dates[0])>366*86400000)throw new Error('Pisahkan file import menjadi rentang maksimal 367 hari.');
   const snapshot=await productionSnapshot(c.profile.role==='super_admin'?null:c.location,dates[0],dates[dates.length-1]);
   setImportQuotes(snapshot.quotations);setChoices({});setImportRows(parsed);
  }catch(e){setFileError(errorText(e))}finally{setReading(false)}
 }
 let importProblem='';
 try{if(importRows.length)resolveImport(importRows,importQuotes,choices)}catch(e){importProblem=errorText(e)}
 async function confirmImport(){
  setFileError('');
  try{const rows=resolveImport(importRows,importQuotes,choices);if(await c.act('schedule_import',{rows}))setImportRows([])}catch(e){setFileError(errorText(e))}
 }
 async function exportRows(){
  setReading(true);setFileError('');
  try{const {exportSchedule}=await import('../lib/scheduleExcel');exportSchedule(rows,c.data,`Jadwal_${c.start}_${c.end}.xlsx`)}catch(e){setFileError(errorText(e))}finally{setReading(false)}
 }
 return <>
  <ScheduleDateToolbar c={{...c,calendar:editingCalendar,busy:working||mode==='edit'}} actions={manager&&<>
   <button disabled={working} aria-pressed={mode==='edit'} onClick={()=>{if(mode==='edit'){if(dirty.size){setFileError('Masih ada perubahan di baris yang belum di-Save. Simpan dulu sebelum selesai edit.');return}if(pending.length){setReview(pending.map(s=>({...s})));return}setMode('view')}else setMode('edit');setSelected(new Set())}}>{mode==='edit'?'Selesai edit':'Edit'}</button>
   <button disabled={working||mode==='edit'||!hostDrafts.length||hostDrafts.length>1000} onClick={()=>void publishHosts()}>Publish Host ({hostDrafts.length})</button>
   <button className="primary" disabled={working||mode==='edit'||!drafts.length||drafts.length>1000} onClick={()=>setReview(drafts.map(s=>({...s})))}>Publish All ({drafts.length})</button>
   <button className="danger" disabled={working||mode==='edit'} aria-pressed={mode==='delete'} onClick={()=>{setMode(mode==='delete'?'view':'delete');setSelected(new Set())}}>{mode==='delete'?'Batal pilih':'Delete'}</button>
  </>}/>
  {review&&<PublishReview error={c.actionError} busy={working} count={review.length} onCancel={()=>setReview(null)} onPublish={()=>void publishChanges()}/>}
  <section className="card schedule-table-card"><div className="section-head"><h2>Jadwal Livestreaming</h2><span>{rows.length} sesi · {c.start} – {c.end}</span></div>
   {!manager&&<p className="muted">Jadwal published · akses baca saja. Penugasan host muncul setelah Publish Host.</p>}
   {c.profile.role==='host'&&<div className="row-actions"><button aria-pressed={scope==='all'} onClick={()=>{setScope('all');setPage(1)}}>Semua Jadwal</button><button aria-pressed={scope==='mine'} onClick={()=>{setScope('mine');setPage(1)}}>Jadwal Saya</button></div>}
   <div className="form-grid schedule-filters"><label>Lokasi<select value={filters.location} disabled={working} onChange={e=>filter('location',e.target.value)}><option value="all">Semua</option><option value="jakarta">Jakarta</option><option value="bandung">Bandung</option></select></label>
    <label>Platform<select value={filters.platform} disabled={working} onChange={e=>filter('platform',e.target.value)}><option value="all">Semua</option><option>TikTok</option><option>Shopee</option><option>Mirror</option></select></label>
    <label>Brand<select value={filters.brand} disabled={working} onChange={e=>filter('brand',e.target.value)}><option value="all">Semua</option>{c.data.brands.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
    <label>Host<select value={filters.host} disabled={working} onChange={e=>filter('host',e.target.value)}><option value="all">Semua</option>{c.data.hosts.map(h=><option key={h.id} value={h.id}>{h.display_name}</option>)}</select></label>
   </div>
   <div className="schedule-secondary-actions"><label>Baris per halaman<select value={size} disabled={working} onChange={e=>{if(!dirty.size){setSize(Number(e.target.value));setPage(1)}}}>{[10,20,50,100].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
    <div className="row-actions"><button disabled={working||!rows.length} onClick={()=>void exportRows()}>Export Excel ({rows.length})</button>{manager&&<>
     <a className="button-link" href="/templates/livestream-schedule.xlsx" download>Template Excel</a>
     <label className="button-link import-file">{reading?'Membaca…':'Import Excel'}<input aria-label="Import Excel" type="file" accept=".xlsx" disabled={working} onChange={e=>{const f=e.target.files?.[0];if(f)void readFile(f);e.target.value=''}}/></label>
    </>}</div>
   </div>
   {fileError&&<div className="notice error" role="alert">{fileError}</div>}
   {manager&&importRows.length>0&&<div className="import-review"><h3>Review import · {importRows.length} sesi</h3><p>Quotation dicocokkan dari brand, platform, dan tanggal. Pilih periode jika ada beberapa pilihan. Jika belum tersedia, minta Admin Sales membuat quotation, lalu unggah ulang. Kuota dan bentrok diperiksa kembali saat menyimpan; satu baris gagal membatalkan seluruh import.</p>
    <div className="table-wrap" style={{maxHeight:360,overflow:'auto'}}><table><thead><tr><th>Baris</th><th>Tanggal / Jam</th><th>Brand / Platform</th><th>Lokasi / Studio</th><th>Periode quotation / sisa kuota</th></tr></thead><tbody>{importRows.map(r=>{const candidates=matchingQuotations(r,importQuotes);return <tr key={r.row}><td>{r.row}</td><td>{r.date}<br/>{hourLabel(r.start)}–{hourLabel(r.end)}</td><td>{r.brand}<br/>{r.platform}</td><td>{r.location}<br/>{r.studio}</td><td>{!candidates.length?'Quotation belum tersedia':<select aria-label={`Quotation baris ${r.row}`} value={choices[r.row]??(candidates.length===1?candidates[0].id:'')} disabled={working} onChange={e=>setChoices(old=>({...old,[r.row]:e.target.value}))}><option value="">Pilih periode quotation</option>{candidates.map(q=><option key={q.id} value={q.id}>{q.period_start} – {q.period_end} · {q.hours-q.allocated_hours} jam · {q.reference}</option>)}</select>}</td></tr>})}</tbody></table></div>
    {importProblem&&<p role="alert">{importProblem}</p>}
    <button className="primary" disabled={working||!!importProblem} onClick={()=>void confirmImport()}>Import {importRows.length} draft</button><button disabled={working} onClick={()=>setImportRows([])}>Batal import</button>
   </div>}
   {manager&&mode==='delete'&&<div className="row-actions"><button disabled={working||!rows.length||rows.length>1000} onClick={()=>setSelected(new Set(rows.map(s=>s.id)))}>Pilih semua hasil filter</button><button disabled={working} onClick={()=>setSelected(new Set())}>Kosongkan pilihan</button><button className="danger" disabled={working||!selectedRows.length||selectedRows.length>1000} onClick={()=>void remove()}>Hapus terpilih ({selectedRows.length})</button><small>Pilihan tetap tersimpan antarhalaman; ganti filter akan mengosongkan pilihan.</small></div>}
   {mode==='edit'&&<p className="muted">Ubah lokasi, studio, atau host, lalu Save setiap baris. Klik Selesai edit → Publish All untuk menerapkan perubahan. Staff tetap melihat versi published sebelumnya. Validasi kapasitas, availability, dan rate dilakukan saat publish.</p>}
   <div className="table-wrap"><table><thead><tr>{manager&&mode==='delete'&&<th><input type="checkbox" aria-label="Pilih semua di halaman ini" disabled={working||!pagination.rows.length} checked={pagination.rows.length>0&&pagination.rows.every(s=>selected.has(s.id))} onChange={e=>{const checked=e.target.checked;setSelected(old=>{const next=new Set(old);for(const s of pagination.rows){if(checked)next.add(s.id);else next.delete(s.id)}return next})}}/></th>}
    <th>Tanggal / Jam</th><th>Live ID</th><th>Brand</th><th>Platform</th><th>Lokasi</th><th>Studio</th><th>Host</th><th>Status</th><th>Checklist</th><th>Aksi</th></tr></thead><tbody>
    {pagination.rows.map(s=>{const q=quotations.get(s.quotation_id),hc=c.data.checks.some(x=>x.session_id===s.id&&x.kind==='host'),oc=c.data.checks.some(x=>x.session_id===s.id&&x.kind==='operator');
     const editable=mode==='edit'&&manager&&Date.parse(`${s.work_date}T${hourLabel(s.start_hour)}:00+07:00`)>Date.now()&&!hc&&!oc;
     return <tr key={s.id}>{manager&&mode==='delete'&&<td><input type="checkbox" aria-label={`Pilih ${q?.brand} ${s.work_date} ${hourLabel(s.start_hour)}`} checked={selected.has(s.id)} disabled={working} onChange={e=>toggle(s.id,e.target.checked)}/></td>}
      <td>{prettyDate(s.work_date)}<br/>{hourLabel(s.start_hour)}–{hourLabel(s.end_hour)}</td><td><strong>{s.live_code??'—'}</strong><small className="host-publication-label" title={s.legacy_live_id??undefined}>{s.live_label??'—'}</small></td><td>{q?.brand}</td><td>{q?.platform}</td>
      {editable?<SessionPlacement key={s.id+':edit:'+(s.edit_version??'')} c={c} session={s} onDirty={markDirty}/>:<><td>{s.location_id}</td><td>{c.data.studios.find(st=>st.id===s.studio_id)?.name}</td><td>{c.data.hosts.find(h=>h.id===s.host_id)?.display_name??'Belum ada'}{s.host_id&&<small className="host-publication-label">{s.host_published&&!s.has_pending?'Host published':'Host belum dipublish'}</small>}</td></>}
      <td><span className={'status '+s.status}>{s.status}</span>{s.has_pending&&<small className="host-publication-label">Perubahan belum dipublish</small>}</td><td>OP {oc?'✓':'—'} · Host {hc?'✓':'—'}</td><td><div className="row-actions compact">
       {manager&&(s.status==='draft'||s.has_pending)&&<button disabled={working||mode==='edit'} onClick={()=>void c.act('schedule_publish',{ids:[s.id],versions:s.edit_version?{[s.id]:s.edit_version}:{}})}>Publish</button>}
       {manager&&<button disabled={working||mode==='edit'} onClick={()=>{if(window.confirm('Batalkan sesi?'))void c.act('cancel',{location:s.location_id,id:s.id})}}>Batal</button>}
       {s.status==='published'&&((c.profile.role==='host'&&s.host_id===c.profile.id&&s.host_published&&!hc)||(c.profile.role==='staff'&&!oc))&&<button disabled={working} onClick={()=>setCheck(s)}>Check</button>}
      </div></td></tr>;
    })}
   </tbody></table>{!rows.length&&<p className="empty">Tidak ada jadwal pada filter ini. Pilih Monthly untuk melihat seluruh bulan, termasuk tanggal yang sudah lewat.</p>}</div>
   <div className="schedule-pagination"><span>{rows.length?`${(pagination.current-1)*size+1}–${Math.min(pagination.current*size,rows.length)}`:'0'} dari {rows.length} sesi</span><div className="row-actions" role="navigation" aria-label="Halaman jadwal">
    <button disabled={working||dirty.size>0||pagination.current===1} onClick={()=>setPage(pagination.current-1)}>Sebelumnya</button>
    {Array.from({length:pagination.pages},(_,i)=>i+1).filter(n=>n===1||n===pagination.pages||Math.abs(n-pagination.current)<=2).map((n,i,a)=><span key={n}>{i>0&&n>a[i-1]+1&&<span> … </span>}<button disabled={working||dirty.size>0} aria-current={n===pagination.current?'page':undefined} className={n===pagination.current?'primary':''} onClick={()=>setPage(n)}>{n}</button></span>)}
    <button disabled={working||dirty.size>0||pagination.current===pagination.pages} onClick={()=>setPage(pagination.current+1)}>Berikutnya</button>
   </div></div><p className="muted">{manager?'Export dan Publish All mengikuti seluruh hasil filter, termasuk halaman lain. Selesai edit mempublish semua perubahan tersimpan dalam rentang tanggal yang dibuka. Maksimal 1000 jadwal per publish dan 500 baris per import .xlsx.':'Export Excel mengikuti seluruh hasil filter, termasuk halaman lain.'}</p>
  </section>{check&&<LiveCheckForm c={c} session={check} close={()=>setCheck(null)}/>}</>;
}

export function ScheduleSummaryPage(c:Props){
 const [filters,setFilters]=useState<ScheduleFilters>({location:'all',platform:'all',brand:'all',host:'all'});
 const rows=scheduleSummary(filterSchedule(c.data,filters),c.data);
 return <><ScheduleDateToolbar c={c}/><section className="card"><h2>Ringkasan Jadwal</h2>
  <div className="form-grid"><label>Lokasi<select value={filters.location} onChange={e=>setFilters({...filters,location:e.target.value})}><option value="all">Semua</option><option value="jakarta">Jakarta</option><option value="bandung">Bandung</option></select></label>
   <label>Platform<select value={filters.platform} onChange={e=>setFilters({...filters,platform:e.target.value})}><option value="all">Semua</option><option>TikTok</option><option>Shopee</option><option>Mirror</option></select></label>
   <label>Brand<select value={filters.brand} onChange={e=>setFilters({...filters,brand:e.target.value})}><option value="all">Semua</option>{c.data.brands.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label></div>
  <p>{c.start} – {c.end} · <strong>{rows.reduce((n,r)=>n+r.hours,0)} jam</strong> · {rows.reduce((n,r)=>n+r.sessions,0)} sesi</p>
  <div className="table-wrap"><table><thead><tr><th>Brand</th><th>Platform</th><th>Lokasi</th><th>Total Jam Terjadwal</th></tr></thead><tbody>{rows.map(r=><tr key={r.key}><td>{r.brand}</td><td>{r.platform}</td><td>{r.location}</td><td>{r.hours}</td></tr>)}</tbody></table></div>
  {!rows.length&&<p className="empty">Belum ada jadwal pada filter ini.</p>}<p className="muted">Mencakup draft dan published. Sesi dibatalkan tidak dihitung. Mirror dihitung satu kali sesuai durasi sesi. Ini jam terjadwal, bukan jam aktual logbook.</p>
 </section></>;
}

export function PublishReview({busy,count,onCancel,onPublish,error}:{busy:boolean;count:number;error?:string;onCancel:()=>void;onPublish:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{dialog.current?.showModal()},[]);
 return <dialog ref={dialog} className="publish-review-dialog" aria-labelledby="publish-review-title" onCancel={e=>{e.preventDefault();if(!busy)onCancel()}}><h2 id="publish-review-title">Publish perubahan jadwal</h2><p>Perubahan jadwal harus dipublish dulu agar tampil di akun operator dan host. {count} jadwal akan dipublish. Penugasan host dalam perubahan ini juga akan disahkan.</p><p>Jika satu jadwal gagal validasi, seluruh batch dibatalkan. Cancel kembali ke edit; perubahan yang sudah di-Save tetap menunggu publish.</p><div role="alert">{error}</div><div className="row-actions"><button disabled={busy} onClick={onCancel}>Cancel</button><button className="primary" disabled={busy||count<1||count>1000} onClick={onPublish}>Publish All ({count})</button></div></dialog>;
}
export function SessionPlacement({c,session:s,onDirty}:{c:Ctx;session:LiveSession;onDirty:(id:string,dirty:boolean)=>void}){
 const [location,setLocation]=useState(s.location_id),[studio,setStudio]=useState(s.studio_id),[host,setHost]=useState(s.host_id??''),[message,setMessage]=useState('');
 const [search,setSearch]=useState('');
 const hosts=c.data.hosts.filter(h=>h.active&&h.location_id===location);
 const label=(id:string)=>{const h=hosts.find(h=>h.id===id);return h?(hosts.filter(other=>other.display_name===h.display_name).length>1?`${h.display_name} · ${h.id.slice(-8)}`:h.display_name):''};
 const changed=location!==s.location_id||studio!==s.studio_id||host!==(s.host_id??'');
 useEffect(()=>{onDirty(s.id,changed)},[onDirty,s.id,changed]);
 async function save(){
  setMessage('');
  if(await c.act('schedule_edit',{id:s.id,location,studio,host})){onDirty(s.id,false);setMessage('Tersimpan · perlu publish')}
 }
 return <><td><select aria-label="Edit lokasi" value={location} disabled={c.busy||c.profile.role!=='super_admin'} onChange={e=>{setLocation(e.target.value);setStudio('');setHost('');setSearch('');setMessage('')}}><option value="jakarta">Jakarta</option><option value="bandung">Bandung</option></select></td>
  <td><select aria-label="Edit studio" value={studio} disabled={c.busy} onChange={e=>setStudio(e.target.value)}><option value="">Pilih studio</option>{c.data.studios.filter(st=>st.location_id===location).map(st=><option key={st.id} value={st.id}>{st.name}</option>)}</select></td>
  <td><div className="host-placement"><input type="search" aria-label="Cari host" value={search} disabled={c.busy} placeholder="Cari nama host…" onChange={e=>setSearch(e.target.value)}/><select aria-label="Pilih host" value={host} disabled={c.busy} onChange={e=>setHost(e.target.value)}><option value="">Tanpa host</option>{hosts.filter(h=>h.id===host||h.display_name.toLowerCase().includes(search.toLowerCase())).map(h=><option key={h.id} value={h.id}>{label(h.id)}</option>)}</select><button className="host-save" disabled={c.busy||!studio||!changed} onClick={()=>void save()}>Save</button>{message&&<small role="status">{message}</small>}</div></td></>;
}
