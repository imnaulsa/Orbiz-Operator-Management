import {it,expect} from 'vitest';
import {unzipSync,strFromU8} from 'fflate';
import {writeFileSync} from 'node:fs';
import {logbookWorkbook} from '../src/lib/xlsx';
it('creates a real OOXML workbook with six columns, numeric hours and safe text',()=>{
 const bytes=logbookWorkbook([['Jumat, 11 Sep 2026','=HYPERLINK("https://example.invalid") & <TEST>','Jakarta','08:00','09:00',1]]);
 expect(bytes[0]).toBe(0x50);expect(bytes[1]).toBe(0x4b);
 const zip=unzipSync(bytes);const sheet=strFromU8(zip['xl/worksheets/sheet1.xml']);
 expect(sheet).toContain('<c r="F2"><v>1</v></c>');expect(sheet).toContain('&amp; &lt;TEST&gt;');expect(sheet).not.toContain('<f>');expect(Object.keys(zip)).toHaveLength(6);
 writeFileSync('/tmp/orbiz-logbook-test.xlsx',bytes);
});
