import {describe,it,expect} from 'vitest';
import {scheduleRange,schedulePage,filterSchedule,selectedSchedule} from '../src/lib/schedule';
import {parseScheduleGrid,scheduleExportRows,scheduleHeaders} from '../src/lib/scheduleExcel';
import {logbookWorkbook} from '../src/lib/xlsx';
import {unzipSync,strFromU8} from 'fflate';
import type {ProductionData,LiveSession} from '../src/lib/production';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ScheduleTablePage} from '../src/components/ProductionSchedule';
import type {Ctx} from '../src/components/ProductionWorkspace';
const row=['2099-01-01','001','Brand A','Mirror','jakarta','Studio A',9,11,''];
describe('schedule calendar and pagination',()=>{
 it('renders ten rows and positions Edit, Publish All, Delete after Refresh',()=>{
  const sessions=Array.from({length:23},(_,i)=>({id:String(i),quotation_id:'q',studio_id:'st',location_id:'jakarta',work_date:'2099-01-01',start_hour:9,end_hour:11,status:'draft',host_id:null})) as LiveSession[];
  const c={data:{sessions,quotations:[{id:'q',brand_id:'b',reference:'Q1',brand:'Brand A',platform:'Mirror'}],brands:[{id:'b',name:'Brand A'}],studios:[{id:'st',name:'Studio A'}],hosts:[],checks:[]},profile:{role:'super_admin'},start:'2099-01-01',end:'2099-01-01',busy:false} as unknown as Ctx;
  const html=renderToStaticMarkup(createElement(ScheduleTablePage,{...c,calendar:{mode:'daily',change:()=>{},refresh:()=>{}}}));
  expect(html.split('<tbody>')[1].split('</tbody>')[0].match(/<tr>/g)).toHaveLength(10);
  expect(html).not.toContain('Shop ID');expect(html.indexOf('>Refresh<')).toBeLessThan(html.indexOf('>Edit<'));
  expect(html.indexOf('>Edit<')).toBeLessThan(html.indexOf('>Publish All'));
  expect(html.indexOf('>Publish All')).toBeLessThan(html.indexOf('>Delete<'));
  expect(html).toContain('Export Excel (23)');expect(html).toContain('Baris per halaman');
 });
 it('daily default uses the requested day; monthly includes earlier days',()=>{
  expect(scheduleRange('daily','2026-09-19')).toEqual({start:'2026-09-19',end:'2026-09-19'});
  expect(scheduleRange('monthly','2026-09-19')).toEqual({start:'2026-09-01',end:'2026-09-30'});
  expect(scheduleRange('monthly','2028-02-19').end).toBe('2028-02-29');
  expect(scheduleRange('weekly','2026-09-19')).toEqual({start:'2026-09-14',end:'2026-09-20'});
  expect(scheduleRange('custom','2026-08-15','2026-09-21').end).toBe('2026-09-21');
 });
 it('paginates and clamps the final page after rows are deleted',()=>{
  const rows=Array.from({length:23},(_,i)=>i+1);
  expect(schedulePage(rows,1,10).rows).toEqual(rows.slice(0,10));
  expect(schedulePage(rows,3,10).rows).toEqual([21,22,23]);
  expect(schedulePage(rows.slice(0,11),3,10).current).toBe(2);
  expect(schedulePage([],99,10)).toEqual({pages:1,current:1,rows:[]});
  for(const size of [20,50,100])expect(schedulePage(rows,1,size).rows).toHaveLength(Math.min(size,23));
 });
 it('filters all matching rows before pagination and excludes hidden selections',()=>{
  const sessions=Array.from({length:23},(_,i)=>({id:String(i),quotation_id:'q',location_id:i===22?'bandung':'jakarta',work_date:'2026-09-01',start_hour:i%24,status:'draft'})) as LiveSession[];
  const data={sessions,quotations:[{id:'q',brand_id:'b',platform:'Mirror'}]} as ProductionData;
  const all=filterSchedule(data,{location:'jakarta',platform:'Mirror',brand:'b',host:'all'});
  expect(all).toHaveLength(22);expect(schedulePage(all,1,10).rows).toHaveLength(10);
  expect(selectedSchedule(all,new Set(['0','22'])).map(s=>s.id)).toEqual(['0']);
 });
});
describe('schedule Excel import/export',()=>{
 it('preserves quotation identifiers and whole session duration',()=>{
  const parsed=parseScheduleGrid([scheduleHeaders,row]);expect(parsed[0]).toMatchObject({quotation:'001',start:9,end:11,date:'2099-01-01',host:'',host_id:''});
 });
 it('supports real Excel dates and typed HH:00 values',()=>{
  const parsed=parseScheduleGrid([scheduleHeaders,[...row.slice(0,6),'09:00','24:00','']]);expect(parsed[0].end).toBe(24);
  expect(parseScheduleGrid([scheduleHeaders,[46284,...row.slice(1)]])[0].date).toBe('2026-09-19');
 });
 it('rejects changed headers, impossible dates, empty hours, fractional hours and duplicates with row number',()=>{
  expect(()=>parseScheduleGrid([['Wrong'],row])).toThrow('Header');
  for(const changed of [['2026-02-30',...row.slice(1)],[...row.slice(0,6),'',11,''],[...row.slice(0,6),9.5,11,'']])expect(()=>parseScheduleGrid([scheduleHeaders,changed])).toThrow('Baris 2');
  expect(()=>parseScheduleGrid([scheduleHeaders,row,row])).toThrow('Baris 3');
 });
 it('ignores blank rows and accepts optional IDs from export',()=>{
  const parsed=parseScheduleGrid([scheduleHeaders,[],[...row,'host-uuid','draft','session-uuid']]);expect(parsed[0].row).toBe(3);expect(parsed[0].host_id).toBe('host-uuid');
 });
 it('exports all supplied rows, twelve columns, typed dates and formula-safe names',()=>{
  const data={quotations:[{id:'q',reference:'001',brand:'=Brand',platform:'Mirror'}],studios:[{id:'st',name:'Studio A'}],hosts:[]} as unknown as ProductionData;
  const sessions=Array.from({length:23},(_,i)=>({id:String(i),quotation_id:'q',studio_id:'st',location_id:'jakarta',work_date:'2099-01-01',start_hour:9,end_hour:11,status:'draft',host_id:null})) as LiveSession[];
  const rows=scheduleExportRows(sessions,data);expect(rows).toHaveLength(23);
  const bytes=logbookWorkbook(rows,[...scheduleHeaders,'Status','Session ID'],'Jadwal',[0]),zip=unzipSync(bytes),xml=strFromU8(zip['xl/worksheets/sheet1.xml']);
  expect(xml).toContain('A1:L24');expect(xml).toContain('r="A2" s="2"');expect(xml).not.toContain('<f>');
  expect(strFromU8(zip['xl/workbook.xml'])).toContain('name="Jadwal"');
  expect(parseScheduleGrid([scheduleHeaders,rows[0]])[0].quotation).toBe('001');
 });
});
