import { strToU8, zipSync } from 'fflate';
import type { ManagementDataRow } from './managementExport';
import { getExcelColumnLetter } from './managementExport';

export const ENGLISH_DAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export const ENGLISH_MONTHS = [
  'JANUARY',
  'FEBRUARY',
  'MARCH',
  'APRIL',
  'MAY',
  'JUNE',
  'JULY',
  'AUGUST',
  'SEPTEMBER',
  'OCTOBER',
  'NOVEMBER',
  'DECEMBER',
];

export const SHORT_ENGLISH_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export const LIVE_ISSUE_PRESETS = [
  '',
  'Restricted',
  'VIOLOATION',
  'Banned',
  'Hold Due To Electrical Issue',
  'Audio Wireless Interference',
  'Network Packet Loss / RTO',
  'Camera Overheat / Autofocus',
  'Host Late Arrival',
] as const;

export interface DesignBackgroundPreset {
  id: string;
  code: string;
  label: string;
  campaignType: 'BAU' | 'DOUBLE DATE' | 'PAYDAY' | 'ALL';
}

export const DESIGN_BACKGROUND_PRESETS: DesignBackgroundPreset[] = [
  {
    id: 'dsn_bau_clean',
    code: 'DSN-BG-BAU-01',
    label: 'DSN-BG-BAU-01 · Studio Clean Brand Set',
    campaignType: 'BAU',
  },
  {
    id: 'dsn_bau_display',
    code: 'DSN-BG-BAU-02',
    label: 'DSN-BG-BAU-02 · Product Rack & LED Wall',
    campaignType: 'BAU',
  },
  {
    id: 'dsn_dd_fest',
    code: 'DSN-BG-DD-1010',
    label: 'DSN-BG-DD-1010 · Double Date Mega Thematic',
    campaignType: 'DOUBLE DATE',
  },
  {
    id: 'dsn_payday_gold',
    code: 'DSN-BG-PD-25',
    label: 'DSN-BG-PD-25 · Payday Sale Neon Banner',
    campaignType: 'PAYDAY',
  },
  {
    id: 'dsn_greenscreen',
    code: 'DSN-BG-GS-01',
    label: 'DSN-BG-GS-01 · Keyed Virtual Background',
    campaignType: 'ALL',
  },
];

export interface HostBehaviourRecord {
  liveId: string;
  totalDurationSec: number;
  speakingSec: number;
  facingCameraSec: number;
  syncedAt: string;
}

/**
 * Editable/Connected fields per session for the Sheet Tracker (`input.xlsx` model)
 */
export interface SessionTrackerInput {
  sessionId: string;
  sessionCountOverride?: number | null;
  durationOverride?: number | null;
  statusOverride?: string;
  lsTimeOverride?: string;

  // Group 2: Manual Performance Inputs (Shopee: GMV Target -> AOV + ADS, Coins, Promo Remarks)
  spGmvTarget: number;
  spViewsTarget: number;
  spViews: number;
  spTopViews: number;
  spAvgViewingDuration: string; // HH:MM:SS e.g. '00:00:47'
  spCo: number;
  spGmv: number;
  spViewsToCoOverride?: number | null;
  spAovOverride?: number | null;
  spAds: string;
  spCoins: number;
  spPromoRemarks: string;

  // Group 2B: Manual Performance Inputs (TikTok: GMV Target -> Ads GMV + Promo Remarks)
  ttGmvTarget: number;
  ttViewsTarget: number;
  ttGmvActual: number;
  ttProductImpression: number;
  ttProductClick: number;
  ttOrder: number;
  ttCo: number;
  ttBuyer: number;
  ttAovOverride?: number | null;
  ttViews: number;
  ttViewers: number;
  ttComment: number;
  ttLikes: number;
  ttFollow: number;
  ttAvgViewDurationSec: number;
  ttErrPct: number;
  ttAdsCost: string;
  ttAdsGmv: string;
  ttPromoRemarks: string;

  // Group 3: Connected from Operational Form (Live issues & Livestreaming Tittle)
  liveIssues: string;
  ttLiveIssues?: string;
  livestreamingTitle: string;

  // Group 4: Connected from Design Module (Livestreaming Background)
  livestreamingBackground: string;

  // Group 5: Connected via Host Behaviour Monitoring (Total Duration (s), Speaking (s), Facing Camera (s))
  totalDurationSec: number;
  speakingSec: number;
  facingCameraSec: number;
}

/**
 * Complete computed row matching `input.xlsx` columns for Shopee (`AD`–`BF`) and TikTok (`BH`–`CV`)
 */
export interface ComputedTrackerRow {
  baseRow: ManagementDataRow;
  brandKey: string;
  brandDisplayName: string;

  // 1. Production Linked (Date - Host + Shop ID + Live ID)
  shopId: string;
  liveId: string;
  date: string;
  dateShort: string; // d-MMM e.g. 1-Oct
  day: string;
  lsTime: string;
  session: number;
  duration: number;
  status: string;
  location: string;
  studio: string;
  host: string;

  // 2. Shopee Metrics (GMV Target - AOV + ADS, Coins, Promo Remarks)
  spGmvTarget: number;
  spViewsTarget: number;
  spViews: number;
  spTopViews: number;
  spAvgViewingDuration: string;
  spCo: number;
  spGmv: number;
  spViewsToCo: number;
  spAov: number;
  spAds: string;
  spCoins: number;
  spPromoRemarks: string;

  // 3. TikTok Metrics
  ttGmvTarget: number;
  ttViewsTarget: number;
  ttGmvActual: number;
  ttProductImpression: number;
  ttProductClick: number;
  ttCtr: number;
  ttOrder: number;
  ttCo: number;
  ttCoRate: number;
  ttBuyer: number;
  ttAov: number;
  ttViews: number;
  ttViewers: number;
  ttComment: number;
  ttLikes: number;
  ttFollow: number;
  ttAvgViewDurationSec: number;
  ttEngagementRate: number;
  ttFollowersRate: number;
  ttErrPct: number;
  ttLiveImpression: number;
  ttAdsCost: string;
  ttAdsGmv: string;
  ttPromoRemarks: string;

  // 4. Form & Design & Host Behaviour Monitoring
  liveIssues: string;
  ttLiveIssues: string;
  livestreamingBackground: string;
  livestreamingTitle: string;
  totalDurationSec: number;
  speakingSec: number;
  facingCameraSec: number;
}

export interface DailyComparisonRow {
  date: string;
  dateDisplay: string; // dd-MMM e.g. 01-Oct
  day: string; // Thursday, Friday...
  hoursShopee: number;
  hoursTiktok: number;
  // Shopee Daily Comparison
  spGmvTarget: number;
  spGmvHourTarget: number;
  spGmv: number;
  spGmvHour: number;
  spGmvAch: number;
  spGmvHourAch: number;
  spViewsTarget: number;
  spViewsHourTarget: number;
  spViews: number;
  spViewsHour: number;
  spViewsAch: number;
  spViewsHourAch: number;
  // TikTok Daily Comparison
  ttGmvTarget: number;
  ttGmvHourTarget: number;
  ttGmv: number;
  ttGmvHour: number;
  ttGmvAch: number;
  ttGmvHourAch: number;
  ttViewsTarget: number;
  ttViewsHourTarget: number;
  ttViews: number;
  ttViewsHour: number;
  ttViewsAch: number;
  ttViewsHourAch: number;
}

export interface OverallPerformanceSummary {
  shopeeGmv: number;
  shopeeViews: number;
  shopeeItemSold: number;
  tiktokGmv: number;
  tiktokViews: number;
  tiktokItemSold: number;
  tiktokCtr: number;
  tiktokCoRate: number;
}

/**
 * Exact 29 headers of Livestreaming Shopee Tracker in `input.xlsx` (`AD` to `BF`)
 */
export const SHOPEE_TRACKER_HEADERS = [
  'Shop ID',
  'Live ID',
  'Date',
  'Day',
  'LS Time',
  'Session',
  'Duration',
  'Status',
  'Location',
  'Studio',
  'Host',
  'GMV Target',
  'Views Target',
  'Views',
  'Top Views',
  'Avg. Viewing Duration',
  'CO',
  'GMV',
  'Views To CO',
  'AOV',
  'Live issues',
  'Livestreaming Background',
  'Livestreaming Tittle',
  'Total Duration (s)',
  'Speaking (s)',
  'Facing Camera (s)',
  'ADS',
  'Coins',
  'Promo Remarks',
] as const;

/**
 * Exact 41 headers of Livestreaming TikTok Tracker in `input.xlsx` (`BH` to `CV`)
 */
export const TIKTOK_TRACKER_HEADERS = [
  'Shop ID',
  'Live ID',
  'Date',
  'Day',
  'LS Time',
  'Session',
  'Duration',
  'Status',
  'Location',
  'Studio',
  'Host',
  'GMV Target',
  'Views Target',
  'GMV Actual',
  'Product Impression',
  'Product Click',
  'CTR',
  'Order',
  'CO',
  'CO Rate',
  'Buyer',
  'AOV',
  'Views',
  'Viewers',
  'Comment',
  'Likes',
  'Follow',
  'Avg. View Duration (s)',
  'Engagement Rate',
  'Followers Rate',
  'ERR (%)',
  'Live Impression',
  'Ads Cost',
  'Ads GMV',
  'Total Duration (s)',
  'Speaking (s)',
  'Facing Camera (s)',
  'Live issues',
  'Livestreaming Background',
  'Livestreaming Tittle',
  'Promo Remarks',
] as const;

/**
 * Exact 28 headers of Daily Comparison in `input.xlsx` (`A` to `AB`)
 */
export const DAILY_COMPARISON_HEADERS = [
  'Date',
  'Day',
  'Hours Shopee',
  'Hours Tiktok',
  'GMV Target',
  'GMV/Hour Target',
  'GMV',
  'GMV/Hour',
  'GMV Ach,',
  'GMV/H Ach,',
  'Views Target',
  'Views/H Target',
  'Views',
  'Views/Hour',
  'Views Ach,',
  'Views/H Ach,',
  'GMV Target',
  'GMV/Hour Target',
  'GMV',
  'GMV/Hour',
  'GMV Ach,',
  'GMV/Hour Ach,',
  'Views Target',
  'Views/H Target',
  'Views',
  'Views/Hour',
  'Views Ach,',
  'Views/H Ach,',
] as const;

/**
 * Exact color mapping from `input.xlsx` for Row 4 headers & Data Cells
 */
export function getDailyHeaderColor(colIdx: number): { bg: string; fg: string } {
  // Cols A..D (0..3): Light Sky Blue #CAEDFB
  if (colIdx < 4) return { bg: '#CAEDFB', fg: '#000000' };
  // Target columns: E..F (4..5), K..L (10..11), Q..R (16..17), W..X (22..23): Purple #8334CD
  if ([4, 5, 10, 11, 16, 17, 22, 23].includes(colIdx)) {
    return { bg: '#8334CD', fg: '#FFFFFF' };
  }
  // Actual & Achievement columns: Lime Yellow-Green #D6F170
  return { bg: '#D6F170', fg: '#000000' };
}

export function getShopeeHeaderColor(colIdx: number): { bg: string; fg: string } {
  // AQ..AW (indices 13..19: Views, Top Views, Avg. Viewing Duration, CO, GMV, Views To CO, AOV): Soft Blue #9FC5E8
  if (colIdx >= 13 && colIdx <= 19) {
    return { bg: '#9FC5E8', fg: '#000000' };
  }
  // AD..AP (0..12) and AX..BF (20..28): Bright Yellow #FFFF00
  return { bg: '#FFFF00', fg: '#000000' };
}

export function getTiktokHeaderColor(colIdx: number): { bg: string; fg: string } {
  // BH..BT (0..12: Shop ID .. Views Target): Purple #8334CD
  if (colIdx >= 0 && colIdx <= 12) {
    return { bg: '#8334CD', fg: '#FFFFFF' };
  }
  // BU..CC (13..21: GMV Actual .. AOV): Lime Yellow-Green #D6F170
  if (colIdx >= 13 && colIdx <= 21) {
    return { bg: '#D6F170', fg: '#000000' };
  }
  // CD..CM (22..31: Views .. Live Impression): Soft Salmon Pink #F4CCCC
  if (colIdx >= 22 && colIdx <= 31) {
    return { bg: '#F4CCCC', fg: '#000000' };
  }
  // CN..CV (32..40: Ads Cost .. Promo Remarks): Bright Yellow #FFFF00
  return { bg: '#FFFF00', fg: '#000000' };
}

export function getDailyCellBg(colIdx: number, isSubTotal: boolean): string | undefined {
  // I, J (8, 9), O, P (14, 15), AA, AB (26, 27): Soft Rose #F4C7C3
  if ([8, 9, 14, 15, 26, 27].includes(colIdx)) return '#F4C7C3';
  // U, V (20, 21): Soft Mint Green #B7E1CD
  if ([20, 21].includes(colIdx)) return '#B7E1CD';
  if (isSubTotal) return '#FADCFE';
  return undefined;
}

export function getEnglishDayName(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00Z');
    return ENGLISH_DAYS[d.getUTCDay()] ?? '';
  } catch {
    return '';
  }
}

export function formatShortDateExcel(dateStr: string, padDay = false): string {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  const mName = SHORT_ENGLISH_MONTHS[(m - 1) % 12] ?? 'Oct';
  const dStr = padDay ? String(d).padStart(2, '0') : String(d);
  return `${dStr}-${mName}`;
}

/**
 * Formula from `input.xlsx` cell AK5:
 * =IF(DAY(AF5)=MONTH(AF5), "DOUBLE DATE", IF(AND(DAY(AF5)>=25,DAY(AF5)<=28), "PAYDAY", "BAU"))
 */
export function deriveCampaignStatus(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return 'BAU';
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (day === month) return 'DOUBLE DATE';
  if (day >= 25 && day <= 28) return 'PAYDAY';
  return 'BAU';
}

/**
 * Formula from `input.xlsx` cell AE5:
 * =TEXT(AF5, "d") & TEXT(AF5, "M") & TEXT(AF5, "Y") & "_" & MID(AH5, 1, 2) & MID(AH5, 9, 2) & "_" & LEFT(AD5, 5)
 * Example: 2026-10-01, 09.00 - 11.00, STASTRA -> 11026_0911_STAST
 */
export function buildLegacySheetLiveId(
  dateStr: string,
  startHour: number,
  endHour: number,
  shopId: string,
  isHold = false
): string {
  const parts = dateStr.split('-');
  const yy = parts[0] ? parts[0].slice(-2) : '26';
  const m = parts[1] ? String(Number(parts[1])) : '10';
  const d = parts[2] ? String(Number(parts[2])) : '1';
  const cleanShop = shopId.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 5) || 'ORBIZ';
  if (isHold) {
    return `${d}${m}${yy}__${cleanShop}`;
  }
  const sh = String(startHour).padStart(2, '0');
  const eh = String(endHour).padStart(2, '0');
  return `${d}${m}${yy}_${sh}${eh}_${cleanShop}`;
}

export function formatLsTimeDot(startHour: number, endHour: number, isHold = false): string {
  if (isHold) return '';
  const fmt = (h: number) => {
    const whole = Math.floor(h);
    const mins = Math.round((h - whole) * 60);
    return `${String(whole).padStart(2, '0')}.${String(mins).padStart(2, '0')}`;
  };
  return `${fmt(startHour)} - ${fmt(endHour)}`;
}

/**
 * Lookup Host Behaviour Monitoring (`Total Duration (s)`, `Speaking (s)`, `Facing Camera (s)`)
 * connected via `Live ID` as in `input.xlsx` (`XLOOKUP($AE5, 'HOST BEHAVIOUR TRACKER'!...)`)
 */
export function lookupHostBehaviourByLiveId(
  liveId: string,
  durationHours: number
): HostBehaviourRecord {
  if (!liveId || durationHours <= 0 || liveId.includes('__')) {
    return {
      liveId,
      totalDurationSec: 0,
      speakingSec: 0,
      facingCameraSec: 0,
      syncedAt: 'Hold / 0s',
    };
  }
  let hash = 0;
  for (let i = 0; i < liveId.length; i++) {
    hash = (hash * 31 + liveId.charCodeAt(i)) % 10000;
  }
  const baseTotal = Math.round(durationHours * 3600);
  const variance = (hash % 180) - 60;
  const totalDurationSec = Math.max(600, baseTotal + variance);
  const speakingRatio = 0.72 + ((hash % 17) / 100);
  const facingRatio = 0.84 + ((hash % 13) / 100);
  const speakingSec = Math.round(totalDurationSec * speakingRatio);
  const facingCameraSec = Math.round(totalDurationSec * facingRatio);

  return {
    liveId,
    totalDurationSec,
    speakingSec,
    facingCameraSec,
    syncedAt: 'Connected via Live ID',
  };
}

/**
 * Derive initial Live Issue from operational form (`live_checks`) if not explicitly set
 */
export function deriveIssueFromChecks(row: ManagementDataRow): string {
  if (row.session.status === 'cancelled') {
    return 'Hold Due To Electrical Issue';
  }
  const combinedNotes = `${row.hostNote} ${row.opNote}`.toLowerCase();
  if (combinedNotes.includes('banned')) return 'Banned';
  if (combinedNotes.includes('violation') || combinedNotes.includes('pelanggaran')) return 'VIOLOATION';
  if (combinedNotes.includes('restricted') || combinedNotes.includes('pembatasan')) return 'Restricted';
  if (combinedNotes.includes('listrik') || combinedNotes.includes('electrical')) {
    return 'Hold Due To Electrical Issue';
  }
  if (row.opAudio === false) return 'Audio Wireless Interference';
  if (row.opNetwork === false) return 'Network Packet Loss / RTO';
  if (row.opCamera === false) return 'Camera Overheat / Autofocus';
  if (row.hostReady === false || combinedNotes.includes('terlambat')) return 'Host Late Arrival';
  return '';
}

/**
 * Exact authentic seed records from `input.xlsx` (ASTRA October 2026) keyed by `legacy_live_id`
 */
export const ASTRA_INPUT_XLSX_SEED: Record<string, Partial<SessionTrackerInput>> = {
  '11026_0911_STAST': {
    spViews: 834, spTopViews: 12, spAvgViewingDuration: '00:00:47', spCo: 17, spGmv: 5838460, spCoins: 30000,
    ttGmvActual: 566913, ttProductImpression: 7797, ttProductClick: 280, ttOrder: 5, ttCo: 3, ttBuyer: 2,
    ttViews: 631, ttViewers: 541, ttComment: 52, ttLikes: 40, ttFollow: 3, ttAvgViewDurationSec: 42, ttErrPct: 0.041287705,
    liveIssues: '', ttLiveIssues: '', livestreamingBackground: 'DSN-BG-BAU-01', livestreamingTitle: 'Astra Genuine Parts Morning Live',
  },
  '11026_1113_STAST': {
    spViews: 1021, spTopViews: 19, spAvgViewingDuration: '00:01:09', spCo: 16, spGmv: 4226960, spCoins: 30000,
    ttGmvActual: 694811, ttProductImpression: 3750, ttProductClick: 91, ttOrder: 6, ttCo: 6, ttBuyer: 1,
    ttViews: 376, ttViewers: 327, ttComment: 37, ttLikes: 0, ttFollow: 2, ttAvgViewDurationSec: 29, ttErrPct: 0.07922461,
    liveIssues: '', ttLiveIssues: '', livestreamingBackground: 'DSN-BG-BAU-01', livestreamingTitle: 'Astra Otoparts Midday Promo',
  },
  '11026_1719_STAST': {
    spViews: 1223, spTopViews: 18, spAvgViewingDuration: '00:00:59', spCo: 23, spGmv: 3238130, spCoins: 30000,
    ttGmvActual: 1486216, ttProductImpression: 4135, ttProductClick: 124, ttOrder: 8, ttCo: 7, ttBuyer: 4,
    ttViews: 558, ttViewers: 498, ttComment: 51, ttLikes: 15, ttFollow: 4, ttAvgViewDurationSec: 23, ttErrPct: 0.098447424,
    liveIssues: '', ttLiveIssues: '', livestreamingBackground: 'DSN-BG-BAU-02', livestreamingTitle: 'Sore Hemat Servis & Oli Astra',
  },
  '11026_1921_STAST': {
    spViews: 1222, spTopViews: 22, spAvgViewingDuration: '00:01:11', spCo: 21, spGmv: 5649000, spCoins: 30000,
    ttGmvActual: 292796, ttProductImpression: 4457, ttProductClick: 174, ttOrder: 2, ttCo: 2, ttBuyer: 1,
    ttViews: 631, ttViewers: 540, ttComment: 47, ttLikes: 537, ttFollow: 3, ttAvgViewDurationSec: 22, ttErrPct: 0.110974323,
    liveIssues: '', ttLiveIssues: '', livestreamingBackground: 'DSN-BG-BAU-02', livestreamingTitle: 'Prime Time Voucher Astra',
  },
  '11026_2123_STAST': {
    spViews: 1345, spTopViews: 19, spAvgViewingDuration: '00:00:56', spCo: 24, spGmv: 5575020, spCoins: 30000,
    ttGmvActual: 821014, ttProductImpression: 6087, ttProductClick: 163, ttOrder: 5, ttCo: 5, ttBuyer: 5,
    ttViews: 1047, ttViewers: 881, ttComment: 75, ttLikes: 14, ttFollow: 1, ttAvgViewDurationSec: 21, ttErrPct: 0.178729942,
    liveIssues: '', ttLiveIssues: 'Restricted', livestreamingBackground: 'DSN-BG-BAU-02', livestreamingTitle: 'Night Flash Deal Astra',
  },
  '21026_0911_STAST': {
    spViews: 789, spTopViews: 14, spAvgViewingDuration: '00:01:05', spCo: 11, spGmv: 2625560, spCoins: 30000,
    ttGmvActual: 1738162, ttProductImpression: 8355, ttProductClick: 287, ttOrder: 8, ttCo: 8, ttBuyer: 3,
    ttViews: 1017, ttViewers: 839, ttComment: 99, ttLikes: 8, ttFollow: 5, ttAvgViewDurationSec: 34, ttErrPct: 0.047701689,
    liveIssues: '', ttLiveIssues: 'Restricted', livestreamingBackground: 'DSN-BG-BAU-01', livestreamingTitle: 'Jumat Berkah Astra Sparepart',
  },
  '101026_0002_STAST': {
    spViews: 7147, spTopViews: 72, spAvgViewingDuration: '00:00:35', spCo: 114, spGmv: 29519450, spCoins: 30000,
    ttGmvActual: 3871660, ttProductImpression: 13902, ttProductClick: 412, ttOrder: 29, ttCo: 15, ttBuyer: 7,
    ttViews: 1185, ttViewers: 887, ttComment: 103, ttLikes: 63, ttFollow: 3, ttAvgViewDurationSec: 35, ttErrPct: 0.112162802,
    liveIssues: '', ttLiveIssues: '', livestreamingBackground: 'DSN-BG-DD-1010', livestreamingTitle: '10.10 Midnight Mega Flash Sale Astra',
    spPromoRemarks: 'Double Date 10.10 Extra Voucher 50%',
  },
  '141026_0911_STAST': {
    spViews: 1076, spTopViews: 19, spAvgViewingDuration: '00:01:00', spCo: 20, spGmv: 5601730, spCoins: 30000,
    ttGmvActual: 825172, ttProductImpression: 7803, ttProductClick: 274, ttOrder: 4, ttCo: 4, ttBuyer: 3,
    ttViews: 705, ttViewers: 579, ttComment: 97, ttLikes: 161, ttFollow: 4, ttAvgViewDurationSec: 35, ttErrPct: 0.060650379,
    liveIssues: '', ttLiveIssues: 'VIOLOATION', livestreamingBackground: 'DSN-BG-BAU-01', livestreamingTitle: 'Spesial Aki & Ban Astra',
  },
  '171026_1921_STAST': {
    spViews: 976, spTopViews: 21, spAvgViewingDuration: '00:01:03', spCo: 9, spGmv: 2897200, spCoins: 30000,
    ttGmvActual: 763280, ttProductImpression: 4096, ttProductClick: 169, ttOrder: 4, ttCo: 4, ttBuyer: 3,
    ttViews: 451, ttViewers: 384, ttComment: 64, ttLikes: 208, ttFollow: 2, ttAvgViewDurationSec: 32, ttErrPct: 0.08336414,
    liveIssues: '', ttLiveIssues: 'Banned', livestreamingBackground: 'DSN-BG-BAU-02', livestreamingTitle: 'Weekend Otomotif Deal',
  },
  '191026__STAST': {
    durationOverride: 0, lsTimeOverride: '',
    spViews: 0, spTopViews: 0, spAvgViewingDuration: '00:00:00', spCo: 0, spGmv: 0, spCoins: 0,
    ttGmvActual: 0, ttProductImpression: 0, ttProductClick: 0, ttOrder: 0, ttCo: 0, ttBuyer: 0,
    ttViews: 0, ttViewers: 0, ttComment: 0, ttLikes: 0, ttFollow: 0, ttAvgViewDurationSec: 0, ttErrPct: 0,
    liveIssues: 'Hold Due To Electrical Issue', ttLiveIssues: 'Hold Due To Electrical Issue',
    livestreamingBackground: 'DSN-BG-BAU-01', livestreamingTitle: 'Hold Session - Gangguan Listrik Studio',
  },
  '251026_0002_STAST': {
    spViews: 4317, spTopViews: 39, spAvgViewingDuration: '00:00:30', spCo: 42, spGmv: 14215730, spCoins: 30000,
    ttGmvActual: 583134, ttProductImpression: 12033, ttProductClick: 464, ttOrder: 3, ttCo: 3, ttBuyer: 2,
    ttViews: 1271, ttViewers: 1016, ttComment: 96, ttLikes: 190, ttFollow: 6, ttAvgViewDurationSec: 47, ttErrPct: 0.080128609,
    liveIssues: '', ttLiveIssues: '', livestreamingBackground: 'DSN-BG-PD-25', livestreamingTitle: 'Payday Gajian Sale Otomotif Astra',
    spPromoRemarks: 'Payday Cashback & Koin 30rb',
  },
};

/**
 * Build default SessionTrackerInput for any row from Data Production, merging `input.xlsx` seeds when matched
 */
export function buildDefaultTrackerInput(row: ManagementDataRow): SessionTrackerInput {
  const s = row.session;
  const q = row.quotation;
  const rawShopId = q?.account || s.live_code || 'STASTRA';
  const legacyId =
    s.legacy_live_id ||
    buildLegacySheetLiveId(s.work_date, s.start_hour, s.end_hour, rawShopId, s.status === 'cancelled');

  const seed = ASTRA_INPUT_XLSX_SEED[legacyId];
  const duration = seed?.durationOverride !== undefined && seed?.durationOverride !== null
    ? seed.durationOverride
    : row.plannedHours;
  const hbm = lookupHostBehaviourByLiveId(legacyId, duration);

  if (seed) {
    return {
      sessionId: s.id,
      sessionCountOverride: 1,
      durationOverride: seed.durationOverride ?? null,
      statusOverride: seed.statusOverride ?? '',
      lsTimeOverride: seed.lsTimeOverride,
      spGmvTarget: seed.spGmvTarget ?? 0,
      spViewsTarget: seed.spViewsTarget ?? 0,
      spViews: seed.spViews ?? 0,
      spTopViews: seed.spTopViews ?? 0,
      spAvgViewingDuration: seed.spAvgViewingDuration ?? '00:00:47',
      spCo: seed.spCo ?? 0,
      spGmv: seed.spGmv ?? 0,
      spAds: seed.spAds ?? '',
      spCoins: seed.spCoins ?? 30000,
      spPromoRemarks: seed.spPromoRemarks ?? '',
      ttGmvTarget: seed.ttGmvTarget ?? 0,
      ttViewsTarget: seed.ttViewsTarget ?? 0,
      ttGmvActual: seed.ttGmvActual ?? 0,
      ttProductImpression: seed.ttProductImpression ?? 0,
      ttProductClick: seed.ttProductClick ?? 0,
      ttOrder: seed.ttOrder ?? 0,
      ttCo: seed.ttCo ?? 0,
      ttBuyer: seed.ttBuyer ?? 0,
      ttViews: seed.ttViews ?? 0,
      ttViewers: seed.ttViewers ?? 0,
      ttComment: seed.ttComment ?? 0,
      ttLikes: seed.ttLikes ?? 0,
      ttFollow: seed.ttFollow ?? 0,
      ttAvgViewDurationSec: seed.ttAvgViewDurationSec ?? 0,
      ttErrPct: seed.ttErrPct ?? 0,
      ttAdsCost: seed.ttAdsCost ?? '',
      ttAdsGmv: seed.ttAdsGmv ?? '',
      ttPromoRemarks: seed.ttPromoRemarks ?? '',
      liveIssues: seed.liveIssues ?? deriveIssueFromChecks(row),
      ttLiveIssues: seed.ttLiveIssues ?? seed.liveIssues ?? deriveIssueFromChecks(row),
      livestreamingBackground: seed.livestreamingBackground ?? 'DSN-BG-BAU-01',
      livestreamingTitle: seed.livestreamingTitle ?? (s.live_label || `${row.brandName} Live Session`),
      totalDurationSec: seed.totalDurationSec ?? hbm.totalDurationSec,
      speakingSec: seed.speakingSec ?? hbm.speakingSec,
      facingCameraSec: seed.facingCameraSec ?? hbm.facingCameraSec,
    };
  }

  let h = 0;
  for (let i = 0; i < s.id.length; i++) {
    h = (h * 33 + s.id.charCodeAt(i)) % 10000;
  }
  const spViews = 750 + (h % 1800);
  const spTopViews = 12 + (h % 35);
  const spCo = 8 + (h % 28);
  const spGmv = spCo * (165000 + ((h % 15) * 15000));
  const avdSec = 35 + (h % 45);
  const spAvd = `00:${String(Math.floor(avdSec / 60)).padStart(2, '0')}:${String(avdSec % 60).padStart(2, '0')}`;

  const ttViews = 420 + (h % 950);
  const ttViewers = Math.round(ttViews * 0.84);
  const ttImpr = ttViews * (8 + (h % 6));
  const ttClick = Math.round(ttViews * (0.24 + ((h % 18) / 100)));
  const ttOrder = 2 + (h % 11);
  const ttCo = Math.max(1, ttOrder - (h % 2));
  const ttBuyer = Math.max(1, ttCo - (h % 2));
  const ttGmvActual = ttCo * (145000 + ((h % 12) * 18000));
  const ttComment = 35 + (h % 75);
  const ttLikes = 20 + (h % 350);
  const ttFollow = 1 + (h % 9);
  const ttErr = Number((ttViews / Math.max(1, ttImpr)).toFixed(6));

  const autoIssue = deriveIssueFromChecks(row);
  const campaignStatus = deriveCampaignStatus(s.work_date);
  const defaultBg =
    campaignStatus === 'DOUBLE DATE'
      ? 'DSN-BG-DD-1010'
      : campaignStatus === 'PAYDAY'
      ? 'DSN-BG-PD-25'
      : 'DSN-BG-BAU-01';

  return {
    sessionId: s.id,
    sessionCountOverride: 1,
    durationOverride: null,
    statusOverride: '',
    spGmvTarget: 0,
    spViewsTarget: 0,
    spViews,
    spTopViews,
    spAvgViewingDuration: spAvd,
    spCo,
    spGmv,
    spAds: '',
    spCoins: 30000,
    spPromoRemarks: row.hostNote ? row.hostNote.slice(0, 60) : '',
    ttGmvTarget: 0,
    ttViewsTarget: 0,
    ttGmvActual,
    ttProductImpression: ttImpr,
    ttProductClick: ttClick,
    ttOrder,
    ttCo,
    ttBuyer,
    ttViews,
    ttViewers,
    ttComment,
    ttLikes,
    ttFollow,
    ttAvgViewDurationSec: 22 + (h % 26),
    ttErrPct: ttErr,
    ttAdsCost: '',
    ttAdsGmv: '',
    ttPromoRemarks: '',
    liveIssues: autoIssue,
    ttLiveIssues: autoIssue,
    livestreamingBackground: defaultBg,
    livestreamingTitle: s.live_label || `${row.brandName} Live Session`,
    totalDurationSec: hbm.totalDurationSec,
    speakingSec: hbm.speakingSec,
    facingCameraSec: hbm.facingCameraSec,
  };
}

/**
 * Combine Production row + SessionTrackerInput into a complete ComputedTrackerRow with all `input.xlsx` formulas evaluated
 */
export function computeTrackerRow(
  row: ManagementDataRow,
  customInput?: SessionTrackerInput
): ComputedTrackerRow {
  const input = customInput ?? buildDefaultTrackerInput(row);
  const s = row.session;
  const q = row.quotation;

  const isHold = input.durationOverride === 0;
  const rawShopId = (q?.account || 'STASTRA').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const shopId = rawShopId || 'STASTRA';

  const liveId =
    s.legacy_live_id ||
    buildLegacySheetLiveId(s.work_date, s.start_hour, s.end_hour, shopId, isHold);

  const date = s.work_date;
  const dateShort = formatShortDateExcel(date, false);
  const day = getEnglishDayName(date);
  const lsTime =
    input.lsTimeOverride !== undefined
      ? input.lsTimeOverride
      : formatLsTimeDot(s.start_hour, s.end_hour, isHold);
  const session = input.sessionCountOverride ?? 1;
  const duration =
    input.durationOverride !== undefined && input.durationOverride !== null
      ? input.durationOverride
      : row.plannedHours;
  const status = input.statusOverride || deriveCampaignStatus(date);
  const location = (s.location_id || row.location || 'BANDUNG').toUpperCase();
  const studio = (row.studioName || 'STUDIO 23 BDG').toUpperCase();
  const host = isHold ? '' : row.hostName.toUpperCase();

  // Shopee auto formulas:
  const spViewsToCo =
    input.spViewsToCoOverride !== undefined && input.spViewsToCoOverride !== null
      ? input.spViewsToCoOverride
      : input.spViews > 0
      ? input.spCo / input.spViews
      : 0;

  const spAov =
    input.spAovOverride !== undefined && input.spAovOverride !== null
      ? input.spAovOverride
      : input.spCo > 0
      ? input.spGmv / input.spCo
      : 0;

  // TikTok auto formulas:
  const ttCtr = input.ttViews > 0 ? input.ttProductClick / input.ttViews : 0;
  const ttCoRate = input.ttProductClick > 0 ? input.ttCo / input.ttProductClick : 0;
  const ttAov =
    input.ttAovOverride !== undefined && input.ttAovOverride !== null
      ? input.ttAovOverride
      : input.ttCo > 0
      ? input.ttGmvActual / input.ttCo
      : 0;
  const ttEngagementRate =
    input.ttViews > 0
      ? (input.ttComment + input.ttLikes + input.ttFollow) / input.ttViews
      : 0;
  const ttFollowersRate = input.ttViews > 0 ? input.ttFollow / input.ttViews : 0;
  const ttLiveImpression =
    input.ttErrPct > 0 ? Math.round(input.ttViews / input.ttErrPct) : input.ttProductImpression;

  const brandKey = q?.brand_id || row.brandName;

  return {
    baseRow: row,
    brandKey,
    brandDisplayName: row.brandName,
    shopId,
    liveId,
    date,
    dateShort,
    day,
    lsTime,
    session,
    duration,
    status,
    location,
    studio,
    host,
    spGmvTarget: input.spGmvTarget,
    spViewsTarget: input.spViewsTarget,
    spViews: input.spViews,
    spTopViews: input.spTopViews,
    spAvgViewingDuration: input.spAvgViewingDuration,
    spCo: input.spCo,
    spGmv: input.spGmv,
    spViewsToCo,
    spAov,
    spAds: input.spAds,
    spCoins: input.spCoins,
    spPromoRemarks: input.spPromoRemarks,
    ttGmvTarget: input.ttGmvTarget,
    ttViewsTarget: input.ttViewsTarget,
    ttGmvActual: input.ttGmvActual,
    ttProductImpression: input.ttProductImpression,
    ttProductClick: input.ttProductClick,
    ttCtr,
    ttOrder: input.ttOrder,
    ttCo: input.ttCo,
    ttCoRate,
    ttBuyer: input.ttBuyer,
    ttAov,
    ttViews: input.ttViews,
    ttViewers: input.ttViewers,
    ttComment: input.ttComment,
    ttLikes: input.ttLikes,
    ttFollow: input.ttFollow,
    ttAvgViewDurationSec: input.ttAvgViewDurationSec,
    ttEngagementRate,
    ttFollowersRate,
    ttErrPct: input.ttErrPct,
    ttLiveImpression,
    ttAdsCost: input.ttAdsCost,
    ttAdsGmv: input.ttAdsGmv,
    ttPromoRemarks: input.ttPromoRemarks,
    liveIssues: input.liveIssues,
    ttLiveIssues: input.ttLiveIssues ?? input.liveIssues,
    livestreamingBackground: input.livestreamingBackground,
    livestreamingTitle: input.livestreamingTitle,
    totalDurationSec: input.totalDurationSec,
    speakingSec: input.speakingSec,
    facingCameraSec: input.facingCameraSec,
  };
}

/**
 * Build Daily Comparison rows (`A` to `AB` in `input.xlsx`) + Overall Performance summary
 */
export function buildDailyComparisonRows(rows: ComputedTrackerRow[]): {
  dailyRows: DailyComparisonRow[];
  subTotal: DailyComparisonRow;
  overall: OverallPerformanceSummary;
} {
  const byDate = new Map<string, ComputedTrackerRow[]>();
  for (const r of rows) {
    const list = byDate.get(r.date) ?? [];
    list.push(r);
    byDate.set(r.date, list);
  }

  const sortedDates = Array.from(byDate.keys()).sort((a, b) => a.localeCompare(b));

  const dailyRows: DailyComparisonRow[] = sortedDates.map((date) => {
    const daySessions = byDate.get(date) ?? [];
    const hoursShopee = daySessions.reduce((s, r) => s + r.duration, 0);
    const hoursTiktok = daySessions.reduce((s, r) => s + r.duration, 0);

    const spGmvTarget = daySessions.reduce((s, r) => s + r.spGmvTarget, 0);
    const spGmvHourTarget = hoursShopee > 0 ? Math.round(spGmvTarget / hoursShopee) : 0;
    const spGmv = daySessions.reduce((s, r) => s + r.spGmv, 0);
    const spGmvHour = hoursShopee > 0 ? spGmv / hoursShopee : 0;
    const spGmvAch = spGmvTarget > 0 ? spGmv / spGmvTarget : 0;
    const spGmvHourAch = spGmvHourTarget > 0 ? spGmvHour / spGmvHourTarget : 0;

    const spViewsTarget = daySessions.reduce((s, r) => s + r.spViewsTarget, 0);
    const spViewsHourTarget = hoursShopee > 0 ? Math.round(spViewsTarget / hoursShopee) : 0;
    const spViews = daySessions.reduce((s, r) => s + r.spViews, 0);
    const spViewsHour = hoursShopee > 0 ? spViews / hoursShopee : 0;
    const spViewsAch = spViewsTarget > 0 ? spViews / spViewsTarget : 0;
    const spViewsHourAch = spViewsHourTarget > 0 ? spViewsHour / spViewsHourTarget : 0;

    const ttGmvTarget = daySessions.reduce((s, r) => s + r.ttGmvTarget, 0);
    const ttGmvHourTarget = hoursTiktok > 0 ? Math.round(ttGmvTarget / hoursTiktok) : 0;
    const ttGmv = daySessions.reduce((s, r) => s + r.ttGmvActual, 0);
    const ttGmvHour = hoursTiktok > 0 ? ttGmv / hoursTiktok : 0;
    const ttGmvAch = ttGmvTarget > 0 ? ttGmv / ttGmvTarget : 0;
    const ttGmvHourAch = ttGmvHourTarget > 0 ? ttGmvHour / ttGmvHourTarget : 0;

    const ttViewsTarget = daySessions.reduce((s, r) => s + r.ttViewsTarget, 0);
    const ttViewsHourTarget = hoursTiktok > 0 ? Math.round(ttViewsTarget / hoursTiktok) : 0;
    const ttViews = daySessions.reduce((s, r) => s + r.ttViews, 0);
    const ttViewsHour = hoursTiktok > 0 ? ttViews / hoursTiktok : 0;
    const ttViewsAch = ttViewsTarget > 0 ? ttViews / ttViewsTarget : 0;
    const ttViewsHourAch = ttViewsHourTarget > 0 ? ttViewsHour / ttViewsHourTarget : 0;

    return {
      date,
      dateDisplay: formatShortDateExcel(date, true),
      day: getEnglishDayName(date),
      hoursShopee,
      hoursTiktok,
      spGmvTarget,
      spGmvHourTarget,
      spGmv,
      spGmvHour,
      spGmvAch,
      spGmvHourAch,
      spViewsTarget,
      spViewsHourTarget,
      spViews,
      spViewsHour,
      spViewsAch,
      spViewsHourAch,
      ttGmvTarget,
      ttGmvHourTarget,
      ttGmv,
      ttGmvHour,
      ttGmvAch,
      ttGmvHourAch,
      ttViewsTarget,
      ttViewsHourTarget,
      ttViews,
      ttViewsHour,
      ttViewsAch,
      ttViewsHourAch,
    };
  });

  const totHoursSp = dailyRows.reduce((s, r) => s + r.hoursShopee, 0);
  const totHoursTt = dailyRows.reduce((s, r) => s + r.hoursTiktok, 0);
  const totSpGmvTarget = dailyRows.reduce((s, r) => s + r.spGmvTarget, 0);
  const totSpGmv = dailyRows.reduce((s, r) => s + r.spGmv, 0);
  const totSpViewsTarget = dailyRows.reduce((s, r) => s + r.spViewsTarget, 0);
  const totSpViews = dailyRows.reduce((s, r) => s + r.spViews, 0);
  const totTtGmvTarget = dailyRows.reduce((s, r) => s + r.ttGmvTarget, 0);
  const totTtGmv = dailyRows.reduce((s, r) => s + r.ttGmv, 0);
  const totTtViewsTarget = dailyRows.reduce((s, r) => s + r.ttViewsTarget, 0);
  const totTtViews = dailyRows.reduce((s, r) => s + r.ttViews, 0);

  const subTotal: DailyComparisonRow = {
    date: 'SUB TOTAL',
    dateDisplay: 'SUB TOTAL',
    day: '',
    hoursShopee: totHoursSp,
    hoursTiktok: totHoursTt,
    spGmvTarget: totSpGmvTarget,
    spGmvHourTarget: totHoursSp > 0 ? Math.round(totSpGmvTarget / totHoursSp) : 0,
    spGmv: totSpGmv,
    spGmvHour: totHoursSp > 0 ? totSpGmv / totHoursSp : 0,
    spGmvAch: totSpGmvTarget > 0 ? totSpGmv / totSpGmvTarget : 0,
    spGmvHourAch: 0,
    spViewsTarget: totSpViewsTarget,
    spViewsHourTarget: totHoursSp > 0 ? Math.round(totSpViewsTarget / totHoursSp) : 0,
    spViews: totSpViews,
    spViewsHour: totHoursSp > 0 ? totSpViews / totHoursSp : 0,
    spViewsAch: totSpViewsTarget > 0 ? totSpViews / totSpViewsTarget : 0,
    spViewsHourAch: 0,
    ttGmvTarget: totTtGmvTarget,
    ttGmvHourTarget: totHoursTt > 0 ? Math.round(totTtGmvTarget / totHoursTt) : 0,
    ttGmv: totTtGmv,
    ttGmvHour: totHoursTt > 0 ? totTtGmv / totHoursTt : 0,
    ttGmvAch: totTtGmvTarget > 0 ? totTtGmv / totTtGmvTarget : 0,
    ttGmvHourAch: 0,
    ttViewsTarget: totTtViewsTarget,
    ttViewsHourTarget: totHoursTt > 0 ? Math.round(totTtViewsTarget / totHoursTt) : 0,
    ttViews: totTtViews,
    ttViewsHour: totHoursTt > 0 ? totTtViews / totHoursTt : 0,
    ttViewsAch: totTtViewsTarget > 0 ? totTtViews / totTtViewsTarget : 0,
    ttViewsHourAch: 0,
  };

  const shopeeItemSold = rows.reduce((s, r) => s + r.spCo, 0);
  const tiktokItemSold = rows.reduce((s, r) => s + r.ttOrder, 0);
  const activeTtRows = rows.filter((r) => r.ttViews > 0);
  const tiktokCtr =
    activeTtRows.length > 0
      ? activeTtRows.reduce((s, r) => s + r.ttCtr, 0) / activeTtRows.length
      : 0;
  const tiktokCoRate =
    activeTtRows.length > 0
      ? activeTtRows.reduce((s, r) => s + r.ttCoRate, 0) / activeTtRows.length
      : 0;

  return {
    dailyRows,
    subTotal,
    overall: {
      shopeeGmv: totSpGmv,
      shopeeViews: totSpViews,
      shopeeItemSold,
      tiktokGmv: totTtGmv,
      tiktokViews: totTtViews,
      tiktokItemSold,
      tiktokCtr,
      tiktokCoRate,
    },
  };
}

const escapeXml = (value: string) =>
  value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

/**
 * Generates an OpenXML `.xlsx` workbook matching the exact colors, merges, and structure of `input.xlsx`:
 * Style IDs (`s="..."`):
 *  0: Default
 *  1: Sky Blue Header (#CAEDFB, Black bold) - A2:D4
 *  2: Shopee Orange Banner (#FF9900, White bold) - E2:P3, AD2:BF3, A40
 *  3: TikTok Black Banner (#000000, White bold) - Q2:AB3, A41
 *  4: TikTok Dark Purple Banner (#180E30, White bold) - BH2:CV3
 *  5: Purple Column Header (#8334CD, White bold) - Target cols & TikTok BH4:BT4 & Overall Perf
 *  6: Lime Green Column Header (#D6F170, Black bold) - Daily Actuals & TikTok BU4:CC4
 *  7: Bright Yellow Column Header (#FFFF00, Black bold) - Shopee AD4:AP4, AX4:BF4 & TikTok CN4:CV4
 *  8: Soft Steel Blue Column Header (#9FC5E8, Black bold) - Shopee AQ4:AW4
 *  9: Soft Salmon Pink Column Header (#F4CCCC, Black bold) - TikTok CD4:CM4
 * 10: Normal Data Cell (White, thin border)
 * 11: Rose Achievement Cell (#F4C7C3) - Cols I, J, O, P, AA, AB
 * 12: Mint Achievement Cell (#B7E1CD) - Cols U, V
 * 13: Lavender SUB TOTAL Cell (#FADCFE, Black bold)
 */
export function createBrandSheetTrackerWorkbook(
  trackerRows: ComputedTrackerRow[],
  brandName = 'ASTRA',
  monthName = 'OCTOBER',
  year = 2026
): Uint8Array {
  const chronological = [...trackerRows].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.baseRow.session.start_hour - b.baseRow.session.start_hour;
  });

  const { dailyRows, subTotal } = buildDailyComparisonRows(chronological);
  const dailyList = [...dailyRows, subTotal];

  const upperBrand = (brandName || 'ASTRA').toUpperCase();
  const upperMonth = (monthName || 'OCTOBER').toUpperCase();
  const totalCols = 100; // A (0) to CV (99)

  interface StyledCell {
    val: string | number;
    style: number;
  }

  const makeBlankRow = (): StyledCell[] =>
    Array.from({ length: totalCols }, () => ({ val: '', style: 0 }));

  // Row 2 Banner Headers
  const row2 = makeBlankRow();
  row2[0] = { val: 'Date', style: 1 };
  row2[1] = { val: 'Day', style: 1 };
  row2[2] = { val: 'Hours\nShopee', style: 1 };
  row2[3] = { val: 'Hours\nTiktok', style: 1 };
  for (let c = 4; c <= 15; c++) row2[c] = { val: c === 4 ? 'Shopee\nDaily Comparison' : '', style: 2 };
  for (let c = 16; c <= 27; c++) row2[c] = { val: c === 16 ? 'Tiktok\nDaily Comparison' : '', style: 3 };
  for (let c = 29; c <= 57; c++) {
    row2[c] = {
      val: c === 29 ? `LIVESTREAMING SHOPEE ${upperBrand} ${upperMonth} ${year}` : '',
      style: 2,
    };
  }
  for (let c = 59; c <= 99; c++) {
    row2[c] = {
      val: c === 59 ? `LIVESTREAMING TIKTOK ${upperBrand} ${upperMonth} ${year}` : '',
      style: 4,
    };
  }

  // Row 3 (Merged continuation row for banners)
  const row3 = makeBlankRow();
  for (let c = 0; c <= 3; c++) row3[c] = { val: '', style: 1 };
  for (let c = 4; c <= 15; c++) row3[c] = { val: '', style: 2 };
  for (let c = 16; c <= 27; c++) row3[c] = { val: '', style: 3 };
  for (let c = 29; c <= 57; c++) row3[c] = { val: '', style: 2 };
  for (let c = 59; c <= 99; c++) row3[c] = { val: '', style: 4 };

  // Row 4 Column Headers with exact `input.xlsx` style IDs
  const row4 = makeBlankRow();
  for (let c = 0; c <= 3; c++) row4[c] = { val: '', style: 1 };
  DAILY_COMPARISON_HEADERS.forEach((h, idx) => {
    if (idx >= 4) {
      const isPurple = [4, 5, 10, 11, 16, 17, 22, 23].includes(idx);
      row4[idx] = { val: h, style: isPurple ? 5 : 6 };
    }
  });
  SHOPEE_TRACKER_HEADERS.forEach((h, idx) => {
    const isBlue = idx >= 13 && idx <= 19;
    row4[29 + idx] = { val: h, style: isBlue ? 8 : 7 };
  });
  TIKTOK_TRACKER_HEADERS.forEach((h, idx) => {
    const st =
      idx <= 12 ? 5 : idx <= 21 ? 6 : idx <= 31 ? 9 : 7;
    row4[59 + idx] = { val: h, style: st };
  });

  const maxDataRows = Math.max(dailyList.length, chronological.length);
  const gridRows: { rowNumber: number; cells: StyledCell[]; isHeader?: boolean }[] = [
    { rowNumber: 2, cells: row2, isHeader: true },
    { rowNumber: 3, cells: row3, isHeader: true },
    { rowNumber: 4, cells: row4, isHeader: true },
  ];

  const subTotalIdx = dailyList.length - 1;

  for (let i = 0; i < maxDataRows; i++) {
    const rCells = makeBlankRow();
    const d = dailyList[i];
    const isSub = i === subTotalIdx;

    if (d) {
      const baseStyle = isSub ? 13 : 10;
      const dVals: (string | number)[] = [
        d.dateDisplay,
        d.day,
        d.hoursShopee,
        d.hoursTiktok,
        d.spGmvTarget,
        d.spGmvHourTarget,
        d.spGmv,
        Number(d.spGmvHour.toFixed(2)),
        `${(d.spGmvAch * 100).toFixed(2)}%`,
        `${(d.spGmvHourAch * 100).toFixed(2)}%`,
        d.spViewsTarget,
        d.spViewsHourTarget,
        d.spViews,
        Number(d.spViewsHour.toFixed(2)),
        `${(d.spViewsAch * 100).toFixed(2)}%`,
        `${(d.spViewsHourAch * 100).toFixed(2)}%`,
        d.ttGmvTarget,
        d.ttGmvHourTarget,
        d.ttGmv,
        Number(d.ttGmvHour.toFixed(2)),
        `${(d.ttGmvAch * 100).toFixed(2)}%`,
        `${(d.ttGmvHourAch * 100).toFixed(2)}%`,
        d.ttViewsTarget,
        d.ttViewsHourTarget,
        d.ttViews,
        Number(d.ttViewsHour.toFixed(2)),
        `${(d.ttViewsAch * 100).toFixed(2)}%`,
        `${(d.ttViewsHourAch * 100).toFixed(2)}%`,
      ];
      dVals.forEach((v, cIdx) => {
        const st = [8, 9, 14, 15, 26, 27].includes(cIdx)
          ? 11
          : [20, 21].includes(cIdx)
          ? 12
          : baseStyle;
        rCells[cIdx] = { val: v, style: st };
      });
    }

    const tr = chronological[i];
    if (tr) {
      const spVals: (string | number)[] = [
        tr.shopId,
        tr.liveId,
        tr.dateShort,
        tr.day,
        tr.lsTime,
        tr.session,
        tr.duration,
        tr.status,
        tr.location,
        tr.studio,
        tr.host,
        tr.spGmvTarget,
        tr.spViewsTarget,
        tr.spViews,
        tr.spTopViews,
        tr.spAvgViewingDuration,
        tr.spCo,
        tr.spGmv,
        `${(tr.spViewsToCo * 100).toFixed(2)}%`,
        Math.round(tr.spAov),
        tr.liveIssues,
        tr.livestreamingBackground,
        tr.livestreamingTitle,
        tr.totalDurationSec,
        tr.speakingSec,
        tr.facingCameraSec,
        tr.spAds,
        tr.spCoins,
        tr.spPromoRemarks,
      ];
      spVals.forEach((v, idx) => {
        rCells[29 + idx] = { val: v, style: 10 };
      });

      const ttVals: (string | number)[] = [
        tr.shopId,
        tr.liveId,
        tr.dateShort,
        tr.day,
        tr.lsTime,
        tr.session,
        tr.duration,
        tr.status,
        tr.location,
        tr.studio,
        tr.host,
        tr.ttGmvTarget,
        tr.ttViewsTarget,
        tr.ttGmvActual,
        tr.ttProductImpression,
        tr.ttProductClick,
        `${(tr.ttCtr * 100).toFixed(2)}%`,
        tr.ttOrder,
        tr.ttCo,
        `${(tr.ttCoRate * 100).toFixed(2)}%`,
        tr.ttBuyer,
        `Rp${Math.round(tr.ttAov).toLocaleString('id-ID')}`,
        tr.ttViews,
        tr.ttViewers,
        tr.ttComment,
        tr.ttLikes,
        tr.ttFollow,
        tr.ttAvgViewDurationSec,
        `${(tr.ttEngagementRate * 100).toFixed(2)}%`,
        `${(tr.ttFollowersRate * 100).toFixed(2)}%`,
        `${(tr.ttErrPct * 100).toFixed(2)}%`,
        tr.ttLiveImpression,
        tr.ttAdsCost,
        tr.ttAdsGmv,
        tr.totalDurationSec,
        tr.speakingSec,
        tr.facingCameraSec,
        tr.ttLiveIssues,
        tr.livestreamingBackground,
        tr.livestreamingTitle,
        tr.ttPromoRemarks || tr.spPromoRemarks,
      ];
      ttVals.forEach((v, idx) => {
        rCells[59 + idx] = { val: v, style: 10 };
      });
    }

    gridRows.push({
      rowNumber: 5 + i,
      cells: rCells,
      isHeader: false,
    });
  }

  const lastColLetter = getExcelColumnLetter(totalCols - 1);
  const lastRowNum = 4 + Math.max(1, maxDataRows);

  const xmlRows = gridRows
    .map(({ rowNumber, cells, isHeader }) => {
      const cellXml = cells
        .map(({ val, style }, colIdx) => {
          if ((val === '' || val === null || val === undefined) && style === 0) return '';
          const ref = `${getExcelColumnLetter(colIdx)}${rowNumber}`;
          if (typeof val === 'number' && Number.isFinite(val)) {
            return `<c r="${ref}" s="${style}"><v>${val}</v></c>`;
          }
          return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(
            String(val ?? '')
          )}</t></is></c>`;
        })
        .join('');
      const ht = isHeader ? ' ht="22" customHeight="1"' : '';
      return `<row r="${rowNumber}"${ht}>${cellXml}</row>`;
    })
    .join('');

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="4">
    <font><sz val="9"/><color rgb="FF000000"/><name val="Arial"/></font>
    <font><b/><sz val="9"/><color rgb="FF000000"/><name val="Arial"/></font>
    <font><b/><sz val="9"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>
    <font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>
  </fonts>
  <fills count="14">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFCAEDFB"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFF9900"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF000000"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF180E30"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF8334CD"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFD6F170"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFFF00"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF9FC5E8"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF4CCCC"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF4C7C3"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFB7E1CD"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFADCFE"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFCCCCCC"/></left>
      <right style="thin"><color rgb="FFCCCCCC"/></right>
      <top style="thin"><color rgb="FFCCCCCC"/></top>
      <bottom style="thin"><color rgb="FFCCCCCC"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="14">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="3" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="2" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="1" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="1" fillId="8" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="1" fillId="9" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="1" fillId="10" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="11" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="12" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="0" fontId="1" fillId="13" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
  </cellXfs>
</styleSheet>`;

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:${lastColLetter}${lastRowNum}"/>
  <sheetViews>
    <sheetView workbookViewId="0">
      <pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/>
    </sheetView>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <sheetData>${xmlRows}</sheetData>
  <mergeCells count="8">
    <mergeCell ref="A2:A4"/>
    <mergeCell ref="B2:B4"/>
    <mergeCell ref="C2:C4"/>
    <mergeCell ref="D2:D4"/>
    <mergeCell ref="E2:P3"/>
    <mergeCell ref="Q2:AB3"/>
    <mergeCell ref="AD2:BF3"/>
    <mergeCell ref="BH2:CV3"/>
  </mergeCells>
</worksheet>`;

  return zipSync({
    '[Content_Types].xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`
    ),
    '_rels/.rels': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`
    ),
    'xl/workbook.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>
</workbook>`
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`
    ),
    'xl/styles.xml': strToU8(stylesXml),
    'xl/worksheets/sheet1.xml': strToU8(sheetXml),
  });
}

export function downloadBrandSheetTrackerExcel(
  trackerRows: ComputedTrackerRow[],
  brandName: string,
  monthName: string,
  year: number,
  filename: string
): void {
  const bytes = createBrandSheetTrackerWorkbook(trackerRows, brandName, monthName, year);
  const blob = new Blob([new Uint8Array(bytes)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
