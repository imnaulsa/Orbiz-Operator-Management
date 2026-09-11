import {describe,it,expect} from 'vitest';
import {ranges,groupAssignments,calendarMonth,monday,addDays,slotAllowed,type Assignment,type Slot,type Leave} from '../src/lib/domain';
import {allPages} from '../src/lib/data';
describe('business calendar and plotting',()=>{
 it('keeps separated ranges on one operator/day row',()=>{const r=groupAssignments([8,9,14].map(hour=>({operator_id:'a',work_date:'2026-09-11',hour} as Assignment)));expect(r).toHaveLength(1);expect(r[0].ranges).toEqual([{start:8,end:10},{start:14,end:15}]);});
 it('one hour remains a deletable range',()=>expect(ranges([8])).toEqual([{start:8,end:9}]));
 it('merges adjacent hours and deduplicates',()=>expect(ranges([9,8,9,10,15])).toEqual([{start:8,end:11},{start:15,end:16}]));
 it('never merges different operators or days',()=>expect(groupAssignments([{operator_id:'a',work_date:'2026-09-11',hour:8},{operator_id:'b',work_date:'2026-09-11',hour:8},{operator_id:'a',work_date:'2026-09-12',hour:8}] as Assignment[])).toHaveLength(3));
 it('calendar month handles leap years',()=>expect(calendarMonth('2028-02-10')).toEqual({start:'2028-02-01',end:'2028-02-29'}));
 it('Monday week crosses year correctly',()=>expect(monday('2027-01-01')).toBe('2026-12-28'));
 it('calendar arithmetic does not depend on machine timezone',()=>expect(addDays('2026-12-31',1)).toBe('2027-01-01'));
 it('rejects missing or pending availability',()=>{expect(slotAllowed('a','2026-09-11',8,[],[])).toBe(false);expect(slotAllowed('a','2026-09-11',8,[{operator_id:'a',work_date:'2026-09-11',hour:8,status:'pending'} as Slot],[])).toBe(false);});
 it('rejects partial-hour overlap with approved leave, not touching edges',()=>{const s=[{operator_id:'a',work_date:'2026-09-11',hour:8,status:'approved'} as Slot];const l={operator_id:'a',starts_at:'2026-09-11T08:30:00+07:00',ends_at:'2026-09-11T09:30:00+07:00',status:'approved'} as Leave;expect(slotAllowed('a','2026-09-11',8,s,[l])).toBe(false);expect(slotAllowed('a','2026-09-11',8,s,[{...l,starts_at:'2026-09-11T09:00:00+07:00'}])).toBe(true);});
 it('paginates beyond Supabase row cap',async()=>{const data=Array.from({length:1201},(_,i)=>i);expect(await allPages(async(a,b)=>({data:data.slice(a,b+1),error:null}))).toHaveLength(1201);});
 it('fails export data fetch instead of returning partial pages',async()=>{await expect(allPages(async(a)=>a?{data:null,error:new Error('network')}:{data:Array(500).fill(1),error:null})).rejects.toThrow('network');});
});
