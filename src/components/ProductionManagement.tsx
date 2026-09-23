import {useState, type FormEvent} from 'react';
import {money} from '../lib/domain';
import type {ProductionData, Quotation} from '../lib/production';
import type {Ctx} from './ProductionWorkspace';

const value=(f:FormData,key:string)=>String(f.get(key)??'');
const formData=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();return new FormData(e.currentTarget)};

export function QuotationPage(c:Ctx){
 const canEdit=['super_admin','admin_sales'].includes(c.profile.role);
 const [edit,setEdit]=useState<Quotation|null>(null);
 async function save(e:FormEvent<HTMLFormElement>){
  const form=e.currentTarget,f=formData(e);
  const ok=await c.act(edit?'quotation_edit':'quotation',{
   id:edit?.id,reference:value(f,'reference'),brand:value(f,'brand'),platform:value(f,'platform'),
   period_start:value(f,'period_start'),period_end:value(f,'period_end'),hours:Number(f.get('hours')),rate:Number(f.get('rate')),
  });
  if(ok){setEdit(null);form.reset()}
 }
 return <>
  {canEdit&&<section className="card">
   <h2>{edit?'Edit quotation':'Input quotation → kuota jam live'}</h2>
   <form key={edit?.id??'new'} onSubmit={e=>void save(e)}><fieldset disabled={c.busy}><div className="form-grid">
    <label>Nomor quotation<input name="reference" defaultValue={edit?.reference} required maxLength={120}/></label>
    <label>Brand<select name="brand" defaultValue={edit?.brand_id??''} required><option value="">Pilih brand</option>{c.data.brands.filter(b=>b.active||b.id===edit?.brand_id).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
    <label>Platform<select name="platform" defaultValue={edit?.platform??'TikTok'}><option>TikTok</option><option>Shopee</option><option>Mirror</option></select></label>
    <label>Periode mulai<input name="period_start" type="date" required defaultValue={edit?.period_start??c.start}/></label>
    <label>Periode akhir<input name="period_end" type="date" required defaultValue={edit?.period_end??c.end}/></label>
    <label>Kuota jam<input name="hours" type="number" min="1" max="10000" step="1" defaultValue={edit?.hours} required/></label>
    <label>Rate quotation / jam<input name="rate" type="number" min="0" step="0.01" defaultValue={edit?.rate} required/></label>
   </div><p className="muted">Nilai quotation dibulatkan ke ribuan terdekat. Jika sudah ada jadwal, brand/platform tidak bisa diganti; kuota dan periode harus tetap mencakup jadwal aktif.</p>
   <div className="row-actions"><button className="primary">{edit?'Simpan perubahan':'Simpan quotation'}</button>{edit&&<button type="button" onClick={()=>setEdit(null)}>Batal edit</button>}</div>
   </fieldset></form>
  </section>}
  {!canEdit&&<p className="notice">Akses lihat Quotation & Kuota.</p>}
  <section className="card"><h2>Quota tracker</h2><div className="table-wrap"><table>
   <thead><tr><th>Quotation / Brand</th><th>Shop ID</th><th>Platform</th><th>Periode</th><th>Kuota</th><th>Terplot</th><th>Sisa</th><th>Nilai quotation</th>{canEdit&&<th>Aksi</th>}</tr></thead>
   <tbody>{c.data.quotations.map(q=><tr key={q.id}>
    <td>{q.reference}<br/>{q.brand}</td><td>{q.account}</td><td>{q.platform}</td><td>{q.period_start} – {q.period_end}</td><td>{q.hours} jam</td><td>{q.allocated_hours} jam</td><td>{q.hours-q.allocated_hours} jam</td><td>{q.rate===undefined?'—':money(Math.round(q.rate*q.hours/1000)*1000)}</td>
    {canEdit&&<td><div className="row-actions compact"><button disabled={c.busy} onClick={()=>setEdit(q)}>Edit</button><button className="danger" disabled={c.busy} onClick={()=>{
     if(window.confirm(`Hapus quotation ${q.reference} (${q.brand})?\nSEMUA jadwal terkait di seluruh tanggal/lokasi, termasuk checklist, akan dihapus permanen. Jam logbook dan estimasi cost dari sesi tersebut juga hilang. Tidak bisa dibatalkan.`))
      void c.act('quotation_delete',{id:q.id,confirm:true}).then(ok=>{if(ok&&edit?.id===q.id)setEdit(null)});
    }}>Delete</button></div></td>}
   </tr>)}</tbody>
  </table>{!c.data.quotations.length&&<p className="empty">Belum ada quotation pada periode ini.</p>}</div></section>
 </>;
}

export function MasterDataPage(c:Ctx){
 const canEdit=c.profile.role==='super_admin';
 const [brand,setBrand]=useState<ProductionData['brands'][number]|null>(null);
 const [studio,setStudio]=useState<ProductionData['studios'][number]|null>(null);
 async function saveBrand(e:FormEvent<HTMLFormElement>){
  const form=e.currentTarget,f=formData(e);
  if(await c.act(brand?'brand_edit':'master_brand',{id:brand?.id,name:value(f,'name'),tiktok:value(f,'tiktok'),shopee:value(f,'shopee'),mirror:value(f,'mirror')})){setBrand(null);form.reset()}
 }
 async function saveStudio(e:FormEvent<HTMLFormElement>){
  const form=e.currentTarget,f=formData(e);
  if(await c.act(studio?'studio_edit':'studio',{id:studio?.id,name:value(f,'name'),location:value(f,'location'),capacity:Number(f.get('capacity'))})){setStudio(null);form.reset()}
 }
 return <>
  <section className="card"><h2>Master Brand & Shop ID</h2>
   {canEdit&&<form key={brand?.id??'new'} onSubmit={e=>void saveBrand(e)}><fieldset disabled={c.busy}><div className="form-grid">
    <label>Nama brand<input name="name" defaultValue={brand?.name} required maxLength={120}/></label>
    <label>TikTok Shop ID<input name="tiktok" defaultValue={brand?.shop_id_tiktok??''} placeholder="TT-FONTERRA" pattern="TT.*"/></label>
    <label>Shopee Shop ID<input name="shopee" defaultValue={brand?.shop_id_shopee??''} placeholder="SP-FONTERRA" pattern="SP.*"/></label>
    <label>Mirror ID<input name="mirror" defaultValue={brand?.shop_id_mirror??''} placeholder="ST-FONTERRA" pattern="ST.*"/></label>
   </div><div className="row-actions"><button className="primary">{brand?'Simpan perubahan brand':'Tambah brand'}</button>{brand&&<button type="button" onClick={()=>setBrand(null)}>Batal edit</button>}</div></fieldset></form>}
   <p className="muted">{canEdit?'Brand yang masih dipakai quotation tidak bisa dihapus atau diganti Shop ID-nya. Perubahan nama ikut memperbarui nama di quotation.':'Akses lihat master brand dan Shop ID.'}</p>
   <div className="table-wrap"><table><thead><tr><th>Brand</th><th>TikTok</th><th>Shopee</th><th>Mirror</th>{canEdit&&<th>Aksi</th>}</tr></thead><tbody>{c.data.brands.map(b=><tr key={b.id}>
    <td>{b.name}</td><td>{b.shop_id_tiktok??'—'}</td><td>{b.shop_id_shopee??'—'}</td><td>{b.shop_id_mirror??'—'}</td>{canEdit&&<td><div className="row-actions compact">
     <button disabled={c.busy} onClick={()=>setBrand(b)}>Edit</button><button className="danger" disabled={c.busy} onClick={()=>{if(window.confirm(`Hapus master brand ${b.name} secara permanen? Brand yang masih dipakai quotation tidak dapat dihapus.`))void c.act('brand_delete',{id:b.id}).then(ok=>{if(ok&&brand?.id===b.id)setBrand(null)})}}>Delete</button>
    </div></td>}</tr>)}</tbody></table></div>
  </section>
  <section className="card"><h2>Master Studio & Lokasi</h2>
   {canEdit&&<form key={studio?.id??'new'} onSubmit={e=>void saveStudio(e)}><fieldset disabled={c.busy}><div className="form-grid">
    <label>Lokasi<select name="location" defaultValue={studio?.location_id??'jakarta'}><option value="jakarta">Jakarta</option><option value="bandung">Bandung</option></select></label>
    <label>Nama studio<input name="name" defaultValue={studio?.name} required maxLength={120}/></label>
    <label>Kapasitas live bersamaan<input name="capacity" type="number" min="1" max="50" step="1" defaultValue={studio?.capacity??1} required/></label>
   </div><div className="row-actions"><button className="primary">{studio?'Simpan perubahan studio':'Tambah studio'}</button>{studio&&<button type="button" onClick={()=>setStudio(null)}>Batal edit</button>}</div></fieldset></form>}
   <p className="muted">{canEdit?'Studio yang masih memiliki jadwal tidak bisa dihapus atau dipindahkan lokasinya. Kapasitas tidak boleh kurang dari slot jadwal terpakai.':'Akses lihat master studio pada lokasi akun.'}</p>
   <div className="table-wrap"><table><thead><tr><th>Lokasi</th><th>Studio</th><th>Kapasitas</th>{canEdit&&<th>Aksi</th>}</tr></thead><tbody>{c.data.studios.map(s=><tr key={s.id}>
    <td>{s.location_id}</td><td>{s.name}</td><td>{s.capacity} live bersamaan</td>{canEdit&&<td><div className="row-actions compact">
     <button disabled={c.busy} onClick={()=>setStudio(s)}>Edit</button><button className="danger" disabled={c.busy} onClick={()=>{if(window.confirm(`Hapus studio ${s.name} (${s.location_id}) secara permanen? Studio yang masih dipakai jadwal tidak dapat dihapus.`))void c.act('studio_delete',{id:s.id}).then(ok=>{if(ok&&studio?.id===s.id)setStudio(null)})}}>Delete</button>
    </div></td>}</tr>)}</tbody></table></div>
  </section>
 </>;
}
