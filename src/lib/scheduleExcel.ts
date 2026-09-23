import {unzipSync,strFromU8} from 'fflate';
import {logbookWorkbook} from './xlsx';
import type {LiveSession,ProductionData} from './production';

export const scheduleHeaders=['Tanggal','Brand','Platform','Lokasi','Studio','Jam Mulai','Jam Selesai','Host','Host ID'];
export type ImportScheduleRow={row:number;date:string;brand:string;platform:string;location:string;studio:string;start:number;end:number;host:string;host_id:string};
type Cell=string|number;
export function parseScheduleGrid(grid:Cell[][],date1904=false):ImportScheduleRow[]{
 if(!grid.length||scheduleHeaders.slice(0,8).some((h,i)=>String(grid[0]?.[i]??'').trim()!==h))throw new Error('Header tidak sesuai. Unduh Template Excel terbaru, sheet Jadwal, tanpa mengubah urutan kolom.');
 const output:ImportScheduleRow[]=[];
 for(let i=1;i<grid.length;i++){
  const cells=grid[i]??[];if(!cells.some(v=>String(v??'').trim()))continue;
  try{
   const text=(n:number)=>String(cells[n]??'').trim();
   let date=text(0);
   if(typeof cells[0]==='number'){
    const serial=cells[0];if(!Number.isInteger(serial)||serial<1||serial>2958465)throw new Error('Tanggal Excel tidak valid');
    date=new Date(Date.UTC(date1904?1904:1899,date1904?0:11,date1904?1:30)+serial*86400000).toISOString().slice(0,10);
   }
   if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw new Error('Tanggal harus yyyy-mm-dd atau sel tanggal Excel');
   const hour=(n:number)=>{const v=text(n);if(!v)throw new Error('Jam wajib diisi');const m=/^(\d{1,2}):00(?::00)?$/.exec(v);const h=m?Number(m[1]):Number(v);if(!Number.isInteger(h))throw new Error('Jam harus bulat, misalnya 9 atau 09:00');return h};
   const start=hour(5),end=hour(6);if(start<0||start>23||end<1||end>24||end<=start)throw new Error('Rentang jam tidak valid (mulai 0–23, selesai 1–24)');
   if([1,2,3,4].some(n=>!text(n)))throw new Error('Brand, platform, lokasi, dan studio wajib diisi');
   if(!['tiktok','shopee','mirror'].includes(text(2).toLowerCase()))throw new Error('Platform harus TikTok, Shopee, atau Mirror');
   output.push({row:i+1,date,brand:text(1),platform:text(2),location:text(3).toLowerCase(),studio:text(4),start,end,host:text(7),host_id:text(8)});
  }catch(e){throw new Error(`Baris ${i+1}: ${e instanceof Error?e.message:String(e)}`)}
 }
 if(!output.length||output.length>500)throw new Error('Isi 1–500 baris jadwal per import.');
 const seen=new Set<string>();for(const r of output){const key=[r.brand.toLowerCase(),r.platform.toLowerCase(),r.date,r.start,r.end].join('|');if(seen.has(key))throw new Error(`Baris ${r.row}: sesi duplikat dalam file.`);seen.add(key)}
 return output;
}

export function readScheduleWorkbook(bytes:Uint8Array):ImportScheduleRow[]{
 if(bytes.length>5*1024*1024)throw new Error('Ukuran file maksimal 5 MB.');
 let size=0;const files=unzipSync(bytes,{filter:f=>{size+=f.originalSize;if(size>25*1024*1024)throw new Error('Isi workbook terlalu besar.');return f.name.endsWith('.xml')||f.name.endsWith('.rels')}});
 const xml=(path:string)=>{
  const bytes=files[path];if(!bytes)throw new Error(`Workbook tidak valid: ${path} tidak ada.`);
  const text=strFromU8(bytes);if(/<!DOCTYPE/i.test(text))throw new Error('Format XML tidak didukung.');
  const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.getElementsByTagName('parsererror').length)throw new Error('XML workbook rusak.');return doc;
 };
 const tags=(root:Document|Element,name:string)=>Array.from(root.getElementsByTagNameNS('*',name));
 const book=xml('xl/workbook.xml'),sheet=tags(book,'sheet').find(s=>s.getAttribute('name')==='Jadwal');
 if(!sheet)throw new Error('Sheet Jadwal tidak ditemukan. Gunakan Template Excel.');
 const rel=tags(xml('xl/_rels/workbook.xml.rels'),'Relationship').find(r=>r.getAttribute('Id')===sheet.getAttribute('r:id'));
 if(!rel||rel.getAttribute('TargetMode')==='External')throw new Error('Sheet Jadwal tidak valid.');
 let path=rel.getAttribute('Target')??'';if(path.startsWith('/'))path=path.slice(1);else path='xl/'+path;
 if(path.includes('..'))throw new Error('Path worksheet tidak didukung.');
 const strings=files['xl/sharedStrings.xml']?tags(xml('xl/sharedStrings.xml'),'si').map(si=>tags(si,'t').map(t=>t.textContent??'').join('')):[];
 const styles=files['xl/styles.xml']?xml('xl/styles.xml'):null;
 const formats=new Map(styles?tags(styles,'numFmt').map(f=>[Number(f.getAttribute('numFmtId')),f.getAttribute('formatCode')??'']):[]);
 const xfs=styles?tags(styles,'cellXfs')[0]:undefined;
 const timeStyles=xfs?tags(xfs,'xf').map(f=>{const id=Number(f.getAttribute('numFmtId'));return [18,19,20,21,45,46,47].includes(id)||/h/i.test((formats.get(id)??'').replace(/"[^"]*"/g,''))}):[];
 const rows=tags(xml(path),'row'),grid:Cell[][]=[];
 if(rows.length>5020)throw new Error('Terlalu banyak baris. Gunakan template bersih dengan maksimal 500 sesi.');
 for(const row of rows){
  const r=Number(row.getAttribute('r'));if(!Number.isInteger(r)||r<1||r>5020)throw new Error('Nomor baris tidak valid.');
  const cells:Cell[]=[];
  for(const c of tags(row,'c')){
   const address=c.getAttribute('r')??'',col=/^([A-Z]+)\d+$/.exec(address)?.[1];if(!col)throw new Error('Alamat sel tidak valid.');
   const index=[...col].reduce((n,x)=>n*26+x.charCodeAt(0)-64,0)-1;if(index>13)continue;
   if(tags(c,'f').length)throw new Error(`Sel ${address}: gunakan nilai biasa, bukan formula.`);
   const t=c.getAttribute('t'),v=tags(c,'v')[0]?.textContent??'';
   let val:Cell=t==='inlineStr'?tags(c,'t').map(t=>t.textContent??'').join(''):t==='s'?strings[Number(v)]??'':t==='str'||t==='d'?v:v===''?'':Number(v);
   if(t==='e')throw new Error(`Sel ${address}: mengandung error Excel.`);
   if(t==='d'&&index===0)val=String(val).slice(0,10);
   if((index===5||index===6)&&typeof val==='number'&&(timeStyles[Number(c.getAttribute('s')??0)]||(val>0&&val<1)))val=Number((val*24).toFixed(8));
   cells[index]=val;
  }
  grid[r-1]=cells;
 }
 return parseScheduleGrid(grid,['1','true'].includes(tags(book,'workbookPr')[0]?.getAttribute('date1904')??''));
}
export async function readScheduleFile(file:File){
 if(!/\.xlsx$/i.test(file.name))throw new Error('Gunakan .xlsx. Untuk .xls lama, pilih Save As → Excel Workbook (.xlsx).');
 if(file.size>5*1024*1024)throw new Error('Ukuran file maksimal 5 MB.');
 return readScheduleWorkbook(new Uint8Array(await file.arrayBuffer()));
}
export function scheduleExportRows(sessions:LiveSession[],data:ProductionData):Cell[][]{
 const qs=new Map(data.quotations.map(q=>[q.id,q])),studios=new Map(data.studios.map(s=>[s.id,s])),hosts=new Map(data.hosts.map(h=>[h.id,h]));
 return sessions.map(s=>{const q=qs.get(s.quotation_id);return [Date.parse(s.work_date+'T00:00:00Z')/86400000+25569,q?.brand??'',q?.platform??'',s.location_id,studios.get(s.studio_id)?.name??'',s.start_hour,s.end_hour,hosts.get(s.host_id??'')?.display_name??'',s.host_id??'',s.status,s.id,s.live_code??'',s.live_label??'',s.legacy_live_id??'']});
}
export function exportSchedule(sessions:LiveSession[],data:ProductionData,filename:string){
 const bytes=logbookWorkbook(scheduleExportRows(sessions,data),[...scheduleHeaders,'Status','Session ID','Live ID','Label Jadwal','Legacy Live ID'],'Jadwal',[0]);
 const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
 const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
