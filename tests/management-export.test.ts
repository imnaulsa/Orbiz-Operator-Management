import { describe, it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import {
  getExcelColumnLetter,
  createManagementWorkbook,
  prepareManagementRows,
  type ManagementDataRow,
  MANAGEMENT_EXCEL_HEADERS,
} from '../src/lib/managementExport';
import type { ProductionData } from '../src/lib/production';

describe('managementExport', () => {
  it('correctly converts column indices to Excel column letters beyond 26 columns', () => {
    expect(getExcelColumnLetter(0)).toBe('A');
    expect(getExcelColumnLetter(25)).toBe('Z');
    expect(getExcelColumnLetter(26)).toBe('AA');
    expect(getExcelColumnLetter(27)).toBe('AB');
    expect(getExcelColumnLetter(30)).toBe('AE');
    expect(getExcelColumnLetter(51)).toBe('AZ');
    expect(getExcelColumnLetter(52)).toBe('BA');
  });

  it('prepares rows and calculates host/op check status accurately', () => {
    const mockData: ProductionData = {
      brands: [{ id: 'b1', name: 'Brand Alpha', shop_id_tiktok: null, shop_id_shopee: null, shop_id_mirror: null, active: true, created_by: 'u1', created_at: '' }],
      studios: [{ id: 's1', location_id: 'jakarta', name: 'Studio 1', capacity: 2 }],
      quotations: [
        {
          id: 'q1',
          location_id: 'jakarta',
          reference: 'Q-001',
          brand: 'Brand Alpha',
          account: 'ACC-1',
          platform: 'TikTok',
          period_start: '2026-10-01',
          period_end: '2026-10-31',
          hours: 100,
          allocated_hours: 10,
          best_hours: [9, 10],
          created_by: 'u1',
          created_at: '',
          brand_id: 'b1',
          best_hour_slots: [],
        },
      ],
      hosts: [{ id: 'h1', display_name: 'Sarah Host', active: true, location_id: 'jakarta' }],
      availability: [],
      leaves: [],
      rates: [],
      sessions: [
        {
          id: 'sess1',
          location_id: 'jakarta',
          quotation_id: 'q1',
          studio_id: 's1',
          lane: 1,
          work_date: '2026-10-26',
          start_hour: 9,
          end_hour: 11,
          host_id: 'h1',
          host_fee: 50000,
          status: 'published',
          created_by: 'u1',
          created_at: '',
          host_published: true,
          live_code: 'LV-001',
          live_label: 'Morning Show',
          legacy_live_id: '',
        },
      ],
      checks: [
        {
          id: 'c1',
          session_id: 'sess1',
          location_id: 'jakarta',
          kind: 'host',
          submitted_by: 'h1',
          answers: { ready: true, brief: true },
          note: 'Pencahayaan bagus, host siap & live lancar.',
          actual_start: '2026-10-26T09:00:00+07:00',
          actual_end: '2026-10-26T11:00:00+07:00',
          created_at: '2026-10-26T11:05:00+07:00',
        },
        {
          id: 'c2',
          session_id: 'sess1',
          location_id: 'jakarta',
          kind: 'operator',
          submitted_by: 'op1',
          answers: { audio: true, camera: true, network: true },
          note: 'OBS normal, koneksi 100Mbps stabil.',
          actual_start: null,
          actual_end: null,
          created_at: '2026-10-26T08:50:00+07:00',
        },
      ],
    };

    const profileNames = { op1: 'Budi Operator' };
    const rows = prepareManagementRows(mockData, profileNames);

    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.brandName).toBe('Brand Alpha');
    expect(r.platform).toBe('TikTok');
    expect(r.hostName).toBe('Sarah Host');
    expect(r.plannedHours).toBe(2);
    expect(r.hostActualHours).toBe(2);
    expect(r.hostCheckStatus).toBe('Sudah');
    expect(r.opCheckStatus).toBe('Sudah');
    expect(r.evaluationStatus).toBe('Lengkap');
    expect(r.hasNotes).toBe(true);
    expect(r.hostReady).toBe(true);
    expect(r.hostBrief).toBe(true);
    expect(r.hostNote).toContain('Pencahayaan bagus');
    expect(r.opOperatorName).toBe('Budi Operator');
    expect(r.opNote).toContain('OBS normal');
  });

  it('generates a valid OpenXML workbook with 31 columns, correct headers, autofilter and styles', () => {
    const dummyRows: ManagementDataRow[] = [
      {
        session: {
          id: 'sess1',
          location_id: 'jakarta',
          quotation_id: 'q1',
          studio_id: 's1',
          lane: 1,
          work_date: '2026-10-26',
          start_hour: 9,
          end_hour: 11,
          host_id: 'h1',
          host_fee: 50000,
          status: 'published',
          created_by: 'u1',
          created_at: '',
          host_published: true,
          live_code: 'LV-TEST',
          live_label: 'Flash Sale Live & <Promo>',
          legacy_live_id: '',
        },
        brandName: 'Brand & Co <Test>',
        platform: 'TikTok',
        location: 'Jakarta',
        studioName: 'Studio 1',
        lane: 1,
        hostName: 'Sarah & Co',
        status: 'published',
        plannedHours: 2,
        hostCheckStatus: 'Sudah',
        hostActualStart: '09:00 WIB',
        hostActualEnd: '11:00 WIB',
        hostActualHours: 2,
        hostReady: true,
        hostBrief: true,
        hostNote: 'Live sukses & ramai penonton!',
        hostSubmittedAt: '26 Okt 2026, 11:05 WIB',
        opCheckStatus: 'Sudah',
        opAudio: true,
        opCamera: true,
        opNetwork: true,
        opNote: 'Mic baterai aman, camera sharp.',
        opOperatorName: 'Dimas OP',
        opSubmittedAt: '26 Okt 2026, 08:55 WIB',
        evaluationStatus: 'Lengkap',
        hasNotes: true,
      },
    ];

    const bytes = createManagementWorkbook(dummyRows, 'Jadwal & Feedback Live');

    // Check PK zip signature
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);

    const zip = unzipSync(bytes);
    expect(zip['xl/worksheets/sheet1.xml']).toBeDefined();
    expect(zip['xl/styles.xml']).toBeDefined();
    expect(zip['xl/workbook.xml']).toBeDefined();

    const sheetXml = strFromU8(zip['xl/worksheets/sheet1.xml']);

    // Check last column is AE (31 columns: 0 to 30 -> AE)
    expect(MANAGEMENT_EXCEL_HEADERS.length).toBe(31);
    expect(getExcelColumnLetter(30)).toBe('AE');
    expect(sheetXml).toContain('ref="A1:AE2"');

    // Check escaped content
    expect(sheetXml).toContain('Brand &amp; Co &lt;Test&gt;');
    expect(sheetXml).toContain('Flash Sale Live &amp; &lt;Promo&gt;');
    expect(sheetXml).toContain('Live sukses &amp; ramai penonton!');

    // Check styles XML contains purple fill
    const stylesXml = strFromU8(zip['xl/styles.xml']);
    expect(stylesXml).toContain('FF6C32B9');
  });
});
