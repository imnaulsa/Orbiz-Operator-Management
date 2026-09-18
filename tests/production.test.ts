import {describe,it,expect,vi} from 'vitest';
vi.mock('../src/lib/supabase',()=>({db:vi.fn()}));
import {hostDailySummary,parseHours,type ProductionData} from '../src/lib/production';
describe('production domain',()=>{
 it('validates and deduplicates manual best hours',()=>{expect(parseHours('9, 10,9,19')).toEqual([9,10,19]);expect(()=>parseHours('24')).toThrow();expect(()=>parseHours('8.5')).toThrow();expect(()=>parseHours('abc')).toThrow();});
 it('summarizes actual eligible duration per host per WIB date',()=>{
  const data={sessions:[{id:'1',status:'published',host_id:'h',work_date:'2026-09-20',start_hour:8,end_hour:10,host_fee:20000},{id:'2',status:'published',host_id:'h',work_date:'2026-09-20',start_hour:19,end_hour:20,host_fee:30000},{id:'3',status:'draft',host_id:'h',work_date:'2026-09-20',start_hour:21,end_hour:22,host_fee:30000}],checks:[{session_id:'1',kind:'host',submitted_by:'h',actual_start:'2026-09-20T08:15:00+07:00',actual_end:'2026-09-20T09:45:00+07:00'}]} as ProductionData;
  const rows=hostDailySummary(data,'h');expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({planned:3,eligible:1.5,pending:1,estimated:70000,earned:30000});expect(hostDailySummary(data,'other')).toEqual([]);
 });
});
