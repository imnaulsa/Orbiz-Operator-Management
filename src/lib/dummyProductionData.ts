import type { ProductionData, LiveSession, Quotation } from './production';
import type { Database } from './database.generated';

type Row<K extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][K]['Row'];

export interface DummyBrandConfig {
  id: string;
  name: string;
  platform: 'TikTok' | 'Shopee' | 'Mirror';
  tiktok?: string;
  shopee?: string;
  mirror?: string;
}

export const DUMMY_BRANDS: DummyBrandConfig[] = [
  { id: 'b_skintific', name: 'Skintific Indonesia', platform: 'TikTok', tiktok: 'TT-SKINTIFIC' },
  { id: 'b_somethinc', name: 'Somethinc Official Store', platform: 'Shopee', shopee: 'SP-SOMETHINC' },
  { id: 'b_erigo', name: 'Erigo Official Apparel', platform: 'TikTok', tiktok: 'TT-ERIGO' },
  { id: 'b_wardah', name: 'Wardah Beauty Cosmetics', platform: 'Shopee', shopee: 'SP-WARDAH' },
  { id: 'b_eiger', name: 'Eiger Adventure Outdoor', platform: 'TikTok', tiktok: 'TT-EIGER' },
  { id: 'b_avoskin', name: 'Avoskin Natural Skincare', platform: 'Shopee', shopee: 'SP-AVOSKIN' },
  { id: 'b_aerostreet', name: 'AeroStreet Footwear', platform: 'TikTok', tiktok: 'TT-AEROSTREET' },
  { id: 'b_originote', name: 'The Originote Beauty', platform: 'Shopee', shopee: 'SP-ORIGINOTE' },
  { id: 'b_dearme', name: 'Dear Me Beauty', platform: 'Mirror', mirror: 'ST-DEARME' },
  { id: 'b_fore', name: 'Fore Coffee Official', platform: 'TikTok', tiktok: 'TT-FORE' },
  { id: 'b_ventela', name: 'Ventela Shoes Indonesia', platform: 'TikTok', tiktok: 'TT-VENTELA' },
  { id: 'b_astra', name: 'ASTRA', platform: 'Mirror', mirror: 'STASTRA' },
];

export const DUMMY_HOSTS = [
  { id: 'h_sarah', display_name: 'Sarah Amelia', active: true, location_id: 'jakarta' },
  { id: 'h_nabila', display_name: 'Nabila Putri', active: true, location_id: 'jakarta' },
  { id: 'h_jessica', display_name: 'Jessica Tan', active: true, location_id: 'jakarta' },
  { id: 'h_kevin', display_name: 'Kevin Pratama', active: true, location_id: 'jakarta' },
  { id: 'h_amanda', display_name: 'Amanda Manopo', active: true, location_id: 'bandung' },
  { id: 'h_clarissa', display_name: 'Clarissa Wang', active: true, location_id: 'bandung' },
  { id: 'h_dimas', display_name: 'Dimas Anggara', active: true, location_id: 'bandung' },
  { id: 'h_jo', display_name: 'JO', active: true, location_id: 'bandung' },
  { id: 'h_fiqa', display_name: 'FIQA', active: true, location_id: 'bandung' },
  { id: 'h_alwin', display_name: 'ALWIN', active: true, location_id: 'bandung' },
  { id: 'h_ardhy', display_name: 'ARDHY', active: true, location_id: 'bandung' },
  { id: 'h_chika', display_name: 'CHIKA', active: true, location_id: 'bandung' },
];

export const DUMMY_OPERATORS: Record<string, string> = {
  op_budi: 'Budi Santoso (OP Jakarta)',
  op_fajar: 'Fajar Hidayat (OP Jakarta)',
  op_reza: 'Reza Rahadian (OP Jakarta)',
  op_ilham: 'Ilham Ramadhan (OP Bandung)',
  op_aldi: 'Aldi Taher (OP Bandung)',
};

export const DUMMY_STUDIOS = [
  { id: 'st_jkt_1', location_id: 'jakarta', name: 'Studio Mega 1', capacity: 2 },
  { id: 'st_jkt_2', location_id: 'jakarta', name: 'Studio Podcast A', capacity: 2 },
  { id: 'st_jkt_3', location_id: 'jakarta', name: 'Studio Green Screen', capacity: 1 },
  { id: 'st_bdg_1', location_id: 'bandung', name: 'Studio Bandung Creative', capacity: 2 },
  { id: 'st_bdg_2', location_id: 'bandung', name: 'Studio Bandung Showcase', capacity: 1 },
  { id: 'st_bdg_23', location_id: 'bandung', name: 'STUDIO 23 BDG', capacity: 2 },
];

interface SessionSeedDef {
  date: string;
  startHour: number;
  endHour: number;
  brandIdx: number;
  studioIdx: number;
  hostIdx: number;
  opKey: string;
  code: string;
  label: string;
  legacyLiveId?: string;
  scenario:
    | 'lancar_1'
    | 'lancar_2'
    | 'kendala_audio'
    | 'kendala_jaringan'
    | 'kendala_lighting'
    | 'kendala_host_terlambat'
    | 'kendala_stok_katalog'
    | 'kendala_kamera'
    | 'pending_op'
    | 'pending_host'
    | 'belum_check';
}

const SEED_DEFINITIONS: SessionSeedDef[] = [
  // 1. Lancar Payday
  {
    date: '2026-10-26',
    startHour: 9,
    endHour: 11,
    brandIdx: 0, // Skintific
    studioIdx: 0,
    hostIdx: 0,
    opKey: 'op_budi',
    code: 'LV-SKIN-01',
    label: 'Payday Mega Sale 10.26',
    scenario: 'lancar_1',
  },
  // 2. Kendala Audio
  {
    date: '2026-10-26',
    startHour: 13,
    endHour: 16,
    brandIdx: 1, // Somethinc
    studioIdx: 1,
    hostIdx: 1,
    opKey: 'op_fajar',
    code: 'LV-SOME-02',
    label: 'Afternoon Glow Skin Routine',
    scenario: 'kendala_audio',
  },
  // 3. Kendala Jaringan
  {
    date: '2026-10-26',
    startHour: 19,
    endHour: 22,
    brandIdx: 2, // Erigo
    studioIdx: 0,
    hostIdx: 2,
    opKey: 'op_reza',
    code: 'LV-ERIGO-03',
    label: 'Prime Time Streetwear Flash',
    scenario: 'kendala_jaringan',
  },
  // 4. Lancar Skincare
  {
    date: '2026-10-25',
    startHour: 10,
    endHour: 12,
    brandIdx: 3, // Wardah
    studioIdx: 3,
    hostIdx: 4,
    opKey: 'op_ilham',
    code: 'LV-WARD-04',
    label: 'Halal Beauty Morning Show',
    scenario: 'lancar_2',
  },
  // 5. Kendala Lighting
  {
    date: '2026-10-25',
    startHour: 14,
    endHour: 16,
    brandIdx: 4, // Eiger
    studioIdx: 2,
    hostIdx: 3,
    opKey: 'op_budi',
    code: 'LV-EIGER-05',
    label: 'Outdoor & Adventure Gear',
    scenario: 'kendala_lighting',
  },
  // 6. Kendala Host Terlambat
  {
    date: '2026-10-25',
    startHour: 19,
    endHour: 21,
    brandIdx: 5, // Avoskin
    studioIdx: 4,
    hostIdx: 5,
    opKey: 'op_aldi',
    code: 'LV-AVOS-06',
    label: 'Miraculous Toner Exclusive Live',
    scenario: 'kendala_host_terlambat',
  },
  // 7. Lancar Fashion
  {
    date: '2026-10-24',
    startHour: 11,
    endHour: 14,
    brandIdx: 6, // AeroStreet
    studioIdx: 0,
    hostIdx: 0,
    opKey: 'op_fajar',
    code: 'LV-AERO-07',
    label: 'Sepatu Lokal Murah Berkualitas',
    scenario: 'lancar_1',
  },
  // 8. Kendala Stok Katalog
  {
    date: '2026-10-24',
    startHour: 16,
    endHour: 18,
    brandIdx: 7, // Originote
    studioIdx: 1,
    hostIdx: 1,
    opKey: 'op_budi',
    code: 'LV-ORIG-08',
    label: 'Moisturizer Viral 100K 3pcs',
    scenario: 'kendala_stok_katalog',
  },
  // 9. Kendala Kamera
  {
    date: '2026-10-23',
    startHour: 13,
    endHour: 15,
    brandIdx: 8, // Dear Me Beauty
    studioIdx: 2,
    hostIdx: 2,
    opKey: 'op_reza',
    code: 'LV-DEAR-09',
    label: 'Serum Concealer Demo Swatch',
    scenario: 'kendala_kamera',
  },
  // 10. Lancar F&B
  {
    date: '2026-10-23',
    startHour: 15,
    endHour: 17,
    brandIdx: 9, // Fore Coffee
    studioIdx: 3,
    hostIdx: 4,
    opKey: 'op_ilham',
    code: 'LV-FORE-10',
    label: 'Afternoon Coffee Voucher Sale',
    scenario: 'lancar_2',
  },
  // 11. Lancar Sneakers
  {
    date: '2026-10-22',
    startHour: 19,
    endHour: 23, // 4 hours!
    brandIdx: 10, // Ventela
    studioIdx: 0,
    hostIdx: 3,
    opKey: 'op_fajar',
    code: 'LV-VENT-11',
    label: 'Mega Marathon Live 4 Jam',
    scenario: 'lancar_1',
  },
  // 12. Pending OP
  {
    date: '2026-10-22',
    startHour: 10,
    endHour: 11, // 1 hour!
    brandIdx: 0, // Skintific
    studioIdx: 1,
    hostIdx: 1,
    opKey: 'op_budi',
    code: 'LV-SKIN-12',
    label: 'Flash Deal 1 Jam Siang',
    scenario: 'pending_op',
  },
  // 13. Pending Host
  {
    date: '2026-10-21',
    startHour: 14,
    endHour: 16,
    brandIdx: 1, // Somethinc
    studioIdx: 4,
    hostIdx: 5,
    opKey: 'op_aldi',
    code: 'LV-SOME-13',
    label: 'Calm Down Skin Barrier Demo',
    scenario: 'pending_host',
  },
  // 14. Belum Check (Jadwal Terdaftar)
  {
    date: '2026-10-21',
    startHour: 20,
    endHour: 22,
    brandIdx: 2, // Erigo
    studioIdx: 0,
    hostIdx: 6,
    opKey: 'op_budi',
    code: 'LV-ERIGO-14',
    label: 'Night Jam Session & Discount',
    scenario: 'belum_check',
  },
  // 15. Kendala Audio & Jaringan (Severe)
  {
    date: '2026-10-20',
    startHour: 13,
    endHour: 16,
    brandIdx: 4, // Eiger
    studioIdx: 1,
    hostIdx: 2,
    opKey: 'op_reza',
    code: 'LV-EIGER-15',
    label: 'Eiger Weekend Adventure Sale',
    scenario: 'kendala_audio',
  },
  // 16. Lancar Beauty
  {
    date: '2026-10-20',
    startHour: 16,
    endHour: 18,
    brandIdx: 3, // Wardah
    studioIdx: 3,
    hostIdx: 4,
    opKey: 'op_ilham',
    code: 'LV-WARD-16',
    label: 'Colorfit Velvet Matte Lip Demo',
    scenario: 'lancar_2',
  },
  // 17. Kendala Lighting
  {
    date: '2026-10-19',
    startHour: 10,
    endHour: 12,
    brandIdx: 5, // Avoskin
    studioIdx: 2,
    hostIdx: 0,
    opKey: 'op_fajar',
    code: 'LV-AVOS-17',
    label: 'Your Skin Bae Serum Special',
    scenario: 'kendala_lighting',
  },
  // 18. Lancar AeroStreet
  {
    date: '2026-10-18',
    startHour: 19,
    endHour: 22, // 3 hours
    brandIdx: 6, // AeroStreet
    studioIdx: 0,
    hostIdx: 3,
    opKey: 'op_budi',
    code: 'LV-AERO-18',
    label: 'Super Brand Day AeroStreet',
    scenario: 'lancar_1',
  },
  // 19. Kendala Host Terlambat
  {
    date: '2026-10-17',
    startHour: 14,
    endHour: 16,
    brandIdx: 7, // Originote
    studioIdx: 4,
    hostIdx: 5,
    opKey: 'op_aldi',
    code: 'LV-ORIG-19',
    label: 'Sunscreen SPF 50 Viral Restock',
    scenario: 'kendala_host_terlambat',
  },
  // 20. Lancar Dear Me
  {
    date: '2026-10-16',
    startHour: 11,
    endHour: 13,
    brandIdx: 8, // Dear Me
    studioIdx: 1,
    hostIdx: 1,
    opKey: 'op_reza',
    code: 'LV-DEAR-20',
    label: 'KFC x Dear Me Lip Tint Special',
    scenario: 'lancar_2',
  },
  // 21. September - Skintific (Lancar)
  {
    date: '2026-09-15',
    startHour: 13,
    endHour: 15,
    brandIdx: 0,
    studioIdx: 0,
    hostIdx: 0,
    opKey: 'op_budi',
    code: 'LV-SKIN-SEPT-21',
    label: 'Skintific Mid-Month Skincare Routine',
    scenario: 'lancar_1',
  },
  // 22. September - Erigo 4 Jam (Kendala Jaringan)
  {
    date: '2026-09-22',
    startHour: 18,
    endHour: 22,
    brandIdx: 2,
    studioIdx: 1,
    hostIdx: 2,
    opKey: 'op_reza',
    code: 'LV-ERIGO-SEPT-22',
    label: 'Erigo End of Season Streetwear 4 Jam',
    scenario: 'kendala_jaringan',
  },
  // 23. September - Fore Coffee 3 Jam (Lancar)
  {
    date: '2026-09-28',
    startHour: 9,
    endHour: 12,
    brandIdx: 9,
    studioIdx: 3,
    hostIdx: 4,
    opKey: 'op_ilham',
    code: 'LV-FORE-SEPT-23',
    label: 'Fore Morning Brew & Bundling Voucher',
    scenario: 'lancar_2',
  },
  // 24. November - The Originote 1 Jam Flash (Pending OP)
  {
    date: '2026-11-05',
    startHour: 10,
    endHour: 11,
    brandIdx: 7,
    studioIdx: 4,
    hostIdx: 5,
    opKey: 'op_aldi',
    code: 'LV-ORIG-NOV-24',
    label: 'Early 11.11 Flash Deal 1 Jam',
    scenario: 'pending_op',
  },
  // 25. November - Somethinc 11.11 Midnight 4 Jam (Kendala Audio)
  {
    date: '2026-11-11',
    startHour: 19,
    endHour: 23,
    brandIdx: 1,
    studioIdx: 0,
    hostIdx: 1,
    opKey: 'op_fajar',
    code: 'LV-SOME-NOV-25',
    label: '11.11 Super Grand Midnight Flash Sale 4 Jam',
    scenario: 'kendala_audio',
  },
  // 26. November - Ventela Shoes 3 Jam (Lancar)
  {
    date: '2026-11-12',
    startHour: 14,
    endHour: 17,
    brandIdx: 10,
    studioIdx: 2,
    hostIdx: 3,
    opKey: 'op_budi',
    code: 'LV-VENT-NOV-26',
    label: 'Ventela Post 11.11 Restock Sneakers',
    scenario: 'lancar_1',
  },
  // 27-37. ASTRA OCTOBER 2026 (Authentic rows from input.xlsx)
  {
    date: '2026-10-01',
    startHour: 9,
    endHour: 11,
    brandIdx: 11, // ASTRA (STASTRA)
    studioIdx: 5, // STUDIO 23 BDG
    hostIdx: 7,   // JO
    opKey: 'op_ilham',
    code: 'LS-26-000101',
    label: '20261001_0900-1100_STASTRA',
    legacyLiveId: '11026_0911_STAST',
    scenario: 'lancar_1',
  },
  {
    date: '2026-10-01',
    startHour: 11,
    endHour: 13,
    brandIdx: 11,
    studioIdx: 5,
    hostIdx: 8,   // FIQA
    opKey: 'op_ilham',
    code: 'LS-26-000102',
    label: '20261001_1100-1300_STASTRA',
    legacyLiveId: '11026_1113_STAST',
    scenario: 'lancar_2',
  },
  {
    date: '2026-10-01',
    startHour: 17,
    endHour: 19,
    brandIdx: 11,
    studioIdx: 5,
    hostIdx: 8,   // FIQA
    opKey: 'op_aldi',
    code: 'LS-26-000103',
    label: '20261001_1700-1900_STASTRA',
    legacyLiveId: '11026_1719_STAST',
    scenario: 'lancar_1',
  },
  {
    date: '2026-10-01',
    startHour: 19,
    endHour: 21,
    brandIdx: 11,
    studioIdx: 5,
    hostIdx: 9,   // ALWIN
    opKey: 'op_aldi',
    code: 'LS-26-000104',
    label: '20261001_1900-2100_STASTRA',
    legacyLiveId: '11026_1921_STAST',
    scenario: 'lancar_2',
  },
  {
    date: '2026-10-01',
    startHour: 21,
    endHour: 23,
    brandIdx: 11,
    studioIdx: 5,
    hostIdx: 9,   // ALWIN
    opKey: 'op_aldi',
    code: 'LS-26-000105',
    label: '20261001_2100-2300_STASTRA',
    legacyLiveId: '11026_2123_STAST',
    scenario: 'kendala_stok_katalog',
  },
  {
    date: '2026-10-02',
    startHour: 9,
    endHour: 11,
    brandIdx: 11,
    studioIdx: 5,
    hostIdx: 10,  // ARDHY
    opKey: 'op_ilham',
    code: 'LS-26-000106',
    label: '20261002_0900-1100_STASTRA',
    legacyLiveId: '21026_0911_STAST',
    scenario: 'kendala_stok_katalog',
  },
  {
    date: '2026-10-10',
    startHour: 0,
    endHour: 2,
    brandIdx: 11,
    studioIdx: 5,
    hostIdx: 10,  // ARDHY
    opKey: 'op_ilham',
    code: 'LS-26-000110',
    label: '20261010_0000-0200_STASTRA',
    legacyLiveId: '101026_0002_STAST',
    scenario: 'lancar_1',
  },
  {
    date: '2026-10-14',
    startHour: 9,
    endHour: 11,
    brandIdx: 11,
    studioIdx: 5,
    hostIdx: 8,   // FIQA
    opKey: 'op_ilham',
    code: 'LS-26-000114',
    label: '20261014_0900-1100_STASTRA',
    legacyLiveId: '141026_0911_STAST',
    scenario: 'kendala_audio',
  },
  {
    date: '2026-10-17',
    startHour: 19,
    endHour: 21,
    brandIdx: 11,
    studioIdx: 5,
    hostIdx: 7,   // JO
    opKey: 'op_aldi',
    code: 'LS-26-000117',
    label: '20261017_1900-2100_STASTRA',
    legacyLiveId: '171026_1921_STAST',
    scenario: 'kendala_jaringan',
  },
  {
    date: '2026-10-19',
    startHour: 19,
    endHour: 21,
    brandIdx: 11,
    studioIdx: 5,
    hostIdx: 9,   // ALWIN
    opKey: 'op_aldi',
    code: 'LS-26-000119',
    label: '20261019_1900-2100_STASTRA',
    legacyLiveId: '191026__STAST',
    scenario: 'kendala_lighting',
  },
  {
    date: '2026-10-25',
    startHour: 0,
    endHour: 2,
    brandIdx: 11,
    studioIdx: 5,
    hostIdx: 9,   // ALWIN
    opKey: 'op_ilham',
    code: 'LS-26-000125',
    label: '20261025_0000-0200_STASTRA',
    legacyLiveId: '251026_0002_STAST',
    scenario: 'lancar_1',
  },
];

export function buildRealisticDummyProductionData(
  existingData: ProductionData,
  profileNames: Record<string, string>
): { data: ProductionData; profiles: Record<string, string> } {
  // Merge profiles
  const mergedProfiles = { ...DUMMY_OPERATORS, ...profileNames };
  DUMMY_HOSTS.forEach((h) => {
    mergedProfiles[h.id] = h.display_name;
  });

  // Prepare brands
  const brands: Row<'production_brands'>[] = DUMMY_BRANDS.map((b) => ({
    id: b.id,
    name: b.name,
    shop_id_tiktok: b.tiktok ?? null,
    shop_id_shopee: b.shopee ?? null,
    shop_id_mirror: b.mirror ?? null,
    active: true,
    created_by: 'system',
    created_at: '2026-10-01T00:00:00Z',
  }));

  // Prepare studios
  const studios: Row<'production_studios'>[] = DUMMY_STUDIOS.map((s) => ({
    id: s.id,
    location_id: s.location_id,
    name: s.name,
    capacity: s.capacity,
  }));

  // Prepare quotations
  const quotations: Quotation[] = DUMMY_BRANDS.map((b, idx) => ({
    id: `q_${b.id}`,
    location_id: null,
    reference: `QT-2026-00${idx + 1}`,
    brand: b.name,
    account: b.tiktok ?? b.shopee ?? b.mirror ?? `STORE-${idx}`,
    platform: b.platform,
    period_start: '2026-10-01',
    period_end: '2026-10-31',
    hours: 80,
    allocated_hours: 18,
    rate: 90000,
    best_hours: [9, 13, 19],
    created_by: 'system',
    created_at: '2026-10-01T00:00:00Z',
    brand_id: b.id,
    best_hour_slots: [],
  }));

  // Prepare hosts
  const hosts = DUMMY_HOSTS;

  // Prepare Sessions & Checks
  const sessions: LiveSession[] = [];
  const checks: Row<'live_checks'>[] = [];

  SEED_DEFINITIONS.forEach((seed, idx) => {
    const brand = DUMMY_BRANDS[seed.brandIdx];
    const studio = DUMMY_STUDIOS[seed.studioIdx];
    const host = DUMMY_HOSTS[seed.hostIdx];
    const quotationId = `q_${brand.id}`;
    const sessId = `dummy_sess_${idx + 1}`;
    const duration = seed.endHour - seed.startHour;

    sessions.push({
      id: sessId,
      location_id: studio.location_id,
      quotation_id: quotationId,
      studio_id: studio.id,
      lane: 1,
      work_date: seed.date,
      start_hour: seed.startHour,
      end_hour: seed.endHour,
      host_id: host.id,
      host_fee: 65000,
      status: 'published',
      created_by: 'system',
      created_at: `${seed.date}T00:00:00Z`,
      host_published: true,
      live_code: seed.code,
      live_label: seed.label,
      legacy_live_id: seed.legacyLiveId ?? '',
    });

    const startStr = `${String(seed.startHour).padStart(2, '0')}:00`;
    const endStr = `${String(seed.endHour).padStart(2, '0')}:00`;

    // Scenarios for Checks & Feedback
    switch (seed.scenario) {
      case 'lancar_1': {
        checks.push({
          id: `chk_h_${sessId}`,
          session_id: sessId,
          location_id: studio.location_id,
          kind: 'host',
          submitted_by: host.id,
          answers: { ready: true, brief: true },
          note: 'Live berjalan sangat lancar, host menguasai brief promo payday & flash sale. Penonton ramai dan interaktif, target GMV tercapai.',
          actual_start: `${seed.date}T${startStr}:00+07:00`,
          actual_end: `${seed.date}T${endStr}:00+07:00`,
          created_at: `${seed.date}T${endStr}:05+07:00`,
        });
        checks.push({
          id: `chk_op_${sessId}`,
          session_id: sessId,
          location_id: studio.location_id,
          kind: 'operator',
          submitted_by: seed.opKey,
          answers: { audio: true, camera: true, network: true },
          note: 'Setup Sony FX3 tajam dan jernih, audio Sennheiser wireless jernih (baterai penuh), koneksi internet 150Mbps sangat stabil (0 drop frame).',
          actual_start: null,
          actual_end: null,
          created_at: `${seed.date}T${startStr}:-10+07:00`,
        });
        break;
      }
      case 'lancar_2': {
        checks.push({
          id: `chk_h_${sessId}`,
          session_id: sessId,
          location_id: studio.location_id,
          kind: 'host',
          submitted_by: host.id,
          answers: { ready: true, brief: true },
          note: 'Sesi live teratur dan sesuai rundown. Sampel produk lengkap di meja host, respons penonton terhadap demo shade warna sangat baik.',
          actual_start: `${seed.date}T${startStr}:00+07:00`,
          actual_end: `${seed.date}T${endStr}:00+07:00`,
          created_at: `${seed.date}T${endStr}:02+07:00`,
        });
        checks.push({
          id: `chk_op_${sessId}`,
          session_id: sessId,
          location_id: studio.location_id,
          kind: 'operator',
          submitted_by: seed.opKey,
          answers: { audio: true, camera: true, network: true },
          note: 'Pencahayaan studio 3-point light seimbang, audio mixer normal, streaming lancar tanpa kendala teknis.',
          actual_start: null,
          actual_end: null,
          created_at: `${seed.date}T${startStr}:-05+07:00`,
        });
        break;
      }
      case 'kendala_audio': {
        checks.push({
          id: `chk_h_${sessId}`,
          session_id: sessId,
          location_id: studio.location_id,
          kind: 'host',
          submitted_by: host.id,
          answers: { ready: true, brief: true },
          note: 'Live berjalan baik, namun mic clip-on sempat kresek-kresek di menit ke-25 karena receiver kendor. OP langsung tanggap menukar mic cadangan.',
          actual_start: `${seed.date}T${startStr}:00+07:00`,
          actual_end: `${seed.date}T${endStr}:00+07:00`,
          created_at: `${seed.date}T${endStr}:10+07:00`,
        });
        checks.push({
          id: `chk_op_${sessId}`,
          session_id: sessId,
          location_id: studio.location_id,
          kind: 'operator',
          submitted_by: seed.opKey,
          answers: { audio: false, camera: true, network: true },
          note: 'Kendala pada jack wireless transmitter channel 1 mengalami interferensi frekuensi di menit ke-25. Segera dialihkan ke channel cadangan 4, audio kembali normal.',
          actual_start: null,
          actual_end: null,
          created_at: `${seed.date}T${startStr}:-05+07:00`,
        });
        break;
      }
      case 'kendala_jaringan': {
        checks.push({
          id: `chk_h_${sessId}`,
          session_id: sessId,
          location_id: studio.location_id,
          kind: 'host',
          submitted_by: host.id,
          answers: { ready: true, brief: true },
          note: 'Penonton sempat komen video patah-patah/buffering selama 3 menit di jam 20.15. Host menutupi dengan improvisasi menyapa komentar penonton.',
          actual_start: `${seed.date}T${startStr}:00+07:00`,
          actual_end: `${seed.date}T${endStr}:00+07:00`,
          created_at: `${seed.date}T${endStr}:08+07:00`,
        });
        checks.push({
          id: `chk_op_${sessId}`,
          session_id: sessId,
          location_id: studio.location_id,
          kind: 'operator',
          submitted_by: seed.opKey,
          answers: { audio: true, camera: true, network: false },
          note: 'ISP utama (Indihome) mengalami packet loss 12% dan bitrate drop ke 800kbps selama 3 menit. Operator segera failover ke backup Telkomsel Orbit 50Mbps, stream kembali stabil.',
          actual_start: null,
          actual_end: null,
          created_at: `${seed.date}T${startStr}:-05+07:00`,
        });
        break;
      }
      case 'kendala_lighting': {
        checks.push({
          id: `chk_h_${sessId}`,
          session_id: sessId,
          location_id: studio.location_id,
          kind: 'host',
          submitted_by: host.id,
          answers: { ready: false, brief: true },
          note: 'Lampu softbox sebelah kiri studio redup dan sempat mati 10 menit di awal sesi, wajah host agak bayang. Mohon dicek adaptor power lampu sebelum sesi berikutnya.',
          actual_start: `${seed.date}T${startStr}:05+07:00`,
          actual_end: `${seed.date}T${endStr}:00+07:00`,
          created_at: `${seed.date}T${endStr}:05+07:00`,
        });
        checks.push({
          id: `chk_op_${sessId}`,
          session_id: sessId,
          location_id: studio.location_id,
          kind: 'operator',
          submitted_by: seed.opKey,
          answers: { audio: true, camera: true, network: true },
          note: 'Power supply softbox sebelah kiri kendor. Sudah diganti terminal kabel ekstensi baru dan pencahayaan normal kembali pada menit ke-12.',
          actual_start: null,
          actual_end: null,
          created_at: `${seed.date}T${startStr}:-08+07:00`,
        });
        break;
      }
      case 'kendala_host_terlambat': {
        const lateStartStr = `${String(seed.startHour).padStart(2, '0')}:15`;
        const lateEndStr = `${String(seed.endHour).padStart(2, '0')}:15`;
        checks.push({
          id: `chk_h_${sessId}`,
          session_id: sessId,
          location_id: studio.location_id,
          kind: 'host',
          submitted_by: host.id,
          answers: { ready: true, brief: false },
          note: 'Host terjebak macet hujan deras di jalan, tiba di studio jam 19.10 WIB. Live dimulai jam 19.15 WIB dan diperpanjang 15 menit sampai 21.15 WIB agar durasi 2 jam tetap terpenuhi.',
          actual_start: `${seed.date}T${lateStartStr}:00+07:00`,
          actual_end: `${seed.date}T${lateEndStr}:00+07:00`,
          created_at: `${seed.date}T${lateEndStr}:05+07:00`,
        });
        checks.push({
          id: `chk_op_${sessId}`,
          session_id: sessId,
          location_id: studio.location_id,
          kind: 'operator',
          submitted_by: seed.opKey,
          answers: { audio: true, camera: true, network: true },
          note: 'Perangkat sudah standby sejak 30 menit sebelum jadwal. Live mundur 15 menit mengikuti kedatangan host, durasi shift penuh 2 jam tercapai jam 21.15 WIB.',
          actual_start: null,
          actual_end: null,
          created_at: `${seed.date}T${startStr}:-10+07:00`,
        });
        break;
      }
      case 'kendala_stok_katalog': {
        checks.push({
          id: `chk_h_${sessId}`,
          session_id: sessId,
          location_id: studio.location_id,
          kind: 'host',
          submitted_by: host.id,
          answers: { ready: true, brief: true },
          note: 'Keranjang kuning di TikTok Shop sempat pending/tidak muncul di 5 menit awal. Host tetap review produk sambil menunggu admin brand approve voucher flash sale.',
          actual_start: `${seed.date}T${startStr}:00+07:00`,
          actual_end: `${seed.date}T${endStr}:00+07:00`,
          created_at: `${seed.date}T${endStr}:05+07:00`,
        });
        checks.push({
          id: `chk_op_${sessId}`,
          session_id: sessId,
          location_id: studio.location_id,
          kind: 'operator',
          submitted_by: seed.opKey,
          answers: { audio: true, camera: true, network: true },
          note: 'Audio dan kamera lancar. Operator membantu menghubungi tim Admin Sales brand untuk update stok etalase nomor 3 yang tiba-tiba out of stock.',
          actual_start: null,
          actual_end: null,
          created_at: `${seed.date}T${startStr}:-05+07:00`,
        });
        break;
      }
      case 'kendala_kamera': {
        checks.push({
          id: `chk_h_${sessId}`,
          session_id: sessId,
          location_id: studio.location_id,
          kind: 'host',
          submitted_by: host.id,
          answers: { ready: true, brief: true },
          note: 'Kamera sempat hunting focus saat host menunjukkan produk serum kecil ke arah lensa. Setelah dialihkan ke manual focus oleh OP, demo produk kembali tajam.',
          actual_start: `${seed.date}T${startStr}:00+07:00`,
          actual_end: `${seed.date}T${endStr}:00+07:00`,
          created_at: `${seed.date}T${endStr}:05+07:00`,
        });
        checks.push({
          id: `chk_op_${sessId}`,
          session_id: sessId,
          location_id: studio.location_id,
          kind: 'operator',
          submitted_by: seed.opKey,
          answers: { audio: true, camera: false, network: true },
          note: 'Autofokus kamera terganggu kontras background studio. Operator mengunci fokus manual dan mengatur aperture f/2.8 agar demo produk kosmetik terlihat tajam.',
          actual_start: null,
          actual_end: null,
          created_at: `${seed.date}T${startStr}:-05+07:00`,
        });
        break;
      }
      case 'pending_op': {
        checks.push({
          id: `chk_h_${sessId}`,
          session_id: sessId,
          location_id: studio.location_id,
          kind: 'host',
          submitted_by: host.id,
          answers: { ready: true, brief: true },
          note: 'Live 1 jam flash sale selesai tepat waktu. Host sudah checkout sesi.',
          actual_start: `${seed.date}T${startStr}:00+07:00`,
          actual_end: `${seed.date}T${endStr}:00+07:00`,
          created_at: `${seed.date}T${endStr}:02+07:00`,
        });
        // No OP check
        break;
      }
      case 'pending_host': {
        // No Host check
        checks.push({
          id: `chk_op_${sessId}`,
          session_id: sessId,
          location_id: studio.location_id,
          kind: 'operator',
          submitted_by: seed.opKey,
          answers: { audio: true, camera: true, network: true },
          note: 'Studio dan audio siap, streaming selesai sesuai rundown. Menunggu checklist host.',
          actual_start: null,
          actual_end: null,
          created_at: `${seed.date}T${startStr}:-05+07:00`,
        });
        break;
      }
      case 'belum_check': {
        // Neither Host nor OP check submitted
        break;
      }
    }
  });

  // Combine with existing data so existing records are prioritized
  const combinedBrands = [...existingData.brands, ...brands.filter((b) => !existingData.brands.some((x) => x.id === b.id))];
  const combinedStudios = [...existingData.studios, ...studios.filter((s) => !existingData.studios.some((x) => x.id === s.id))];
  const combinedQuotations = [...existingData.quotations, ...quotations.filter((q) => !existingData.quotations.some((x) => x.id === q.id))];
  const combinedHosts = [...existingData.hosts, ...hosts.filter((h) => !existingData.hosts.some((x) => x.id === h.id))];
  const combinedSessions = [...existingData.sessions, ...sessions.filter((s) => !existingData.sessions.some((x) => x.id === s.id))];
  const combinedChecks = [...existingData.checks, ...checks.filter((c) => !existingData.checks.some((x) => x.id === c.id))];

  return {
    data: {
      brands: combinedBrands,
      studios: combinedStudios,
      quotations: combinedQuotations,
      hosts: combinedHosts,
      availability: existingData.availability,
      leaves: existingData.leaves,
      rates: existingData.rates,
      sessions: combinedSessions,
      checks: combinedChecks,
    },
    profiles: mergedProfiles,
  };
}
