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


import {
  SHOPEE_TRACKER_HEADERS,
  TIKTOK_TRACKER_HEADERS,
  DAILY_COMPARISON_HEADERS,
  buildLegacySheetLiveId,
  deriveCampaignStatus,
  computeTrackerRow,
  buildDailyComparisonRows,
  createBrandSheetTrackerWorkbook,
} from '../src/lib/sheetTrackerData';

describe('sheetTrackerData (input.xlsx alignment)', () => {
  it('matches exact column headers of input.xlsx for Shopee (29 cols), TikTok (41 cols), and Daily Comparison (28 cols)', () => {
    expect(SHOPEE_TRACKER_HEADERS.length).toBe(29);
    expect(SHOPEE_TRACKER_HEADERS).toContain('Date');
    expect(SHOPEE_TRACKER_HEADERS).toContain('Host');
    expect(SHOPEE_TRACKER_HEADERS).toContain('GMV Target');
    expect(SHOPEE_TRACKER_HEADERS).toContain('Views To CO');
    expect(SHOPEE_TRACKER_HEADERS).toContain('AOV');
    expect(SHOPEE_TRACKER_HEADERS).toContain('Live issues');
    expect(SHOPEE_TRACKER_HEADERS).toContain('Livestreaming Background');
    expect(SHOPEE_TRACKER_HEADERS).toContain('Livestreaming Tittle');
    expect(SHOPEE_TRACKER_HEADERS).toContain('Total Duration (s)');
    expect(SHOPEE_TRACKER_HEADERS).toContain('Speaking (s)');
    expect(SHOPEE_TRACKER_HEADERS).toContain('Facing Camera (s)');
    expect(SHOPEE_TRACKER_HEADERS).toContain('ADS');
    expect(SHOPEE_TRACKER_HEADERS).toContain('Coins');
    expect(SHOPEE_TRACKER_HEADERS).toContain('Promo Remarks');

    expect(TIKTOK_TRACKER_HEADERS.length).toBe(41);
    expect(DAILY_COMPARISON_HEADERS.length).toBe(28);
  });

  it('links Date-Host from Production and computes GMV-AOV, Live Issue, Design BG, and Host Behaviour Monitoring', () => {
    expect(buildLegacySheetLiveId('2026-10-01', 9, 11, 'STASTRA')).toBe('11026_0911_STAST');
    expect(deriveCampaignStatus('2026-10-01')).toBe('BAU');
    expect(deriveCampaignStatus('2026-10-10')).toBe('DOUBLE DATE');
    expect(deriveCampaignStatus('2026-10-25')).toBe('PAYDAY');

    const baseRow: ManagementDataRow = {
      session: {
        id: 's_astra_1',
        location_id: 'bandung',
        quotation_id: 'q_astra',
        studio_id: 'st_bdg_23',
        lane: 1,
        work_date: '2026-10-01',
        start_hour: 9,
        end_hour: 11,
        host_id: 'h_jo',
        host_fee: 65000,
        status: 'published',
        created_by: 'u1',
        created_at: '',
        host_published: true,
        live_code: 'LS-26-000101',
        live_label: '20261001_0900-1100_STASTRA',
        legacy_live_id: '11026_0911_STAST',
      },
      quotation: {
        id: 'q_astra',
        location_id: 'bandung',
        reference: 'QT-ASTRA',
        brand: 'ASTRA',
        account: 'STASTRA',
        platform: 'Mirror',
        period_start: '2026-10-01',
        period_end: '2026-10-31',
        hours: 100,
        allocated_hours: 20,
        rate: 90000,
        best_hours: [9, 11],
        created_by: 'u1',
        created_at: '',
        brand_id: 'b_astra',
        best_hour_slots: [],
      },
      brandName: 'ASTRA',
      platform: 'Mirror',
      location: 'Bandung',
      studioName: 'STUDIO 23 BDG',
      lane: 1,
      hostName: 'JO',
      status: 'published',
      plannedHours: 2,
      hostCheckStatus: 'Sudah',
      hostActualStart: '09:00 WIB',
      hostActualEnd: '11:00 WIB',
      hostActualHours: 2,
      hostReady: true,
      hostBrief: true,
      hostNote: '',
      hostSubmittedAt: '',
      opCheckStatus: 'Sudah',
      opAudio: true,
      opCamera: true,
      opNetwork: true,
      opNote: '',
      opOperatorName: 'Ilham OP',
      opSubmittedAt: '',
      evaluationStatus: 'Lengkap',
      hasNotes: false,
    };

    const computed = computeTrackerRow(baseRow);
    expect(computed.shopId).toBe('STASTRA');
    expect(computed.liveId).toBe('11026_0911_STAST');
    expect(computed.date).toBe('2026-10-01');
    expect(computed.day).toBe('Thursday');
    expect(computed.lsTime).toBe('09.00 - 11.00');
    expect(computed.duration).toBe(2);
    expect(computed.status).toBe('BAU');
    expect(computed.location).toBe('BANDUNG');
    expect(computed.studio).toBe('STUDIO 23 BDG');
    expect(computed.host).toBe('JO');
    // From ASTRA_INPUT_XLSX_SEED: Views=834, CO=17, GMV=5838460
    expect(computed.spViews).toBe(834);
    expect(computed.spCo).toBe(17);
    expect(computed.spGmv).toBe(5838460);
    expect(computed.spViewsToCo).toBeCloseTo(17 / 834, 6);
    expect(computed.spAov).toBeCloseTo(5838460 / 17, 2);
    expect(computed.totalDurationSec).toBeGreaterThan(0);
    expect(computed.speakingSec).toBeGreaterThan(0);
    expect(computed.facingCameraSec).toBeGreaterThan(0);

    const { dailyRows, subTotal } = buildDailyComparisonRows([computed]);
    expect(dailyRows).toHaveLength(1);
    expect(dailyRows[0].hoursShopee).toBe(2);
    expect(dailyRows[0].spGmv).toBe(5838460);
    expect(subTotal.date).toBe('SUB TOTAL');

    const wbBytes = createBrandSheetTrackerWorkbook([computed], 'ASTRA', 'OCTOBER', 2026);
    const zip = unzipSync(wbBytes);
    const sheetXml = strFromU8(zip['xl/worksheets/sheet1.xml']);
    expect(sheetXml).toContain('LIVESTREAMING SHOPEE ASTRA OCTOBER 2026');
    expect(sheetXml).toContain('LIVESTREAMING TIKTOK ASTRA OCTOBER 2026');
    expect(sheetXml).toContain('11026_0911_STAST');
  });
});
