import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ManagementDataPage } from '../src/components/ManagementData';
import type { Ctx } from '../src/components/ProductionWorkspace';
import type { ProductionData } from '../src/lib/production';
import type { Profile } from '../src/lib/domain';

// Mock supabase client
vi.mock('../src/lib/supabase', () => ({
  db: () => ({
    from: () => ({
      select: () => Promise.resolve({
        data: [
          { id: 'op1', display_name: 'Budi Operator' },
          { id: 'h1', display_name: 'Sarah Host' },
        ],
        error: null,
      }),
    }),
  }),
  errorText: (e: unknown) => String(e),
}));

describe('ManagementDataPage rendering', () => {
  const mockProfile: Profile = {
    id: 'admin1',
    display_name: 'Super Admin',
    role: 'super_admin',
    location_id: 'jakarta',
    employment_type: 'internal',
    active: true,
    created_at: '2026-01-01T00:00:00Z',
  };

  const mockData: ProductionData = {
    brands: [
      {
        id: 'b1',
        name: 'Brand Alpha',
        shop_id_tiktok: 'TT-001',
        shop_id_shopee: 'SP-001',
        shop_id_mirror: null,
        active: true,
        created_by: 'admin1',
        created_at: '',
      },
    ],
    studios: [
      { id: 's1', location_id: 'jakarta', name: 'Studio Mega 1', capacity: 2 },
    ],
    quotations: [
      {
        id: 'q1',
        location_id: 'jakarta',
        reference: 'Q-2026-001',
        brand: 'Brand Alpha',
        account: 'ACC-ALPHA',
        platform: 'TikTok',
        period_start: '2026-10-01',
        period_end: '2026-10-31',
        hours: 60,
        allocated_hours: 4,
        best_hours: [9, 10],
        created_by: 'admin1',
        created_at: '',
        brand_id: 'b1',
        best_hour_slots: [],
      },
    ],
    hosts: [
      { id: 'h1', display_name: 'Sarah Host', active: true, location_id: 'jakarta' },
    ],
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
        created_by: 'admin1',
        created_at: '',
        host_published: true,
        live_code: 'LV-ALPHA-01',
        live_label: 'Morning Livestream',
        legacy_live_id: '',
      },
    ],
    checks: [
      {
        id: 'chk-host-1',
        session_id: 'sess1',
        location_id: 'jakarta',
        kind: 'host',
        submitted_by: 'h1',
        answers: { ready: true, brief: true },
        note: 'Host ready, promo diskon 50% tersampaikan.',
        actual_start: '2026-10-26T09:00:00+07:00',
        actual_end: '2026-10-26T11:00:00+07:00',
        created_at: '2026-10-26T11:05:00+07:00',
      },
      {
        id: 'chk-op-1',
        session_id: 'sess1',
        location_id: 'jakarta',
        kind: 'operator',
        submitted_by: 'op1',
        answers: { audio: true, camera: true, network: true },
        note: 'Stream lancar, bitrate 6000kbps stabil.',
        actual_start: null,
        actual_end: null,
        created_at: '2026-10-26T08:50:00+07:00',
      },
    ],
  };

  const defaultCtx: Ctx = {
    data: mockData,
    profile: mockProfile,
    location: 'jakarta',
    start: '2026-10-01',
    end: '2026-10-31',
    busy: false,
    act: vi.fn(),
    run: vi.fn(),
  };

  it('renders KPI metrics and summary cards correctly', () => {
    const html = renderToStaticMarkup(
      <ManagementDataPage
        {...defaultCtx}
        setDateRange={vi.fn()}
        onRefresh={vi.fn()}
      />
    );

    expect(html).toContain('Total Jadwal Live');
    expect(html).toContain('Jam Aktual (Host)');
    expect(html).toContain('Kelengkapan Check Host');
    expect(html).toContain('Kelengkapan Check OP');
    expect(html).toContain('Catatan / Feedback');
  });

  it('renders table columns, live details, host feedback, and op feedback', () => {
    const html = renderToStaticMarkup(
      <ManagementDataPage
        {...defaultCtx}
        setDateRange={vi.fn()}
        onRefresh={vi.fn()}
      />
    );

    // Live details in table
    expect(html).toContain('Brand Alpha');
    expect(html).toContain('LV-ALPHA-01');
    expect(html).toContain('Sarah Host');
    expect(html).toContain('Studio Mega 1');

    // Clean checklist badges
    expect(html).toContain('Sudah Check');
    expect(html).toContain('Lengkap');

    // Detail button and Export button
    expect(html).toContain('Detail Feedback');
    expect(html).toContain('Export ke Excel (.xlsx)');
  });

  it('renders time mode, month, and year filter controls', () => {
    const html = renderToStaticMarkup(
      <ManagementDataPage
        {...defaultCtx}
        setDateRange={vi.fn()}
        onRefresh={vi.fn()}
      />
    );

    expect(html).toContain('Per Bulan &amp; Tahun');
    expect(html).toContain('Januari');
    expect(html).toContain('Oktober');
    expect(html).toContain('Desember');
    expect(html).toContain('Bulan Ini');
    expect(html).toContain('Bulan Lalu');
    expect(html).toContain('Reset Filter');
  });

  it('renders diverse brands, durations, and realistic mixed conditions', () => {
    const html = renderToStaticMarkup(
      <ManagementDataPage
        {...defaultCtx}
        setDateRange={vi.fn()}
        onRefresh={vi.fn()}
      />
    );

    // Should contain new brands
    expect(html).toContain('Skintific Indonesia');
    expect(html).toContain('Somethinc Official Store');
    // Should contain condition badges (both lancar and kendala)
    expect(html).toContain('Lancar');
    expect(html).toContain('Ada Kendala');
    // Should render detail feedback buttons
    expect(html).toContain('Detail Feedback');
  });
});

