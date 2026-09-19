// Run a copy in a temporary directory with the Codex primary-runtime modules linked.
import fs from 'node:fs/promises';
import {Workbook,SpreadsheetFile} from '@oai/artifact-tool';
const output=process.argv[2];
if(!output)throw new Error('Pass an output directory');
const book=Workbook.create(),sheet=book.worksheets.add('Jadwal'),guide=book.worksheets.add('Panduan');
const headers=['Tanggal','Brand','Platform','Lokasi','Studio','Jam Mulai','Jam Selesai','Host','Host ID'];
sheet.getRange('A1:I1').values=[headers];
sheet.getRange('A1:I21').format.font={name:'Arial',size:10,color:'#252035'};
sheet.getRange('A1:I1').format={fill:'#7439C6',font:{name:'Arial',size:10,bold:true,color:'#FFFFFF'},rowHeight:28};
sheet.getRange('A2:I21').format.fill='#FFF9E8';
sheet.getRange('A1:I21').format.columnWidth=21;
sheet.getRange('B1:B21').format.columnWidth=26;
sheet.getRange('E1:E21').format.columnWidth=28;
sheet.getRange('H1:I21').format.columnWidth=32;
sheet.getRange('A2:A501').setNumberFormat('yyyy-mm-dd');
sheet.getRange('B2:E501').setNumberFormat('@');
sheet.getRange('F2:G501').setNumberFormat('0');
sheet.getRange('H2:I501').setNumberFormat('@');
sheet.getRange('C2:C501').dataValidation={rule:{type:'list',values:['TikTok','Shopee','Mirror']}};
sheet.getRange('D2:D501').dataValidation={rule:{type:'list',values:['jakarta','bandung']}};
sheet.dataValidations.add({range:'F2:F501',rule:{type:'whole',operator:'between',formula1:0,formula2:23}});
sheet.dataValidations.add({range:'G2:G501',rule:{type:'whole',operator:'between',formula1:1,formula2:24}});
sheet.freezePanes.freezeRows(1);sheet.showGridLines=false;sheet.tabColor='#7439C6';
guide.showGridLines=false;
guide.getRange('A1:B16').format.font={name:'Arial',size:10,color:'#252035'};
guide.getRange('A1').values=[['Import Jadwal Livestreaming']];guide.getRange('A1').format.font={name:'Arial',size:14,bold:true};
guide.getRange('A3:B15').values=[
 ['Kolom / aturan','Cara mengisi'],
 ['Tanggal','Tanggal Excel atau yyyy-mm-dd. Gunakan tanggal dan jam mendatang (WIB).'],
 ['Quotation di web','Dicocokkan dari brand, platform, dan tanggal. Pilih periode di web jika ada beberapa pilihan.'],
 ['Brand / Platform','Harus cocok dengan quotation. Platform: TikTok, Shopee, atau Mirror.'],
 ['Lokasi / Studio','jakarta atau bandung, lalu nama studio persis seperti Master Data.'],
 ['Jam Mulai / Jam Selesai','Angka jam bulat. Contoh 9 dan 11 = satu sesi 2 jam. Jam selesai 24 = tengah malam.'],
 ['Host','Opsional. Nama host aktif yang availability-nya sudah disetujui pada semua jam sesi.'],
 ['Host ID','Opsional. Gunakan ID dari export jika beberapa host memiliki nama sama.'],
 ['Pengisian','Isi sheet Jadwal mulai baris 2. Satu baris = satu sesi. Jangan ubah header.'],
 ['Batas file','Maksimal 500 sesi, rentang 367 hari, 5 MB. Format .xls lama perlu Save As .xlsx.'],
 ['Hasil import','Menambah draft baru. Import tidak mengedit atau menimpa jadwal yang sudah ada.'],
 ['Validasi','Kuota, studio, bentrok akun, dan availability host diperiksa. Satu baris gagal membatalkan semuanya.'],
 ['Export / Publish','Status dan Session ID dari export tidak mengubah hasil import. Publish dilakukan setelah review.'],
 ];
guide.getRange('A3:B3').format={fill:'#7439C6',font:{bold:true,color:'#FFFFFF'}};
guide.getRange('A1:A16').format.columnWidth=31;guide.getRange('B1:B16').format.columnWidth=105;
guide.getRange('A3:B15').format.rowHeight=28;
book.recalculate();
console.log((await book.inspect({kind:'table',range:'Jadwal!A1:I2',include:'values',tableMaxRows:2,tableMaxCols:9})).ndjson);
await fs.mkdir(output,{recursive:true});
for(const [name,range] of [['Jadwal','A1:I6'],['Panduan','A1:B15']]){
 const image=await book.render({sheetName:name,range,scale:1,format:'png'});
 await fs.writeFile(`${output}/${name}.png`,new Uint8Array(await image.arrayBuffer()));
}
await (await SpreadsheetFile.exportXlsx(book)).save(`${output}/livestream-schedule.xlsx`);
