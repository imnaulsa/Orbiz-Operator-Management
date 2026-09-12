import {describe,it,expect} from 'vitest';
import {logbookPeriod,ranges} from '../src/lib/domain';
describe('feedback regressions',()=>{
 it('uses 21 previous month to 20 current month',()=>{expect(logbookPeriod('2026-09-20')).toEqual({start:'2026-08-21',end:'2026-09-20'});});
 it('moves period on the 21st across years',()=>{expect(logbookPeriod('2026-12-21')).toEqual({start:'2026-12-21',end:'2027-01-20'});expect(logbookPeriod('2026-01-01')).toEqual({start:'2025-12-21',end:'2026-01-20'});});
 it('summarizes full days without merging gaps',()=>{expect(ranges(Array.from({length:24},(_,h)=>h))).toEqual([{start:0,end:24}]);expect(ranges([9,10,13,13])).toEqual([{start:9,end:11},{start:13,end:14}]);});
});
