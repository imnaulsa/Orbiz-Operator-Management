import { strToU8, zipSync } from 'fflate';
import type { Database, Json } from './database.generated';
import type { LiveSession, ProductionData, Quotation } from './production';
import { hourLabel } from './domain';

type Row<K extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][K]['Row'];

export interface ManagementDataRow {
  session: LiveSession;
  quotation?: Quotation;
  brandName: string;
  platform: string;
  location: string;
  studioName: string;
  lane: number;
  hostName: string;
  status: string;
  plannedHours: number;
  // Host Check & Feedback
  hostCheck?: Row<'live_checks'>;
  hostCheckStatus: 'Sudah' | 'Belum';
  hostActualStart: string;
  hostActualEnd: string;
  hostActualHours: number;
  hostReady: boolean | null;
  hostBrief: boolean | null;
  hostNote: string;
  hostSubmittedAt: string;
  // Operator Check & Feedback
  opCheck?: Row<'live_checks'>;
  opCheckStatus: 'Sudah' | 'Belum';
  opAudio: boolean | null;
  opCamera: boolean | null;
  opNetwork: boolean | null;
  opNote: string;
  opOperatorName: string;
  opSubmittedAt: string;
  // Overall Evaluation
  evaluationStatus: 'Lengkap' | 'Hanya Host' | 'Hanya OP' | 'Belum Check';
  hasNotes: boolean;
}

export function formatTimeWib(isoString?: string | null): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d) + ' WIB';
  } catch {
    return '—';
  }
}

export function formatDateTimeWib(isoString?: string | null): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d) + ' WIB';
  } catch {
    return '—';
  }
}

const INDONESIAN_DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

export function getIndonesianDay(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00Z');
    return INDONESIAN_DAYS[d.getUTCDay()] ?? '';
  } catch {
    return '';
  }
}

export function prepareManagementRows(
  data: ProductionData,
  profileNames: Record<string, string> = {}
): ManagementDataRow[] {
  const quotations = new Map(data.quotations.map((q) => [q.id, q]));
  const studios = new Map(data.studios.map((s) => [s.id, s]));
  const hosts = new Map(data.hosts.map((h) => [h.id, h]));
  const brands = new Map(data.brands.map((b) => [b.id, b]));

  return data.sessions.map((s) => {
    const q = quotations.get(s.quotation_id);
    const brand = (q?.brand_id ? brands.get(q.brand_id)?.name : null) ?? q?.brand ?? '—';
    const platform = q?.platform ?? '—';
    const studio = studios.get(s.studio_id)?.name ?? '—';
    const host = s.host_id ? (hosts.get(s.host_id)?.display_name ?? profileNames[s.host_id] ?? '—') : 'Belum Ditugaskan';

    const hostCheck = data.checks.find(
      (c) => c.session_id === s.id && c.kind === 'host'
    );
    const opCheck = data.checks.find(
      (c) => c.session_id === s.id && c.kind === 'operator'
    );

    const plannedHours = Math.max(0, s.end_hour - s.start_hour);

    // Host check details
    const hostAnswers =
      hostCheck?.answers && typeof hostCheck.answers === 'object' && !Array.isArray(hostCheck.answers)
        ? (hostCheck.answers as Record<string, Json | undefined>)
        : {};

    const hostActualHours =
      hostCheck?.actual_start && hostCheck.actual_end
        ? Math.max(
            0,
            (Date.parse(hostCheck.actual_end) - Date.parse(hostCheck.actual_start)) / 3600000
          )
        : 0;

    const hostReady = hostCheck ? Boolean(hostAnswers['ready']) : null;
    const hostBrief = hostCheck ? Boolean(hostAnswers['brief']) : null;
    const hostNote = (hostCheck?.note ?? '').trim();

    // Operator check details
    const opAnswers =
      opCheck?.answers && typeof opCheck.answers === 'object' && !Array.isArray(opCheck.answers)
        ? (opCheck.answers as Record<string, Json | undefined>)
        : {};

    const opAudio = opCheck ? Boolean(opAnswers['audio']) : null;
    const opCamera = opCheck ? Boolean(opAnswers['camera']) : null;
    const opNetwork = opCheck ? Boolean(opAnswers['network']) : null;
    const opNote = (opCheck?.note ?? '').trim();
    const opOperatorName = opCheck
      ? (profileNames[opCheck.submitted_by] ?? hosts.get(opCheck.submitted_by)?.display_name ?? 'Petugas OP')
      : '—';

    // Status evaluation
    let evaluationStatus: ManagementDataRow['evaluationStatus'] = 'Belum Check';
    if (hostCheck && opCheck) evaluationStatus = 'Lengkap';
    else if (hostCheck) evaluationStatus = 'Hanya Host';
    else if (opCheck) evaluationStatus = 'Hanya OP';

    const hasNotes = Boolean(hostNote || opNote);

    return {
      session: s,
      quotation: q,
      brandName: brand,
      platform,
      location: s.location_id === 'jakarta' ? 'Jakarta' : s.location_id === 'bandung' ? 'Bandung' : s.location_id,
      studioName: studio,
      lane: s.lane,
      hostName: host,
      status: s.status,
      plannedHours,
      // Host
      hostCheck,
      hostCheckStatus: hostCheck ? 'Sudah' : 'Belum',
      hostActualStart: formatTimeWib(hostCheck?.actual_start),
      hostActualEnd: formatTimeWib(hostCheck?.actual_end),
      hostActualHours,
      hostReady,
      hostBrief,
      hostNote,
      hostSubmittedAt: formatDateTimeWib(hostCheck?.created_at),
      // OP
      opCheck,
      opCheckStatus: opCheck ? 'Sudah' : 'Belum',
      opAudio,
      opCamera,
      opNetwork,
      opNote,
      opOperatorName,
      opSubmittedAt: formatDateTimeWib(opCheck?.created_at),
      // Evaluation
      evaluationStatus,
      hasNotes,
    };
  });
}

// Robust column converter: 0 -> 'A', 25 -> 'Z', 26 -> 'AA', 27 -> 'AB', etc.
export function getExcelColumnLetter(colIndex: number): string {
  let temp = colIndex;
  let letter = '';
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

const escapeXml = (value: string) =>
  value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

export const MANAGEMENT_EXCEL_HEADERS = [
  'No',
  'Tanggal',
  'Hari',
  'Mulai',
  'Selesai',
  'Durasi',
  'ID Live',
  'Label Sesi',
  'Brand',
  'Platform',
  'Lokasi',
  'Studio',
  'Slot',
  'Host',
  'Status',
  'Cek Host',
  'Mulai Real',
  'Selesai Real',
  'Durasi Real',
  'Alat',
  'Brief',
  'Catatan Host',
  'Submit Host',
  'Cek OP',
  'Audio',
  'Kamera',
  'Jaringan',
  'Catatan OP',
  'Operator',
  'Submit OP',
  'Evaluasi',
];

export const MANAGEMENT_COLUMN_WIDTHS = [
  5,    // 0: No
  11,   // 1: Tanggal (2026-10-26)
  8,    // 2: Hari (Senin, Selasa...)
  7,    // 3: Mulai (09:00)
  7,    // 4: Selesai (11:00)
  7,    // 5: Durasi (1, 2, 3...)
  10,   // 6: ID Live (LV-001...)
  15,   // 7: Label Sesi (Morning Show...)
  15,   // 8: Brand (Skintific, Somethinc...)
  9,    // 9: Platform (TikTok, Shopee...)
  8,    // 10: Lokasi (Jakarta, Bandung)
  9,    // 11: Studio (Studio 1...)
  5,    // 12: Slot (1, 2)
  13,   // 13: Host (Sarah Host...)
  9,    // 14: Status (published...)
  8.5,  // 15: Cek Host (Sudah / Belum)
  9.5,  // 16: Mulai Real (09:00 WIB)
  9.5,  // 17: Selesai Real (11:00 WIB)
  9.5,  // 18: Durasi Real (2.00)
  7,    // 19: Alat (Siap / Kendala / —)
  7,    // 20: Brief (Siap / Belum / —)
  24,   // 21: Catatan Host
  13,   // 22: Submit Host (26 Okt, 11:05)
  8.5,  // 23: Cek OP (Sudah / Belum)
  7,    // 24: Audio (OK / Kendala / —)
  7,    // 25: Kamera (OK / Kendala / —)
  8.5,  // 26: Jaringan (OK / Kendala / —)
  24,   // 27: Catatan OP
  12,   // 28: Operator (Budi OP...)
  13,   // 29: Submit OP (26 Okt, 08:50)
  10,   // 30: Evaluasi (Lengkap / Hanya Host...)
];

export function buildManagementExcelRows(rows: ManagementDataRow[]): (string | number)[][] {
  return rows.map((r, index) => {
    const s = r.session;
    const day = getIndonesianDay(s.work_date);
    const startHourStr = hourLabel(s.start_hour);
    const endHourStr = hourLabel(s.end_hour);

    const hostReadyStr = r.hostReady === null ? '—' : r.hostReady ? 'Siap' : 'Kendala';
    const hostBriefStr = r.hostBrief === null ? '—' : r.hostBrief ? 'Siap' : 'Belum';

    const opAudioStr = r.opAudio === null ? '—' : r.opAudio ? 'OK' : 'Kendala';
    const opCameraStr = r.opCamera === null ? '—' : r.opCamera ? 'OK' : 'Kendala';
    const opNetworkStr = r.opNetwork === null ? '—' : r.opNetwork ? 'OK' : 'Kendala';

    return [
      index + 1,
      s.work_date,
      day,
      startHourStr,
      endHourStr,
      r.plannedHours,
      s.live_code || '—',
      s.live_label || '—',
      r.brandName,
      r.platform,
      r.location,
      r.studioName,
      r.lane,
      r.hostName,
      r.status,
      r.hostCheckStatus,
      r.hostActualStart,
      r.hostActualEnd,
      Number(r.hostActualHours.toFixed(2)),
      hostReadyStr,
      hostBriefStr,
      r.hostNote || '—',
      r.hostSubmittedAt,
      r.opCheckStatus,
      opAudioStr,
      opCameraStr,
      opNetworkStr,
      r.opNote || '—',
      r.opOperatorName,
      r.opSubmittedAt,
      r.evaluationStatus,
    ];
  });
}

/**
 * Builds a clean, compact, professional OpenXML (.xlsx) workbook for Management Data.
 * Includes:
 * - Proper XML escaping
 * - Safe column coordinates (>26 columns supported)
 * - Brand Purple header styling with white bold font
 * - Clean thin borders (#DCD6E6)
 * - Compact row height (21pt header, 17pt body rows)
 * - Tailored column widths to prevent excessive horizontal scrolling
 * - Subtle alternating zebra striping (#F9F8FB)
 * - Frozen header row
 * - Full-table AutoFilter
 */
export function createManagementWorkbook(
  rows: ManagementDataRow[],
  sheetName = 'Jadwal & Feedback Live'
): Uint8Array {
  const dataRows = buildManagementExcelRows(rows);
  const headers = MANAGEMENT_EXCEL_HEADERS;
  const numColumns = headers.length;
  const lastColLetter = getExcelColumnLetter(numColumns - 1);
  const totalRows = dataRows.length + 1; // 1 header row + N data rows

  // Style IDs:
  // s="1" : Header (Purple background, white bold text, centered, thin border)
  // s="2" : Number (Right aligned, plain white)
  // s="3" : Centered text (Dates, times, status, plain white)
  // s="4" : Left aligned text (General text, notes, plain white, no multiline wrap)
  // s="5" : Number (Right aligned, zebra stripe)
  // s="6" : Centered text (Dates, times, status, zebra stripe)
  // s="7" : Left aligned text (General text, zebra stripe, no multiline wrap)
  const centeredCols = new Set([
    0, 1, 2, 3, 4, 6, 9, 10, 11, 12, 14, 15, 16, 17, 19, 20, 22, 23, 24, 25, 26, 29, 30,
  ]);
  const numberCols = new Set([5, 18]); // planned hours, actual hours

  const cellXmlList: string[] = [];

  // Header Row (Row 1): Compact 21pt height
  const headerCells = headers
    .map((h, colIdx) => {
      const ref = `${getExcelColumnLetter(colIdx)}1`;
      return `<c r="${ref}" t="inlineStr" s="1"><is><t xml:space="preserve">${escapeXml(h)}</t></is></c>`;
    })
    .join('');
  cellXmlList.push(`<row r="1" ht="21" customHeight="1">${headerCells}</row>`);

  // Data Rows (Row 2 .. N+1): Compact 17pt height with zebra striping
  dataRows.forEach((row, rowIdx) => {
    const rowNum = rowIdx + 2;
    const isZebra = rowIdx % 2 === 1;

    const rowCells = row
      .map((val, colIdx) => {
        const ref = `${getExcelColumnLetter(colIdx)}${rowNum}`;
        if (typeof val === 'number') {
          const styleId = isZebra ? '5' : '2';
          return `<c r="${ref}" s="${styleId}"><v>${val}</v></c>`;
        }
        const textVal = String(val ?? '');
        const styleId = centeredCols.has(colIdx)
          ? isZebra ? '6' : '3'
          : isZebra ? '7' : '4';
        return `<c r="${ref}" t="inlineStr" s="${styleId}"><is><t xml:space="preserve">${escapeXml(textVal)}</t></is></c>`;
      })
      .join('');
    cellXmlList.push(`<row r="${rowNum}" ht="17" customHeight="1">${rowCells}</row>`);
  });

  const colsXml = MANAGEMENT_COLUMN_WIDTHS.map(
    (w, idx) => `<col min="${idx + 1}" max="${idx + 1}" width="${w}" customWidth="1"/>`
  ).join('');

  const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

  const files: Record<string, string> = {
    '[Content_Types].xml':
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '</Types>',
    '_rels/.rels':
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>',
    'xl/workbook.xml':
      `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets>` +
      `</workbook>`,
    'xl/_rels/workbook.xml.rels':
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>',
    'xl/styles.xml':
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<fonts count="2">' +
      '<font><sz val="9.5"/><name val="Segoe UI"/></font>' + // 0: Normal 9.5pt
      '<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Segoe UI"/></font>' + // 1: Header Bold White 10pt
      '</fonts>' +
      '<fills count="4">' +
      '<fill><patternFill patternType="none"/></fill>' + // 0
      '<fill><patternFill patternType="gray125"/></fill>' + // 1
      '<fill><patternFill patternType="solid"><fgColor rgb="FF6C32B9"/><bgColor indexed="64"/></patternFill></fill>' + // 2: Brand Purple
      '<fill><patternFill patternType="solid"><fgColor rgb="FFF9F8FB"/><bgColor indexed="64"/></patternFill></fill>' + // 3: Subtle Zebra Stripe
      '</fills>' +
      '<borders count="2">' +
      '<border><left/><right/><top/><bottom/><diagonal/></border>' + // 0: None
      '<border>' + // 1: Clean thin border
      '<left style="thin"><color rgb="FFDCD6E6"/></left>' +
      '<right style="thin"><color rgb="FFDCD6E6"/></right>' +
      '<top style="thin"><color rgb="FFDCD6E6"/></top>' +
      '<bottom style="thin"><color rgb="FFDCD6E6"/></bottom>' +
      '</border>' +
      '</borders>' +
      '<cellStyleXfs count="1">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>' +
      '</cellStyleXfs>' +
      '<cellXfs count="8">' +
      // 0: Default
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0"/>' +
      // 1: Header (Bold white, purple background, centered, no multiline wrap)
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
      // 2: Number/Duration plain
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>' +
      // 3: Centered text plain
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
      // 4: Left aligned text plain (no forced multiline wrap)
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>' +
      // 5: Number/Duration zebra
      '<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyBorder="1" applyFill="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>' +
      // 6: Centered text zebra
      '<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyBorder="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
      // 7: Left aligned text zebra (no forced multiline wrap)
      '<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyBorder="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>' +
      '</cellXfs>' +
      '</styleSheet>',
    'xl/worksheets/sheet1.xml':
      `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      `<dimension ref="A1:${lastColLetter}${totalRows}"/>` +
      `<sheetViews>` +
      `<sheetView workbookViewId="0">` +
      `<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>` +
      `</sheetView>` +
      `</sheetViews>` +
      `<cols>${colsXml}</cols>` +
      `<sheetData>${cellXmlList.join('')}</sheetData>` +
      `<autoFilter ref="A1:${lastColLetter}${totalRows}"/>` +
      `</worksheet>`,
  };

  return zipSync(
    Object.fromEntries(
      Object.entries(files).map(([name, content]) => [
        name,
        strToU8(declaration + content),
      ])
    )
  );
}

export function downloadManagementExcelFile(
  rows: ManagementDataRow[],
  filename = 'Management_Data_Jadwal_Feedback.xlsx'
) {
  const bytes = createManagementWorkbook(rows);
  const blob = new Blob([new Uint8Array(bytes)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
