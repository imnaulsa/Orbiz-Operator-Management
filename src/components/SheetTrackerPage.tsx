import { useState, useMemo, useEffect } from 'react';
import { db } from '../lib/supabase';
import {
  calendarMonth,
  today,
  prettyDate,
  hourLabel,
} from '../lib/domain';
import type { Ctx } from './ProductionWorkspace';
import {
  prepareManagementRows,
  type ManagementDataRow,
} from '../lib/managementExport';
import { buildRealisticDummyProductionData } from '../lib/dummyProductionData';
import { getLiveCondition } from './ManagementData';
import {
  SHOPEE_TRACKER_HEADERS,
  TIKTOK_TRACKER_HEADERS,
  DAILY_COMPARISON_HEADERS,
  ENGLISH_MONTHS,
  LIVE_ISSUE_PRESETS,
  DESIGN_BACKGROUND_PRESETS,
  getDailyHeaderColor,
  getShopeeHeaderColor,
  getTiktokHeaderColor,
  getDailyCellBg,
  buildDefaultTrackerInput,
  computeTrackerRow,
  buildDailyComparisonRows,
  lookupHostBehaviourByLiveId,
  deriveIssueFromChecks,
  downloadBrandSheetTrackerExcel,
  type SessionTrackerInput,
  type ComputedTrackerRow,
} from '../lib/sheetTrackerData';

const MONTH_NAMES = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

const TRACKER_STORAGE_KEY = 'orbiz_sheet_tracker_inputs_v1';

interface TrackerFilterState {
  timeMode: 'month' | 'custom' | 'year';
  month: number; // 1-12
  year: number;
  customStart: string;
  customEnd: string;
  brand: string;
  location: string;
  host: string;
  status: string;
  issueFilter: 'all' | 'with_issue' | 'normal';
  search: string;
}

type TrackerTabMode = 'shopee' | 'tiktok' | 'daily' | 'full_sheet';

const fmtNum = (n: number) => Math.round(n).toLocaleString('id-ID');
const fmtRp = (n: number) => `Rp${Math.round(n).toLocaleString('id-ID')}`;
const fmtDec = (n: number, d = 2) =>
  Number.isFinite(n) ? n.toLocaleString('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d }) : '0';
const fmtPct = (ratio: number) =>
  Number.isFinite(ratio) ? `${(ratio * 100).toFixed(2)}%` : '0.00%';

export function SheetTrackerPage(
  c: Ctx & {
    setDateRange: (start: string, end: string) => void;
    onRefresh: () => void;
  }
) {
  const [profileNames, setProfileNames] = useState<Record<string, string>>({});
  const [selectedDetail, setSelectedDetail] = useState<ManagementDataRow | null>(null);
  const [exporting, setExporting] = useState(false);
  const [trackerView, setTrackerView] = useState<TrackerTabMode>('full_sheet');
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  // Saved custom tracker inputs per session.id
  const [customInputs, setCustomInputs] = useState<Record<string, SessionTrackerInput>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = window.localStorage.getItem(TRACKER_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Record<string, SessionTrackerInput>) : {};
    } catch {
      return {};
    }
  });

  // Form state when editing a session inside the modal
  const [formDraft, setFormDraft] = useState<SessionTrackerInput | null>(null);

  // Pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Initialize filter state from current date/start (default Brand: b_astra so it immediately shows ASTRA like input.xlsx)
  const currentDate = new Date();
  const initialYear = Number(c.start.slice(0, 4)) || currentDate.getFullYear();
  const initialMonth = Number(c.start.slice(5, 7)) || currentDate.getMonth() + 1;

  const [filters, setFilters] = useState<TrackerFilterState>({
    timeMode: 'month',
    month: initialMonth,
    year: initialYear,
    customStart: c.start,
    customEnd: c.end,
    brand: 'b_astra',
    location: 'all',
    host: 'all',
    status: 'all',
    issueFilter: 'all',
    search: '',
  });

  // Keyboard accessibility and body scroll lock for modal
  useEffect(() => {
    if (!selectedDetail) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedDetail(null);
    };
    window.addEventListener('keydown', onKeyDown);
    const origOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = origOverflow;
    };
  }, [selectedDetail]);

  // Load operator profile display names once
  useEffect(() => {
    let active = true;
    async function loadProfiles() {
      try {
        const { data } = await db().from('profiles').select('id, display_name');
        if (active && data) {
          const map: Record<string, string> = {};
          for (const p of data) {
            map[p.id] = p.display_name;
          }
          setProfileNames(map);
        }
      } catch {
        // Fallback gracefully
      }
    }
    void loadProfiles();
    return () => {
      active = false;
    };
  }, []);

  // Update date range when Month / Year or custom dates change
  const applyTimeFilter = (
    mode: TrackerFilterState['timeMode'],
    month: number,
    year: number,
    cStart = filters.customStart,
    cEnd = filters.customEnd
  ) => {
    if (mode === 'month') {
      const monthStr = String(month).padStart(2, '0');
      const p = calendarMonth(`${year}-${monthStr}-01`);
      c.setDateRange(p.start, p.end);
    } else if (mode === 'year') {
      c.setDateRange(`${year}-01-01`, `${year}-12-31`);
    } else {
      if (cStart && cEnd && cStart <= cEnd) {
        c.setDateRange(cStart, cEnd);
      }
    }
  };

  const handleMonthChange = (m: number) => {
    setFilters((prev) => ({ ...prev, month: m, timeMode: 'month' }));
    applyTimeFilter('month', m, filters.year);
    setPage(1);
  };

  const handleYearChange = (y: number) => {
    setFilters((prev) => ({ ...prev, year: y }));
    applyTimeFilter(filters.timeMode, filters.month, y);
    setPage(1);
  };

  const handleTimeModeChange = (mode: TrackerFilterState['timeMode']) => {
    setFilters((prev) => ({ ...prev, timeMode: mode }));
    applyTimeFilter(mode, filters.month, filters.year);
    setPage(1);
  };

  const handleQuickPreset = (preset: 'this_month' | 'last_month' | 'this_year') => {
    const now = new Date();
    if (preset === 'this_month') {
      const curYear = now.getFullYear();
      const curMonth = now.getMonth() + 1;
      setFilters((prev) => ({
        ...prev,
        timeMode: 'month',
        year: curYear,
        month: curMonth,
      }));
      applyTimeFilter('month', curMonth, curYear);
    } else if (preset === 'last_month') {
      const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lmYear = lastMonthDate.getFullYear();
      const lmMonth = lastMonthDate.getMonth() + 1;
      setFilters((prev) => ({
        ...prev,
        timeMode: 'month',
        year: lmYear,
        month: lmMonth,
      }));
      applyTimeFilter('month', lmMonth, lmYear);
    } else if (preset === 'this_year') {
      const curYear = now.getFullYear();
      setFilters((prev) => ({
        ...prev,
        timeMode: 'year',
        year: curYear,
      }));
      applyTimeFilter('year', filters.month, curYear);
    }
    setPage(1);
  };

  // Compute effective dataset incorporating realistic production records + ASTRA seed
  const effectiveData = useMemo(() => {
    return buildRealisticDummyProductionData(c.data, profileNames);
  }, [c.data, profileNames]);

  // Prepare all base rows from production snapshot
  const allRows = useMemo(() => {
    return prepareManagementRows(effectiveData.data, effectiveData.profiles);
  }, [effectiveData]);

  // Distinct brand list for filter dropdown & brand switcher pills
  const uniqueBrands = useMemo(() => {
    const map = new Map<string, string>();
    effectiveData.data.brands.forEach((b) => map.set(b.id, b.name));
    effectiveData.data.quotations.forEach((q) => {
      if (q.brand_id) map.set(q.brand_id, q.brand);
      else map.set(q.brand, q.brand);
    });
    return Array.from(map.entries());
  }, [effectiveData.data.brands, effectiveData.data.quotations]);

  // Compute all tracker rows with formulas
  const allTrackerRows = useMemo<ComputedTrackerRow[]>(() => {
    const list = allRows.map((r) => computeTrackerRow(r, customInputs[r.session.id]));
    return list.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.baseRow.session.start_hour - b.baseRow.session.start_hour;
    });
  }, [allRows, customInputs]);

  // Filter tracker rows by Brand, Location, Host, Status, Issue, and Search
  const filteredTrackerRows = useMemo<ComputedTrackerRow[]>(() => {
    const qSearch = filters.search.trim().toLowerCase();

    return allTrackerRows.filter((tr) => {
      const r = tr.baseRow;
      if (filters.brand !== 'all') {
        const q = r.quotation;
        if (q?.brand_id !== filters.brand && q?.brand !== filters.brand && r.brandName !== filters.brand) {
          return false;
        }
      }
      if (filters.location !== 'all' && r.session.location_id !== filters.location) {
        return false;
      }
      if (filters.host !== 'all' && r.session.host_id !== filters.host) {
        return false;
      }
      if (filters.status !== 'all' && tr.status !== filters.status) {
        return false;
      }
      if (filters.issueFilter === 'with_issue' && !tr.liveIssues && !tr.ttLiveIssues) {
        return false;
      }
      if (filters.issueFilter === 'normal' && (tr.liveIssues || tr.ttLiveIssues)) {
        return false;
      }
      if (qSearch) {
        const match =
          tr.brandDisplayName.toLowerCase().includes(qSearch) ||
          tr.shopId.toLowerCase().includes(qSearch) ||
          tr.liveId.toLowerCase().includes(qSearch) ||
          tr.host.toLowerCase().includes(qSearch) ||
          tr.studio.toLowerCase().includes(qSearch) ||
          tr.liveIssues.toLowerCase().includes(qSearch) ||
          tr.livestreamingBackground.toLowerCase().includes(qSearch) ||
          tr.livestreamingTitle.toLowerCase().includes(qSearch) ||
          tr.spPromoRemarks.toLowerCase().includes(qSearch);
        if (!match) return false;
      }
      return true;
    });
  }, [allTrackerRows, filters]);

  // Active brand label for Sheet Tracker Banner (e.g., ASTRA)
  const activeBrandLabel = useMemo(() => {
    if (filters.brand === 'all') {
      return 'SEMUA BRAND';
    }
    const found = uniqueBrands.find(([id, name]) => id === filters.brand || name === filters.brand);
    return (found ? found[1] : filters.brand).toUpperCase();
  }, [filters.brand, uniqueBrands]);

  const activeEnglishMonth = ENGLISH_MONTHS[(filters.month - 1) % 12] ?? 'OCTOBER';

  // Compute Daily Comparison (`SUMIF` by Date) for the filtered brand rows
  const dailyComparison = useMemo(() => {
    return buildDailyComparisonRows(filteredTrackerRows);
  }, [filteredTrackerRows]);

  // Compute KPI metrics for the top strip
  const metrics = useMemo(() => {
    const totalSessions = filteredTrackerRows.length;
    const totalHours = filteredTrackerRows.reduce((n, r) => n + r.duration, 0);
    const totalShopeeGmv = filteredTrackerRows.reduce((n, r) => n + r.spGmv, 0);
    const totalShopeeViews = filteredTrackerRows.reduce((n, r) => n + r.spViews, 0);
    const totalShopeeCo = filteredTrackerRows.reduce((n, r) => n + r.spCo, 0);
    const totalTiktokGmv = filteredTrackerRows.reduce((n, r) => n + r.ttGmvActual, 0);
    const totalTiktokViews = filteredTrackerRows.reduce((n, r) => n + r.ttViews, 0);
    const totalTiktokCo = filteredTrackerRows.reduce((n, r) => n + r.ttCo, 0);
    const issueCount = filteredTrackerRows.filter((r) => Boolean(r.liveIssues || r.ttLiveIssues)).length;

    return {
      totalSessions,
      totalHours,
      totalShopeeGmv,
      totalShopeeViews,
      totalShopeeCo,
      totalTiktokGmv,
      totalTiktokViews,
      totalTiktokCo,
      issueCount,
    };
  }, [filteredTrackerRows]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredTrackerRows.length / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const paginatedTrackerRows = useMemo(() => {
    const startIdx = (currentPage - 1) * pageSize;
    return filteredTrackerRows.slice(startIdx, startIdx + pageSize);
  }, [filteredTrackerRows, currentPage, pageSize]);

  // Open modal for a specific row and initialize formDraft
  const openSessionModal = (row: ManagementDataRow) => {
    const existing = customInputs[row.session.id] ?? buildDefaultTrackerInput(row);
    setFormDraft({ ...existing });
    setSelectedDetail(row);
  };

  // Switch session inside the Form Input modal
  const handleSelectSessionInModal = (sessionId: string) => {
    const targetRow = allRows.find((r) => r.session.id === sessionId);
    if (!targetRow) return;
    const existing = customInputs[targetRow.session.id] ?? buildDefaultTrackerInput(targetRow);
    setSelectedDetail(targetRow);
    setFormDraft({ ...existing });
  };

  // Save Form Input to state and localStorage
  const handleSaveTrackerForm = () => {
    if (!selectedDetail || !formDraft) return;
    const nextMap = {
      ...customInputs,
      [selectedDetail.session.id]: formDraft,
    };
    setCustomInputs(nextMap);
    try {
      window.localStorage.setItem(TRACKER_STORAGE_KEY, JSON.stringify(nextMap));
    } catch {
      // Ignore storage quota errors
    }
    setSaveNotice(
      `Data Sheet Tracker untuk sesi ${selectedDetail.brandName} (${selectedDetail.session.work_date}, Host ${selectedDetail.hostName}) berhasil disimpan.`
    );
    setSelectedDetail(null);
    setTimeout(() => setSaveNotice(null), 5000);
  };

  // Export Sheet Tracker (`input.xlsx` layout per Brand)
  const handleExportBrandTracker = () => {
    if (!filteredTrackerRows.length) return;
    setExporting(true);
    try {
      const cleanBrand =
        filters.brand === 'all'
          ? 'ALL_BRANDS'
          : activeBrandLabel.replace(/[^A-Z0-9]+/gi, '_');
      const filename = `Sheet_Tracker_${cleanBrand}_${activeEnglishMonth}_${filters.year}.xlsx`;
      downloadBrandSheetTrackerExcel(
        filteredTrackerRows,
        filters.brand === 'all' ? 'ASTRA' : activeBrandLabel,
        activeEnglishMonth,
        filters.year,
        filename
      );
    } catch (err) {
      window.alert('Gagal mengekspor Sheet Tracker: ' + String(err));
    } finally {
      setExporting(false);
    }
  };

  const handleResetFilters = () => {
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth() + 1;
    setFilters({
      timeMode: 'month',
      month: curMonth,
      year: curYear,
      customStart: today(),
      customEnd: today(),
      brand: 'b_astra',
      location: 'all',
      host: 'all',
      status: 'all',
      issueFilter: 'all',
      search: '',
    });
    applyTimeFilter('month', curMonth, curYear);
    setPage(1);
  };

  // Live preview of auto-calculated fields inside Form Modal
  const modalPreview = useMemo(() => {
    if (!selectedDetail || !formDraft) return null;
    return computeTrackerRow(selectedDetail, formDraft);
  }, [selectedDetail, formDraft]);

  return (
    <div className="management-data-page">
      {saveNotice && (
        <div className="notice" style={{ background: '#edf9f1', borderColor: '#bce6c9', color: '#165630', fontWeight: 600 }}>
          {saveNotice}
        </div>
      )}

      {/* COMPACT KPI METRIC STRIP (SAME UI DESIGN) */}
      <div className="mgmt-metrics">
        <div className="mgmt-metric-card">
          <span className="metric-label">Brand & Sesi Aktif</span>
          <strong className="metric-val" style={{ color: '#6c32b9' }}>
            {activeBrandLabel}
          </strong>
          <small className="metric-sub">
            {metrics.totalSessions} sesi · {metrics.totalHours} jam live
          </small>
        </div>

        <div className="mgmt-metric-card">
          <span className="metric-label">Total GMV Shopee</span>
          <strong className="metric-val" style={{ color: '#1e7040' }}>
            Rp{fmtNum(metrics.totalShopeeGmv)}
          </strong>
          <small className="metric-sub">
            {fmtNum(metrics.totalShopeeCo)} CO · {fmtNum(metrics.totalShopeeViews)} Views
          </small>
        </div>

        <div className="mgmt-metric-card">
          <span className="metric-label">Total GMV TikTok</span>
          <strong className="metric-val" style={{ color: '#1b588c' }}>
            Rp{fmtNum(metrics.totalTiktokGmv)}
          </strong>
          <small className="metric-sub">
            {fmtNum(metrics.totalTiktokCo)} CO · {fmtNum(metrics.totalTiktokViews)} Views
          </small>
        </div>

        <div className="mgmt-metric-card">
          <span className="metric-label">GMV / Jam (Shopee)</span>
          <strong className="metric-val">
            Rp{fmtNum(metrics.totalHours > 0 ? metrics.totalShopeeGmv / metrics.totalHours : 0)}
          </strong>
          <small className="metric-sub">Rata-rata produktivitas per jam</small>
        </div>

        <div className="mgmt-metric-card">
          <span className="metric-label">Sesi dengan Live Issue</span>
          <strong
            className="metric-val"
            style={{ color: metrics.issueCount > 0 ? '#8c5208' : '#1e7040' }}
          >
            {metrics.issueCount} sesi
          </strong>
          <small className="metric-sub">Terkoneksi dari Form & Checklist</small>
        </div>
      </div>

      {/* COMPACT FILTER PANEL */}
      <section className="mgmt-filter-card">
        <div className="mgmt-filter-head">
          <h2>
            <span>Filter Sheet Tracker Berdasarkan Brand</span>
            <span className="pill" style={{ fontSize: '0.72rem', padding: '2px 8px', fontWeight: 500 }}>
              {c.start} s/d {c.end}
            </span>
          </h2>
          <div className="row-actions">
            <button
              type="button"
              className="primary"
              disabled={c.busy || !allRows.length}
              onClick={() => {
                const target = filteredTrackerRows[0]?.baseRow ?? allRows[0];
                if (target) openSessionModal(target);
              }}
              style={{ fontWeight: 600 }}
            >
              + Form Input Sheet Tracker
            </button>
            <button
              type="button"
              disabled={c.busy}
              onClick={() => handleQuickPreset('this_month')}
              className={filters.timeMode === 'month' && filters.month === currentDate.getMonth() + 1 ? 'selected' : ''}
            >
              Bulan Ini
            </button>
            <button type="button" disabled={c.busy} onClick={() => handleQuickPreset('last_month')}>
              Bulan Lalu
            </button>
            <button
              type="button"
              disabled={c.busy}
              onClick={() => handleQuickPreset('this_year')}
              className={filters.timeMode === 'year' ? 'selected' : ''}
            >
              Tahun {currentDate.getFullYear()}
            </button>
            <button type="button" disabled={c.busy} onClick={c.onRefresh}>
              Refresh
            </button>
          </div>
        </div>

        {/* TIME BAR */}
        <div className="mgmt-time-row">
          <label style={{ minWidth: 140 }}>
            Mode Waktu
            <select
              value={filters.timeMode}
              disabled={c.busy}
              onChange={(e) => handleTimeModeChange(e.target.value as TrackerFilterState['timeMode'])}
            >
              <option value="month">Per Bulan & Tahun</option>
              <option value="year">Sepanjang Tahun</option>
              <option value="custom">Rentang Kustom</option>
            </select>
          </label>

          {filters.timeMode === 'month' && (
            <>
              <label style={{ minWidth: 120 }}>
                Bulan
                <select
                  value={filters.month}
                  disabled={c.busy}
                  onChange={(e) => handleMonthChange(Number(e.target.value))}
                >
                  {MONTH_NAMES.map((name, idx) => (
                    <option key={name} value={idx + 1}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ minWidth: 90 }}>
                Tahun
                <select
                  value={filters.year}
                  disabled={c.busy}
                  onChange={(e) => handleYearChange(Number(e.target.value))}
                >
                  {[2024, 2025, 2026, 2027, 2028].map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          {filters.timeMode === 'year' && (
            <label style={{ minWidth: 100 }}>
              Tahun Penuh
              <select
                value={filters.year}
                disabled={c.busy}
                onChange={(e) => handleYearChange(Number(e.target.value))}
              >
                {[2024, 2025, 2026, 2027, 2028].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
          )}

          {filters.timeMode === 'custom' && (
            <>
              <label>
                Dari Tanggal
                <input
                  type="date"
                  value={filters.customStart}
                  max={filters.customEnd}
                  disabled={c.busy}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val) {
                      setFilters((prev) => ({ ...prev, customStart: val }));
                      applyTimeFilter('custom', filters.month, filters.year, val, filters.customEnd);
                    }
                  }}
                />
              </label>
              <label>
                Sampai Tanggal
                <input
                  type="date"
                  value={filters.customEnd}
                  min={filters.customStart}
                  disabled={c.busy}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val) {
                      setFilters((prev) => ({ ...prev, customEnd: val }));
                      applyTimeFilter('custom', filters.month, filters.year, filters.customStart, val);
                    }
                  }}
                />
              </label>
            </>
          )}
        </div>

        {/* DETAILED PROPERTY FILTERS */}
        <div className="mgmt-filter-grid">
          <label>
            Brand (Output Tracker)
            <select
              value={filters.brand}
              disabled={c.busy}
              onChange={(e) => {
                setFilters((prev) => ({ ...prev, brand: e.target.value }));
                setPage(1);
              }}
            >
              <option value="all">Semua Brand</option>
              {uniqueBrands.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Lokasi
            <select
              value={filters.location}
              disabled={c.busy}
              onChange={(e) => {
                setFilters((prev) => ({ ...prev, location: e.target.value }));
                setPage(1);
              }}
            >
              <option value="all">Semua Lokasi</option>
              <option value="jakarta">Jakarta</option>
              <option value="bandung">Bandung</option>
            </select>
          </label>

          <label>
            Host
            <select
              value={filters.host}
              disabled={c.busy}
              onChange={(e) => {
                setFilters((prev) => ({ ...prev, host: e.target.value }));
                setPage(1);
              }}
            >
              <option value="all">Semua Host</option>
              {effectiveData.data.hosts.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.display_name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Status Campaign
            <select
              value={filters.status}
              disabled={c.busy}
              onChange={(e) => {
                setFilters((prev) => ({ ...prev, status: e.target.value }));
                setPage(1);
              }}
            >
              <option value="all">Semua Status</option>
              <option value="BAU">BAU</option>
              <option value="DOUBLE DATE">DOUBLE DATE</option>
              <option value="PAYDAY">PAYDAY</option>
            </select>
          </label>

          <label>
            Filter Live Issue
            <select
              value={filters.issueFilter}
              disabled={c.busy}
              onChange={(e) => {
                setFilters((prev) => ({
                  ...prev,
                  issueFilter: e.target.value as TrackerFilterState['issueFilter'],
                }));
                setPage(1);
              }}
            >
              <option value="all">Semua Sesi</option>
              <option value="with_issue">Ada Live Issue (Restricted/Banned/Hold)</option>
              <option value="normal">Normal / Tanpa Issue</option>
            </select>
          </label>

          <label className="search-col" style={{ gridColumn: 'span 2' }}>
            Pencarian Cepat
            <input
              type="search"
              placeholder="Cari Live ID (11026_0911_STAST), Shop ID, Host, Studio, Issue, atau Background..."
              value={filters.search}
              disabled={c.busy}
              onChange={(e) => {
                setFilters((prev) => ({ ...prev, search: e.target.value }));
                setPage(1);
              }}
            />
          </label>
        </div>

        <div className="mgmt-filter-foot">
          <span className="muted">
            Menampilkan <strong>{filteredTrackerRows.length}</strong> sesi untuk Brand{' '}
            <strong>{activeBrandLabel}</strong>
          </span>
          <button type="button" onClick={handleResetFilters} disabled={c.busy}>
            Reset ke Brand ASTRA
          </button>
        </div>
      </section>

      {/* SHEET TRACKER TABLE SECTION (PERSIS INPUT.XLSX BERDASARKAN BRAND) */}
      <section className="card schedule-table-card">
        {/* Brand Selector Pills & View Mode Bar */}
        <div className="tracker-brand-bar">
          <div className="tracker-brand-pills">
            <strong style={{ fontSize: '0.78rem', color: '#241c30', marginRight: 4 }}>
              Pilih Brand Output:
            </strong>
            {uniqueBrands.map(([id, name]) => (
              <button
                key={id}
                type="button"
                className={filters.brand === id || filters.brand === name ? 'selected' : ''}
                onClick={() => {
                  setFilters((prev) => ({ ...prev, brand: id }));
                  setPage(1);
                }}
              >
                {name}
              </button>
            ))}
            <button
              type="button"
              className={filters.brand === 'all' ? 'selected' : ''}
              onClick={() => {
                setFilters((prev) => ({ ...prev, brand: 'all' }));
                setPage(1);
              }}
            >
              Semua Brand
            </button>
          </div>

          <div className="tracker-brand-pills">
            <button
              type="button"
              className={trackerView === 'shopee' ? 'selected' : ''}
              onClick={() => setTrackerView('shopee')}
            >
              Shopee Tracker (29 Kolom)
            </button>
            <button
              type="button"
              className={trackerView === 'tiktok' ? 'selected' : ''}
              onClick={() => setTrackerView('tiktok')}
            >
              TikTok Tracker (41 Kolom)
            </button>
            <button
              type="button"
              className={trackerView === 'daily' ? 'selected' : ''}
              onClick={() => setTrackerView('daily')}
            >
              Daily Comparison (28 Kolom)
            </button>
            <button
              type="button"
              className={trackerView === 'full_sheet' ? 'selected' : ''}
              onClick={() => setTrackerView('full_sheet')}
            >
              Full Sheet (Persis input.xlsx)
            </button>
          </div>
        </div>

        <div className="schedule-secondary-actions">
          <div className="row-actions" style={{ alignItems: 'center' }}>
            <button
              type="button"
              className="primary"
              disabled={c.busy || exporting || !filteredTrackerRows.length}
              onClick={handleExportBrandTracker}
              style={{ fontWeight: 600 }}
            >
              {exporting
                ? 'Membuat Sheet Tracker...'
                : `Export Sheet Tracker (.xlsx) - ${activeBrandLabel} (${filteredTrackerRows.length} Sesi)`}
            </button>
            <small className="muted">
              Format persis <code>input.xlsx</code>: Date–Host link Production · GMV–AOV manual & rumus · Live Issue dari Form · Live Background siap connect Design · Duration–Facing Camera via Host Behaviour Monitoring.
            </small>
          </div>

          <label style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <span>Baris per halaman:</span>
            <select
              value={pageSize}
              disabled={c.busy}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              {[10, 20, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* TABLE 1: SHOPEE TRACKER (29 COLUMNS: AD..BF in input.xlsx) */}
        {trackerView === 'shopee' && (
          <div className="table-wrap">
            <table className="management-table tracker-grid excel-exact-grid">
              <thead>
                <tr className="group-banner">
                  <th
                    colSpan={29}
                    style={{ background: '#FF9900', color: '#FFFFFF', textAlign: 'center', fontWeight: 700 }}
                  >
                    LIVESTREAMING SHOPEE {activeBrandLabel} {activeEnglishMonth} {filters.year}
                  </th>
                  <th style={{ background: '#FF9900', color: '#FFFFFF', textAlign: 'center', fontWeight: 700 }}>
                    AKSI
                  </th>
                </tr>
                <tr>
                  {SHOPEE_TRACKER_HEADERS.map((h, idx) => {
                    const colStyle = getShopeeHeaderColor(idx);
                    return (
                      <th
                        key={h}
                        style={{
                          background: colStyle.bg,
                          color: colStyle.fg,
                          fontWeight: 700,
                          textAlign: 'center',
                        }}
                      >
                        {h}
                      </th>
                    );
                  })}
                  <th
                    style={{
                      background: '#FFFF00',
                      color: '#000000',
                      fontWeight: 700,
                      textAlign: 'center',
                    }}
                  >
                    Input / Edit
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedTrackerRows.map((tr) => (
                  <tr key={tr.baseRow.session.id}>
                    <td style={{ textAlign: 'center', fontWeight: 700 }}>{tr.shopId}</td>
                    <td style={{ textAlign: 'center', fontFamily: 'monospace', fontWeight: 600 }}>{tr.liveId}</td>
                    <td style={{ textAlign: 'center' }}>{tr.dateShort}</td>
                    <td style={{ textAlign: 'center' }}>{tr.day}</td>
                    <td style={{ textAlign: 'center' }}>{tr.lsTime || 'HOLD'}</td>
                    <td style={{ textAlign: 'center' }}>{tr.session}</td>
                    <td style={{ textAlign: 'center', fontWeight: 600 }}>{tr.duration}</td>
                    <td style={{ textAlign: 'center' }}>{tr.status}</td>
                    <td style={{ textAlign: 'center' }}>{tr.location}</td>
                    <td style={{ textAlign: 'center' }}>{tr.studio}</td>
                    <td style={{ textAlign: 'center', fontWeight: 700 }}>{tr.host || 'HOLD'}</td>
                    <td style={{ textAlign: 'right' }}>{fmtNum(tr.spGmvTarget)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtNum(tr.spViewsTarget)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtNum(tr.spViews)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtNum(tr.spTopViews)}</td>
                    <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>{tr.spAvgViewingDuration}</td>
                    <td style={{ textAlign: 'right' }}>{fmtNum(tr.spCo)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtRp(tr.spGmv)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtPct(tr.spViewsToCo)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtRp(tr.spAov)}</td>
                    <td style={{ textAlign: 'center', fontWeight: tr.liveIssues ? 700 : 400 }}>
                      {tr.liveIssues || ''}
                    </td>
                    <td style={{ textAlign: 'center' }}>{tr.livestreamingBackground || ''}</td>
                    <td>{tr.livestreamingTitle || ''}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{fmtNum(tr.totalDurationSec)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{fmtNum(tr.speakingSec)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{fmtNum(tr.facingCameraSec)}</td>
                    <td style={{ textAlign: 'center' }}>{tr.spAds || ''}</td>
                    <td style={{ textAlign: 'right' }}>{tr.spCoins ? fmtNum(tr.spCoins) : ''}</td>
                    <td>{tr.spPromoRemarks || ''}</td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        className="btn-detail"
                        style={{ minHeight: 24, padding: '2px 8px', fontSize: '0.72rem', fontWeight: 600 }}
                        onClick={() => openSessionModal(tr.baseRow)}
                      >
                        Input Tracker
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* TABLE 2: TIKTOK TRACKER (41 COLUMNS: BH..CV in input.xlsx) */}
        {trackerView === 'tiktok' && (
          <div className="table-wrap">
            <table className="management-table tracker-grid excel-exact-grid">
              <thead>
                <tr className="group-banner">
                  <th
                    colSpan={41}
                    style={{ background: '#180E30', color: '#FFFFFF', textAlign: 'center', fontWeight: 700 }}
                  >
                    LIVESTREAMING TIKTOK {activeBrandLabel} {activeEnglishMonth} {filters.year}
                  </th>
                  <th style={{ background: '#180E30', color: '#FFFFFF', textAlign: 'center', fontWeight: 700 }}>
                    AKSI
                  </th>
                </tr>
                <tr>
                  {TIKTOK_TRACKER_HEADERS.map((h, idx) => {
                    const colStyle = getTiktokHeaderColor(idx);
                    return (
                      <th
                        key={h}
                        style={{
                          background: colStyle.bg,
                          color: colStyle.fg,
                          fontWeight: 700,
                          textAlign: 'center',
                        }}
                      >
                        {h}
                      </th>
                    );
                  })}
                  <th
                    style={{
                      background: '#FFFF00',
                      color: '#000000',
                      fontWeight: 700,
                      textAlign: 'center',
                    }}
                  >
                    Input / Edit
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedTrackerRows.map((tr) => (
                  <tr key={tr.baseRow.session.id}>
                    <td style={{ textAlign: 'center', fontWeight: 700 }}>{tr.shopId}</td>
                    <td style={{ textAlign: 'center', fontFamily: 'monospace', fontWeight: 600 }}>{tr.liveId}</td>
                    <td style={{ textAlign: 'center' }}>{tr.dateShort}</td>
                    <td style={{ textAlign: 'center' }}>{tr.day}</td>
                    <td style={{ textAlign: 'center' }}>{tr.lsTime || 'HOLD'}</td>
                    <td style={{ textAlign: 'center' }}>{tr.session}</td>
                    <td style={{ textAlign: 'center', fontWeight: 600 }}>{tr.duration}</td>
                    <td style={{ textAlign: 'center' }}>{tr.status}</td>
                    <td style={{ textAlign: 'center' }}>{tr.location}</td>
                    <td style={{ textAlign: 'center' }}>{tr.studio}</td>
                    <td style={{ textAlign: 'center', fontWeight: 700 }}>{tr.host || 'HOLD'}</td>
                    <td style={{ textAlign: 'right' }}>{fmtRp(tr.ttGmvTarget)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtNum(tr.ttViewsTarget)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtRp(tr.ttGmvActual)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtNum(tr.ttProductImpression)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtNum(tr.ttProductClick)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtPct(tr.ttCtr)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtNum(tr.ttOrder)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtNum(tr.ttCo)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtPct(tr.ttCoRate)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtNum(tr.ttBuyer)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtRp(tr.ttAov)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtNum(tr.ttViews)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtNum(tr.ttViewers)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtNum(tr.ttComment)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtNum(tr.ttLikes)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtNum(tr.ttFollow)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtNum(tr.ttAvgViewDurationSec)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtPct(tr.ttEngagementRate)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtPct(tr.ttFollowersRate)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtPct(tr.ttErrPct)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtNum(tr.ttLiveImpression)}</td>
                    <td style={{ textAlign: 'center' }}>{tr.ttAdsCost || ''}</td>
                    <td style={{ textAlign: 'center' }}>{tr.ttAdsGmv || ''}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{fmtNum(tr.totalDurationSec)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{fmtNum(tr.speakingSec)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{fmtNum(tr.facingCameraSec)}</td>
                    <td style={{ textAlign: 'center', fontWeight: tr.ttLiveIssues ? 700 : 400 }}>
                      {tr.ttLiveIssues || ''}
                    </td>
                    <td style={{ textAlign: 'center' }}>{tr.livestreamingBackground || ''}</td>
                    <td>{tr.livestreamingTitle || ''}</td>
                    <td>{tr.ttPromoRemarks || tr.spPromoRemarks || ''}</td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        className="btn-detail"
                        style={{ minHeight: 24, padding: '2px 8px', fontSize: '0.72rem', fontWeight: 600 }}
                        onClick={() => openSessionModal(tr.baseRow)}
                      >
                        Input Tracker
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* TABLE 3: DAILY COMPARISON (28 COLUMNS: A..AB + OVERALL PERFORMANCE in input.xlsx) */}
        {trackerView === 'daily' && (
          <div className="table-wrap">
            <table className="management-table tracker-grid excel-exact-grid">
              <thead>
                <tr className="group-banner">
                  {DAILY_COMPARISON_HEADERS.slice(0, 4).map((h) => (
                    <th
                      key={h}
                      rowSpan={2}
                      style={{
                        background: '#CAEDFB',
                        color: '#000000',
                        fontWeight: 700,
                        textAlign: 'center',
                        verticalAlign: 'middle',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                  <th
                    colSpan={12}
                    style={{ background: '#FF9900', color: '#FFFFFF', fontWeight: 700, textAlign: 'center' }}
                  >
                    Shopee Daily Comparison
                  </th>
                  <th
                    colSpan={12}
                    style={{ background: '#000000', color: '#FFFFFF', fontWeight: 700, textAlign: 'center' }}
                  >
                    Tiktok Daily Comparison
                  </th>
                </tr>
                <tr>
                  {DAILY_COMPARISON_HEADERS.slice(4).map((h, i) => {
                    const colIdx = i + 4;
                    const colStyle = getDailyHeaderColor(colIdx);
                    return (
                      <th
                        key={`dc_hdr_${colIdx}`}
                        style={{
                          background: colStyle.bg,
                          color: colStyle.fg,
                          fontWeight: 700,
                          textAlign: 'center',
                        }}
                      >
                        {h}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {[...dailyComparison.dailyRows, dailyComparison.subTotal].map((d) => {
                  const isSub = d.date === 'SUB TOTAL';
                  const cellStyle = (colIdx: number, align: 'left' | 'center' | 'right' = 'right') => {
                    const bg = getDailyCellBg(colIdx, isSub);
                    return {
                      background: bg ?? undefined,
                      fontWeight: isSub ? 700 : 400,
                      textAlign: align,
                      color: '#000000',
                    } as const;
                  };
                  return (
                    <tr key={d.date}>
                      <td style={{ ...cellStyle(0, 'center'), fontWeight: 700 }}>{d.dateDisplay}</td>
                      <td style={cellStyle(1, 'center')}>{d.day}</td>
                      <td style={cellStyle(2, 'center')}>{d.hoursShopee}</td>
                      <td style={cellStyle(3, 'center')}>{d.hoursTiktok}</td>
                      <td style={cellStyle(4)}>{fmtNum(d.spGmvTarget)}</td>
                      <td style={cellStyle(5)}>{fmtNum(d.spGmvHourTarget)}</td>
                      <td style={cellStyle(6)}>{isSub ? fmtRp(d.spGmv) : fmtNum(d.spGmv)}</td>
                      <td style={cellStyle(7)}>{isSub ? fmtRp(d.spGmvHour) : fmtDec(d.spGmvHour, 1)}</td>
                      <td style={cellStyle(8)}>{fmtPct(d.spGmvAch)}</td>
                      <td style={cellStyle(9)}>{fmtPct(d.spGmvHourAch)}</td>
                      <td style={cellStyle(10)}>{fmtNum(d.spViewsTarget)}</td>
                      <td style={cellStyle(11)}>{fmtNum(d.spViewsHourTarget)}</td>
                      <td style={cellStyle(12)}>{fmtNum(d.spViews)}</td>
                      <td style={cellStyle(13)}>{fmtDec(d.spViewsHour, 1)}</td>
                      <td style={cellStyle(14)}>{fmtPct(d.spViewsAch)}</td>
                      <td style={cellStyle(15)}>{fmtPct(d.spViewsHourAch)}</td>
                      <td style={cellStyle(16)}>{fmtRp(d.ttGmvTarget)}</td>
                      <td style={cellStyle(17)}>{fmtRp(d.ttGmvHourTarget)}</td>
                      <td style={cellStyle(18)}>{fmtRp(d.ttGmv)}</td>
                      <td style={cellStyle(19)}>{fmtRp(d.ttGmvHour)}</td>
                      <td style={cellStyle(20)}>{fmtPct(d.ttGmvAch)}</td>
                      <td style={cellStyle(21)}>{fmtPct(d.ttGmvHourAch)}</td>
                      <td style={cellStyle(22)}>{fmtNum(d.ttViewsTarget)}</td>
                      <td style={cellStyle(23)}>{fmtNum(d.ttViewsHourTarget)}</td>
                      <td style={cellStyle(24)}>{fmtNum(d.ttViews)}</td>
                      <td style={cellStyle(25)}>{fmtDec(d.ttViewsHour, 1)}</td>
                      <td style={cellStyle(26)}>{fmtPct(d.ttViewsAch)}</td>
                      <td style={cellStyle(27)}>{fmtPct(d.ttViewsHourAch)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* TABLE 4: FULL SHEET SIDE-BY-SIDE (PERSIS INPUT.XLSX: DAILY COMPARISON + SHOPEE + TIKTOK) */}
        {trackerView === 'full_sheet' && (
          <div className="table-wrap">
            <table className="management-table tracker-grid excel-exact-grid">
              <thead>
                <tr className="group-banner">
                  {/* A2:D4 merged vertically across rows 2-4 with #CAEDFB */}
                  {DAILY_COMPARISON_HEADERS.slice(0, 4).map((h) => (
                    <th
                      key={`full_dc_top_${h}`}
                      rowSpan={2}
                      style={{
                        background: '#CAEDFB',
                        color: '#000000',
                        fontWeight: 700,
                        textAlign: 'center',
                        verticalAlign: 'middle',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                  {/* E2:P3 Shopee Daily Comparison (#FF9900) */}
                  <th
                    colSpan={12}
                    style={{ background: '#FF9900', color: '#FFFFFF', fontWeight: 700, textAlign: 'center' }}
                  >
                    Shopee Daily Comparison
                  </th>
                  {/* Q2:AB3 Tiktok Daily Comparison (#000000) */}
                  <th
                    colSpan={12}
                    style={{ background: '#000000', color: '#FFFFFF', fontWeight: 700, textAlign: 'center' }}
                  >
                    Tiktok Daily Comparison
                  </th>
                  {/* AC separator */}
                  <th rowSpan={2} style={{ background: '#FFFFFF', border: 'none', minWidth: 16 }} />
                  {/* AD2:BF3 LIVESTREAMING SHOPEE <BRAND> <MONTH> <YEAR> (#FF9900) */}
                  <th
                    colSpan={29}
                    style={{ background: '#FF9900', color: '#FFFFFF', fontWeight: 700, textAlign: 'center' }}
                  >
                    LIVESTREAMING SHOPEE {activeBrandLabel} {activeEnglishMonth} {filters.year}
                  </th>
                  {/* BG separator */}
                  <th rowSpan={2} style={{ background: '#FFFFFF', border: 'none', minWidth: 16 }} />
                  {/* BH2:CV3 LIVESTREAMING TIKTOK <BRAND> <MONTH> <YEAR> (#180E30) */}
                  <th
                    colSpan={41}
                    style={{ background: '#180E30', color: '#FFFFFF', fontWeight: 700, textAlign: 'center' }}
                  >
                    LIVESTREAMING TIKTOK {activeBrandLabel} {activeEnglishMonth} {filters.year}
                  </th>
                  <th
                    rowSpan={2}
                    style={{
                      background: '#FFFF00',
                      color: '#000000',
                      fontWeight: 700,
                      textAlign: 'center',
                      verticalAlign: 'middle',
                    }}
                  >
                    Input / Edit
                  </th>
                </tr>
                <tr>
                  {/* Daily Comparison E4:AB4 */}
                  {DAILY_COMPARISON_HEADERS.slice(4).map((h, i) => {
                    const colIdx = i + 4;
                    const colStyle = getDailyHeaderColor(colIdx);
                    return (
                      <th
                        key={`dc_${colIdx}`}
                        style={{
                          background: colStyle.bg,
                          color: colStyle.fg,
                          fontWeight: 700,
                          textAlign: 'center',
                        }}
                      >
                        {h}
                      </th>
                    );
                  })}
                  {/* Shopee Tracker AD4:BF4 */}
                  {SHOPEE_TRACKER_HEADERS.map((h, i) => {
                    const colStyle = getShopeeHeaderColor(i);
                    return (
                      <th
                        key={`sp_${i}`}
                        style={{
                          background: colStyle.bg,
                          color: colStyle.fg,
                          fontWeight: 700,
                          textAlign: 'center',
                        }}
                      >
                        {h}
                      </th>
                    );
                  })}
                  {/* TikTok Tracker BH4:CV4 */}
                  {TIKTOK_TRACKER_HEADERS.map((h, i) => {
                    const colStyle = getTiktokHeaderColor(i);
                    return (
                      <th
                        key={`tt_${i}`}
                        style={{
                          background: colStyle.bg,
                          color: colStyle.fg,
                          fontWeight: 700,
                          textAlign: 'center',
                        }}
                      >
                        {h}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const dailyWithSub = [...dailyComparison.dailyRows, dailyComparison.subTotal];
                  const totalRows = Math.max(dailyWithSub.length, paginatedTrackerRows.length);
                  return Array.from({ length: totalRows }).map((_, idx) => {
                    const d = dailyWithSub[idx];
                    const isSub = d?.date === 'SUB TOTAL';
                    const tr = paginatedTrackerRows[idx];
                    const dcStyle = (colIdx: number, align: 'left' | 'center' | 'right' = 'right') => {
                      if (!d) return { textAlign: align } as const;
                      const bg = getDailyCellBg(colIdx, isSub);
                      return {
                        background: bg ?? undefined,
                        fontWeight: isSub ? 700 : 400,
                        textAlign: align,
                        color: '#000000',
                      } as const;
                    };

                    return (
                      <tr key={`full_${idx}`}>
                        {/* Daily Comparison A..AB */}
                        <td style={{ ...dcStyle(0, 'center'), fontWeight: d ? 700 : 400 }}>
                          {d ? d.dateDisplay : ''}
                        </td>
                        <td style={dcStyle(1, 'center')}>{d ? d.day : ''}</td>
                        <td style={dcStyle(2, 'center')}>{d ? d.hoursShopee : ''}</td>
                        <td style={dcStyle(3, 'center')}>{d ? d.hoursTiktok : ''}</td>
                        <td style={dcStyle(4)}>{d ? fmtNum(d.spGmvTarget) : ''}</td>
                        <td style={dcStyle(5)}>{d ? fmtNum(d.spGmvHourTarget) : ''}</td>
                        <td style={dcStyle(6)}>{d ? (isSub ? fmtRp(d.spGmv) : fmtNum(d.spGmv)) : ''}</td>
                        <td style={dcStyle(7)}>
                          {d ? (isSub ? fmtRp(d.spGmvHour) : fmtDec(d.spGmvHour, 1)) : ''}
                        </td>
                        <td style={dcStyle(8)}>{d ? fmtPct(d.spGmvAch) : ''}</td>
                        <td style={dcStyle(9)}>{d ? fmtPct(d.spGmvHourAch) : ''}</td>
                        <td style={dcStyle(10)}>{d ? fmtNum(d.spViewsTarget) : ''}</td>
                        <td style={dcStyle(11)}>{d ? fmtNum(d.spViewsHourTarget) : ''}</td>
                        <td style={dcStyle(12)}>{d ? fmtNum(d.spViews) : ''}</td>
                        <td style={dcStyle(13)}>{d ? fmtDec(d.spViewsHour, 1) : ''}</td>
                        <td style={dcStyle(14)}>{d ? fmtPct(d.spViewsAch) : ''}</td>
                        <td style={dcStyle(15)}>{d ? fmtPct(d.spViewsHourAch) : ''}</td>
                        <td style={dcStyle(16)}>{d ? fmtRp(d.ttGmvTarget) : ''}</td>
                        <td style={dcStyle(17)}>{d ? fmtRp(d.ttGmvHourTarget) : ''}</td>
                        <td style={dcStyle(18)}>{d ? fmtRp(d.ttGmv) : ''}</td>
                        <td style={dcStyle(19)}>{d ? fmtRp(d.ttGmvHour) : ''}</td>
                        <td style={dcStyle(20)}>{d ? fmtPct(d.ttGmvAch) : ''}</td>
                        <td style={dcStyle(21)}>{d ? fmtPct(d.ttGmvHourAch) : ''}</td>
                        <td style={dcStyle(22)}>{d ? fmtNum(d.ttViewsTarget) : ''}</td>
                        <td style={dcStyle(23)}>{d ? fmtNum(d.ttViewsHourTarget) : ''}</td>
                        <td style={dcStyle(24)}>{d ? fmtNum(d.ttViews) : ''}</td>
                        <td style={dcStyle(25)}>{d ? fmtDec(d.ttViewsHour, 1) : ''}</td>
                        <td style={dcStyle(26)}>{d ? fmtPct(d.ttViewsAch) : ''}</td>
                        <td style={dcStyle(27)}>{d ? fmtPct(d.ttViewsHourAch) : ''}</td>

                        {/* AC blank separator */}
                        <td style={{ background: '#FFFFFF', borderTop: 'none', borderBottom: 'none' }} />

                        {/* Shopee AD..BF */}
                        <td style={{ textAlign: 'center', fontWeight: 700 }}>{tr ? tr.shopId : ''}</td>
                        <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>{tr ? tr.liveId : ''}</td>
                        <td style={{ textAlign: 'center' }}>{tr ? tr.dateShort : ''}</td>
                        <td style={{ textAlign: 'center' }}>{tr ? tr.day : ''}</td>
                        <td style={{ textAlign: 'center' }}>{tr ? tr.lsTime || 'HOLD' : ''}</td>
                        <td style={{ textAlign: 'center' }}>{tr ? tr.session : ''}</td>
                        <td style={{ textAlign: 'center' }}>{tr ? tr.duration : ''}</td>
                        <td style={{ textAlign: 'center' }}>{tr ? tr.status : ''}</td>
                        <td style={{ textAlign: 'center' }}>{tr ? tr.location : ''}</td>
                        <td style={{ textAlign: 'center' }}>{tr ? tr.studio : ''}</td>
                        <td style={{ textAlign: 'center', fontWeight: 700 }}>{tr ? tr.host || 'HOLD' : ''}</td>
                        <td style={{ textAlign: 'right' }}>{tr ? fmtNum(tr.spGmvTarget) : ''}</td>
                        <td style={{ textAlign: 'right' }}>{tr ? fmtNum(tr.spViewsTarget) : ''}</td>
                        <td style={{ textAlign: 'right' }}>{tr ? fmtNum(tr.spViews) : ''}</td>
                        <td style={{ textAlign: 'right' }}>{tr ? fmtNum(tr.spTopViews) : ''}</td>
                        <td style={{ textAlign: 'center' }}>{tr ? tr.spAvgViewingDuration : ''}</td>
                        <td style={{ textAlign: 'right' }}>{tr ? fmtNum(tr.spCo) : ''}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{tr ? fmtRp(tr.spGmv) : ''}</td>
                        <td style={{ textAlign: 'right' }}>{tr ? fmtPct(tr.spViewsToCo) : ''}</td>
                        <td style={{ textAlign: 'right' }}>{tr ? fmtRp(tr.spAov) : ''}</td>
                        <td style={{ textAlign: 'center', fontWeight: tr?.liveIssues ? 700 : 400 }}>
                          {tr ? tr.liveIssues : ''}
                        </td>
                        <td style={{ textAlign: 'center' }}>{tr ? tr.livestreamingBackground : ''}</td>
                        <td>{tr ? tr.livestreamingTitle : ''}</td>
                        <td style={{ textAlign: 'right' }}>{tr ? fmtNum(tr.totalDurationSec) : ''}</td>
                        <td style={{ textAlign: 'right' }}>{tr ? fmtNum(tr.speakingSec) : ''}</td>
                        <td style={{ textAlign: 'right' }}>{tr ? fmtNum(tr.facingCameraSec) : ''}</td>
                        <td style={{ textAlign: 'center' }}>{tr ? tr.spAds : ''}</td>
                        <td style={{ textAlign: 'right' }}>{tr && tr.spCoins ? fmtNum(tr.spCoins) : ''}</td>
                        <td>{tr ? tr.spPromoRemarks : ''}</td>

                        {/* BG blank separator */}
                        <td style={{ background: '#FFFFFF', borderTop: 'none', borderBottom: 'none' }} />

                        {/* TikTok BH..CV */}
                        <td style={{ textAlign: 'center', fontWeight: 700 }}>{tr ? tr.shopId : ''}</td>
                        <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>{tr ? tr.liveId : ''}</td>
                        <td style={{ textAlign: 'center' }}>{tr ? tr.dateShort : ''}</td>
                        <td style={{ textAlign: 'center' }}>{tr ? tr.day : ''}</td>
                        <td style={{ textAlign: 'center' }}>{tr ? tr.lsTime || 'HOLD' : ''}</td>
                        <td style={{ textAlign: 'center' }}>{tr ? tr.session : ''}</td>
                        <td style={{ textAlign: 'center' }}>{tr ? tr.duration : ''}</td>
                        <td style={{ textAlign: 'center' }}>{tr ? tr.status : ''}</td>
                        <td style={{ textAlign: 'center' }}>{tr ? tr.location : ''}</td>
                        <td style={{ textAlign: 'center' }}>{tr ? tr.studio : ''}</td>
                        <td style={{ textAlign: 'center', fontWeight: 700 }}>{tr ? tr.host || 'HOLD' : ''}</td>
                        <td style={{ textAlign: 'right' }}>{tr ? fmtRp(tr.ttGmvTarget) : ''}</td>
                        <td style={{ textAlign: 'right' }}>{tr ? fmtNum(tr.ttViewsTarget) : ''}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{tr ? fmtRp(tr.ttGmvActual) : ''}</td>
                        <td style={{ textAlign: 'right' }}>{tr ? fmtNum(tr.ttProductImpression) : ''}</td>
                        <td style={{ textAlign: 'right' }}>{tr ? fmtNum(tr.ttProductClick) : ''}</td>
                        <td style={{ textAlign: 'right' }}>{tr ? fmtPct(tr.ttCtr) : ''}</td>
                        <td style={{ textAlign: 'right' }}>{tr ? fmtNum(tr.ttOrder) : ''}</td>
                        <td style={{ textAlign: 'right' }}>{tr ? fmtNum(tr.ttCo) : ''}</td>
                        <td style={{ textAlign: 'right' }}>{tr ? fmtPct(tr.ttCoRate) : ''}</td>
                        <td style={{ textAlign: 'right' }}>{tr ? fmtNum(tr.ttBuyer) : ''}</td>
                        <td style={{ textAlign: 'right' }}>{tr ? fmtRp(tr.ttAov) : ''}</td>
                        <td style={{ textAlign: 'right' }}>{tr ? fmtNum(tr.ttViews) : ''}</td>
                        <td style={{ textAlign: 'right' }}>{tr ? fmtNum(tr.ttViewers) : ''}</td>
                        <td style={{ textAlign: 'right' }}>{tr ? fmtNum(tr.ttComment) : ''}</td>
                        <td style={{ textAlign: 'right' }}>{tr ? fmtNum(tr.ttLikes) : ''}</td>
                        <td style={{ textAlign: 'right' }}>{tr ? fmtNum(tr.ttFollow) : ''}</td>
                        <td style={{ textAlign: 'right' }}>{tr ? fmtNum(tr.ttAvgViewDurationSec) : ''}</td>
                        <td style={{ textAlign: 'right' }}>{tr ? fmtPct(tr.ttEngagementRate) : ''}</td>
                        <td style={{ textAlign: 'right' }}>{tr ? fmtPct(tr.ttFollowersRate) : ''}</td>
                        <td style={{ textAlign: 'right' }}>{tr ? fmtPct(tr.ttErrPct) : ''}</td>
                        <td style={{ textAlign: 'right' }}>{tr ? fmtNum(tr.ttLiveImpression) : ''}</td>
                        <td style={{ textAlign: 'center' }}>{tr ? tr.ttAdsCost : ''}</td>
                        <td style={{ textAlign: 'center' }}>{tr ? tr.ttAdsGmv : ''}</td>
                        <td style={{ textAlign: 'right' }}>{tr ? fmtNum(tr.totalDurationSec) : ''}</td>
                        <td style={{ textAlign: 'right' }}>{tr ? fmtNum(tr.speakingSec) : ''}</td>
                        <td style={{ textAlign: 'right' }}>{tr ? fmtNum(tr.facingCameraSec) : ''}</td>
                        <td style={{ textAlign: 'center', fontWeight: tr?.ttLiveIssues ? 700 : 400 }}>
                          {tr ? tr.ttLiveIssues : ''}
                        </td>
                        <td style={{ textAlign: 'center' }}>{tr ? tr.livestreamingBackground : ''}</td>
                        <td>{tr ? tr.livestreamingTitle : ''}</td>
                        <td>{tr ? tr.ttPromoRemarks || tr.spPromoRemarks : ''}</td>
                        <td style={{ textAlign: 'center' }}>
                          {tr ? (
                            <button
                              type="button"
                              className="btn-detail"
                              style={{ minHeight: 24, padding: '2px 8px', fontSize: '0.72rem', fontWeight: 600 }}
                              onClick={() => openSessionModal(tr.baseRow)}
                            >
                              Input Tracker
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        )}

        {!filteredTrackerRows.length && (
          <p className="empty">
            Tidak ada data sesi Sheet Tracker untuk filter yang dipilih. Pilih Brand lain atau klik Reset ke Brand ASTRA.
          </p>
        )}

        {/* PAGINATION BAR */}
        {filteredTrackerRows.length > 0 && (
          <div className="schedule-pagination">
            <span>
              Menampilkan {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredTrackerRows.length)} dari {filteredTrackerRows.length} sesi ({activeBrandLabel})
            </span>
            <div className="row-actions" role="navigation" aria-label="Halaman Sheet Tracker">
              <button
                disabled={c.busy || currentPage === 1}
                onClick={() => setPage(currentPage - 1)}
              >
                Sebelumnya
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(
                  (n) =>
                    n === 1 ||
                    n === totalPages ||
                    Math.abs(n - currentPage) <= 2
                )
                .map((n, i, a) => (
                  <span key={n}>
                    {i > 0 && n > a[i - 1] + 1 && <span> … </span>}
                    <button
                      className={n === currentPage ? 'primary' : ''}
                      onClick={() => setPage(n)}
                    >
                      {n}
                    </button>
                  </span>
                ))}
              <button
                disabled={c.busy || currentPage === totalPages}
                onClick={() => setPage(currentPage + 1)}
              >
                Berikutnya
              </button>
            </div>
          </div>
        )}
      </section>

      {/* MODAL FORM INPUT SHEET TRACKER (SAME DESIGN AS PREVIOUS MODAL) */}
      {selectedDetail && formDraft && modalPreview && (() => {
        const cond = getLiveCondition(selectedDetail);
        return (
          <div
            className="mgmt-modal-backdrop"
            onClick={() => setSelectedDetail(null)}
            role="presentation"
          >
            <div
              className="mgmt-modal-container"
              style={{ maxWidth: 980 }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="tracker-modal-title"
            >
              {/* Modal Header */}
              <div className="mgmt-modal-header">
                <div className="header-left">
                  <div className="header-eyebrow">
                    <span className="pill" style={{ background: '#f0e8f8', color: '#6c32b9', fontWeight: 700, padding: '2px 8px' }}>
                      {modalPreview.liveId}
                    </span>
                    <span>•</span>
                    <span>
                      {prettyDate(selectedDetail.session.work_date)} ({hourLabel(selectedDetail.session.start_hour)}–{hourLabel(selectedDetail.session.end_hour)} WIB)
                    </span>
                  </div>
                  <h2 id="tracker-modal-title" className="header-title">
                    <span>Form Input Sheet Tracker · {selectedDetail.brandName}</span>
                    <span className="pill" style={{ fontSize: '0.75rem', padding: '2px 8px' }}>
                      {selectedDetail.platform}
                    </span>
                    <span className={'cond-badge ' + cond.badgeClass} style={{ fontSize: '0.75rem' }}>
                      {cond.label}
                    </span>
                  </h2>
                </div>

                <button
                  type="button"
                  className="mgmt-modal-close"
                  onClick={() => setSelectedDetail(null)}
                  aria-label="Tutup Modal"
                  title="Tutup Modal (Esc)"
                >
                  X
                </button>
              </div>

              {/* Modal Body */}
              <div className="mgmt-modal-body">
                {/* SECTION 1: AUTO-LINK DARI DATA PRODUCTION (Date - Host) */}
                <div className="mgmt-modal-meta-grid" style={{ gridTemplateColumns: '1fr' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                    <strong style={{ fontSize: '0.82rem', color: '#241c30' }}>
                      1. Kolom Date – Host (Otomatis Nge-Link dari Data Production)
                    </strong>
                    <span className="mgmt-source-tag prod">Link Data Production</span>
                  </div>

                  <div className="mgmt-form-grid cols-4" style={{ marginTop: 4 }}>
                    <div className="mgmt-form-field" style={{ gridColumn: 'span 2' }}>
                      <span className="field-label">Pilih Sesi dari Data Production</span>
                      <select
                        value={selectedDetail.session.id}
                        onChange={(e) => handleSelectSessionInModal(e.target.value)}
                      >
                        {allRows.map((r) => (
                          <option key={r.session.id} value={r.session.id}>
                            [{r.brandName}] {r.session.work_date} ({hourLabel(r.session.start_hour)}-{hourLabel(r.session.end_hour)}) · Host {r.hostName} · {r.studioName}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="mgmt-form-field">
                      <span className="field-label">Shop ID (Production)</span>
                      <input type="text" readOnly value={modalPreview.shopId} />
                    </div>

                    <div className="mgmt-form-field">
                      <span className="field-label">Live ID (Production)</span>
                      <input type="text" readOnly value={modalPreview.liveId} />
                    </div>

                    <div className="mgmt-form-field">
                      <span className="field-label">Date</span>
                      <input type="text" readOnly value={modalPreview.date} />
                    </div>

                    <div className="mgmt-form-field">
                      <span className="field-label">Day</span>
                      <input type="text" readOnly value={modalPreview.day} />
                    </div>

                    <div className="mgmt-form-field">
                      <span className="field-label">LS Time</span>
                      <input type="text" readOnly value={modalPreview.lsTime || 'HOLD'} />
                    </div>

                    <div className="mgmt-form-field">
                      <span className="field-label">Session & Duration (Jam)</span>
                      <input
                        type="text"
                        readOnly
                        value={`Session ${modalPreview.session} · ${modalPreview.duration} Jam`}
                      />
                    </div>

                    <div className="mgmt-form-field">
                      <span className="field-label">Status Campaign</span>
                      <select
                        value={formDraft.statusOverride || modalPreview.status}
                        onChange={(e) =>
                          setFormDraft((prev) =>
                            prev ? { ...prev, statusOverride: e.target.value } : prev
                          )
                        }
                      >
                        <option value="BAU">BAU</option>
                        <option value="DOUBLE DATE">DOUBLE DATE</option>
                        <option value="PAYDAY">PAYDAY</option>
                        <option value="CAMPAIGN">CAMPAIGN</option>
                      </select>
                    </div>

                    <div className="mgmt-form-field">
                      <span className="field-label">Location</span>
                      <input type="text" readOnly value={modalPreview.location} />
                    </div>

                    <div className="mgmt-form-field">
                      <span className="field-label">Studio</span>
                      <input type="text" readOnly value={modalPreview.studio} />
                    </div>

                    <div className="mgmt-form-field">
                      <span className="field-label">Host</span>
                      <input type="text" readOnly value={modalPreview.host || 'HOLD'} />
                    </div>
                  </div>
                </div>

                {/* SECTION 2: MANUAL INPUT GMV - AOV (SHOPEE & TIKTOK SIDE BY SIDE) */}
                <div className="mgmt-feedback-split">
                  {/* Shopee Manual Input Card */}
                  <div className="mgmt-feedback-card host">
                    <div className="mgmt-card-head">
                      <h3>2A. Input Performa Shopee (GMV Target – AOV)</h3>
                      <span className="mgmt-source-tag manual">Input Manual</span>
                    </div>

                    <div className="mgmt-form-grid">
                      <div className="mgmt-form-field">
                        <span className="field-label">GMV Target</span>
                        <input
                          type="number"
                          min={0}
                          value={formDraft.spGmvTarget}
                          onChange={(e) =>
                            setFormDraft((p) => (p ? { ...p, spGmvTarget: Number(e.target.value) } : p))
                          }
                        />
                      </div>

                      <div className="mgmt-form-field">
                        <span className="field-label">Views Target</span>
                        <input
                          type="number"
                          min={0}
                          value={formDraft.spViewsTarget}
                          onChange={(e) =>
                            setFormDraft((p) => (p ? { ...p, spViewsTarget: Number(e.target.value) } : p))
                          }
                        />
                      </div>

                      <div className="mgmt-form-field">
                        <span className="field-label">Views</span>
                        <input
                          type="number"
                          min={0}
                          value={formDraft.spViews}
                          onChange={(e) =>
                            setFormDraft((p) => (p ? { ...p, spViews: Number(e.target.value) } : p))
                          }
                        />
                      </div>

                      <div className="mgmt-form-field">
                        <span className="field-label">Top Views</span>
                        <input
                          type="number"
                          min={0}
                          value={formDraft.spTopViews}
                          onChange={(e) =>
                            setFormDraft((p) => (p ? { ...p, spTopViews: Number(e.target.value) } : p))
                          }
                        />
                      </div>

                      <div className="mgmt-form-field">
                        <span className="field-label">Avg. Viewing Duration</span>
                        <input
                          type="text"
                          placeholder="00:00:47"
                          value={formDraft.spAvgViewingDuration}
                          onChange={(e) =>
                            setFormDraft((p) => (p ? { ...p, spAvgViewingDuration: e.target.value } : p))
                          }
                        />
                      </div>

                      <div className="mgmt-form-field">
                        <span className="field-label">CO (Checkout)</span>
                        <input
                          type="number"
                          min={0}
                          value={formDraft.spCo}
                          onChange={(e) =>
                            setFormDraft((p) => (p ? { ...p, spCo: Number(e.target.value) } : p))
                          }
                        />
                      </div>

                      <div className="mgmt-form-field">
                        <span className="field-label">GMV (Rp)</span>
                        <input
                          type="number"
                          min={0}
                          value={formDraft.spGmv}
                          onChange={(e) =>
                            setFormDraft((p) => (p ? { ...p, spGmv: Number(e.target.value) } : p))
                          }
                        />
                      </div>

                      <div className="mgmt-form-field">
                        <span className="field-label">Views To CO (Auto)</span>
                        <input
                          type="text"
                          readOnly
                          value={`${fmtPct(modalPreview.spViewsToCo)} (${modalPreview.spViewsToCo.toFixed(6)})`}
                        />
                      </div>

                      <div className="mgmt-form-field">
                        <span className="field-label">AOV (Auto = GMV/CO)</span>
                        <input
                          type="text"
                          readOnly
                          value={`Rp${fmtDec(modalPreview.spAov, 2)}`}
                        />
                      </div>

                      <div className="mgmt-form-field">
                        <span className="field-label">ADS</span>
                        <input
                          type="text"
                          placeholder="Nominal / Keterangan Ads"
                          value={formDraft.spAds}
                          onChange={(e) =>
                            setFormDraft((p) => (p ? { ...p, spAds: e.target.value } : p))
                          }
                        />
                      </div>

                      <div className="mgmt-form-field">
                        <span className="field-label">Coins</span>
                        <input
                          type="number"
                          min={0}
                          value={formDraft.spCoins}
                          onChange={(e) =>
                            setFormDraft((p) => (p ? { ...p, spCoins: Number(e.target.value) } : p))
                          }
                        />
                      </div>

                      <div className="mgmt-form-field">
                        <span className="field-label">Promo Remarks</span>
                        <input
                          type="text"
                          placeholder="Catatan promo sesi..."
                          value={formDraft.spPromoRemarks}
                          onChange={(e) =>
                            setFormDraft((p) => (p ? { ...p, spPromoRemarks: e.target.value } : p))
                          }
                        />
                      </div>
                    </div>
                  </div>

                  {/* TikTok Manual Input Card */}
                  <div className="mgmt-feedback-card op">
                    <div className="mgmt-card-head">
                      <h3>2B. Input Performa TikTok (GMV Actual – AOV/ERR)</h3>
                      <span className="mgmt-source-tag manual">Input Manual</span>
                    </div>

                    <div className="mgmt-form-grid">
                      <div className="mgmt-form-field">
                        <span className="field-label">GMV Actual (Rp)</span>
                        <input
                          type="number"
                          min={0}
                          value={formDraft.ttGmvActual}
                          onChange={(e) =>
                            setFormDraft((p) => (p ? { ...p, ttGmvActual: Number(e.target.value) } : p))
                          }
                        />
                      </div>

                      <div className="mgmt-form-field">
                        <span className="field-label">Product Impression</span>
                        <input
                          type="number"
                          min={0}
                          value={formDraft.ttProductImpression}
                          onChange={(e) =>
                            setFormDraft((p) => (p ? { ...p, ttProductImpression: Number(e.target.value) } : p))
                          }
                        />
                      </div>

                      <div className="mgmt-form-field">
                        <span className="field-label">Product Click</span>
                        <input
                          type="number"
                          min={0}
                          value={formDraft.ttProductClick}
                          onChange={(e) =>
                            setFormDraft((p) => (p ? { ...p, ttProductClick: Number(e.target.value) } : p))
                          }
                        />
                      </div>

                      <div className="mgmt-form-field">
                        <span className="field-label">Order</span>
                        <input
                          type="number"
                          min={0}
                          value={formDraft.ttOrder}
                          onChange={(e) =>
                            setFormDraft((p) => (p ? { ...p, ttOrder: Number(e.target.value) } : p))
                          }
                        />
                      </div>

                      <div className="mgmt-form-field">
                        <span className="field-label">CO & Buyer</span>
                        <input
                          type="number"
                          min={0}
                          value={formDraft.ttCo}
                          onChange={(e) =>
                            setFormDraft((p) =>
                              p ? { ...p, ttCo: Number(e.target.value), ttBuyer: Number(e.target.value) } : p
                            )
                          }
                        />
                      </div>

                      <div className="mgmt-form-field">
                        <span className="field-label">AOV TikTok (Auto)</span>
                        <input type="text" readOnly value={`Rp${fmtNum(modalPreview.ttAov)}`} />
                      </div>

                      <div className="mgmt-form-field">
                        <span className="field-label">Views</span>
                        <input
                          type="number"
                          min={0}
                          value={formDraft.ttViews}
                          onChange={(e) =>
                            setFormDraft((p) => (p ? { ...p, ttViews: Number(e.target.value) } : p))
                          }
                        />
                      </div>

                      <div className="mgmt-form-field">
                        <span className="field-label">Viewers</span>
                        <input
                          type="number"
                          min={0}
                          value={formDraft.ttViewers}
                          onChange={(e) =>
                            setFormDraft((p) => (p ? { ...p, ttViewers: Number(e.target.value) } : p))
                          }
                        />
                      </div>

                      <div className="mgmt-form-field">
                        <span className="field-label">Avg. View Duration (s)</span>
                        <input
                          type="number"
                          min={0}
                          value={formDraft.ttAvgViewDurationSec}
                          onChange={(e) =>
                            setFormDraft((p) => (p ? { ...p, ttAvgViewDurationSec: Number(e.target.value) } : p))
                          }
                        />
                      </div>

                      <div className="mgmt-form-field">
                        <span className="field-label">Comment / Likes / Follow</span>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
                          <input
                            type="number"
                            title="Comment"
                            value={formDraft.ttComment}
                            onChange={(e) =>
                              setFormDraft((p) => (p ? { ...p, ttComment: Number(e.target.value) } : p))
                            }
                          />
                          <input
                            type="number"
                            title="Likes"
                            value={formDraft.ttLikes}
                            onChange={(e) =>
                              setFormDraft((p) => (p ? { ...p, ttLikes: Number(e.target.value) } : p))
                            }
                          />
                          <input
                            type="number"
                            title="Follow"
                            value={formDraft.ttFollow}
                            onChange={(e) =>
                              setFormDraft((p) => (p ? { ...p, ttFollow: Number(e.target.value) } : p))
                            }
                          />
                        </div>
                      </div>

                      <div className="mgmt-form-field">
                        <span className="field-label">CTR & CO Rate (Auto)</span>
                        <input
                          type="text"
                          readOnly
                          value={`CTR ${fmtPct(modalPreview.ttCtr)} · CO ${fmtPct(modalPreview.ttCoRate)}`}
                        />
                      </div>

                      <div className="mgmt-form-field">
                        <span className="field-label">ERR (%) Decimal</span>
                        <input
                          type="number"
                          step="0.0001"
                          min={0}
                          value={formDraft.ttErrPct}
                          onChange={(e) =>
                            setFormDraft((p) => (p ? { ...p, ttErrPct: Number(e.target.value) } : p))
                          }
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* SECTION 3, 4, 5: LIVE ISSUE (FORM), LIVE BACKGROUND (DESIGN), HOST BEHAVIOUR MONITORING */}
                <div className="mgmt-feedback-split">
                  {/* Card 3 & 4: Live Issue (Form) + Live Background (Design) + Title */}
                  <div className="mgmt-feedback-card host">
                    <div className="mgmt-card-head">
                      <h3>3. Live Issue (Form) & Live Background (Design)</h3>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <span className="mgmt-source-tag form">Connect Form</span>
                        <span className="mgmt-source-tag design">Connect Design</span>
                      </div>
                    </div>

                    <div className="mgmt-form-grid cols-2">
                      <div className="mgmt-form-field">
                        <span className="field-label">
                          <span>Live issues (Connect dari Form)</span>
                          <button
                            type="button"
                            style={{ minHeight: 20, padding: '0 6px', fontSize: '0.66rem' }}
                            onClick={() => {
                              const pulled = deriveIssueFromChecks(selectedDetail);
                              setFormDraft((p) =>
                                p ? { ...p, liveIssues: pulled, ttLiveIssues: pulled } : p
                              );
                            }}
                          >
                            Tarik dari Checklist
                          </button>
                        </span>
                        <select
                          value={
                            LIVE_ISSUE_PRESETS.includes(formDraft.liveIssues as never)
                              ? formDraft.liveIssues
                              : '__custom__'
                          }
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val !== '__custom__') {
                              setFormDraft((p) =>
                                p
                                  ? {
                                      ...p,
                                      liveIssues: val,
                                      ttLiveIssues: val,
                                      durationOverride:
                                        val === 'Hold Due To Electrical Issue' ? 0 : null,
                                    }
                                  : p
                              );
                            }
                          }}
                        >
                          <option value="">Normal / Tidak Ada Issue</option>
                          <option value="Restricted">Restricted</option>
                          <option value="VIOLOATION">VIOLOATION</option>
                          <option value="Banned">Banned</option>
                          <option value="Hold Due To Electrical Issue">Hold Due To Electrical Issue (Durasi 0)</option>
                          <option value="Audio Wireless Interference">Audio Wireless Interference</option>
                          <option value="Network Packet Loss / RTO">Network Packet Loss / RTO</option>
                          <option value="Camera Overheat / Autofocus">Camera Overheat / Autofocus</option>
                          <option value="Host Late Arrival">Host Late Arrival</option>
                          <option value="__custom__">Custom Issue / Catatan Form...</option>
                        </select>
                      </div>

                      <div className="mgmt-form-field">
                        <span className="field-label">Detail / Custom Live Issue</span>
                        <input
                          type="text"
                          placeholder="Kosongkan jika lancar, atau isi issue..."
                          value={formDraft.liveIssues}
                          onChange={(e) =>
                            setFormDraft((p) =>
                              p ? { ...p, liveIssues: e.target.value, ttLiveIssues: e.target.value } : p
                            )
                          }
                        />
                      </div>

                      <div className="mgmt-form-field">
                        <span className="field-label">Livestreaming Background (Connect Design)</span>
                        <select
                          value={
                            DESIGN_BACKGROUND_PRESETS.some(
                              (d) => d.code === formDraft.livestreamingBackground
                            )
                              ? formDraft.livestreamingBackground
                              : '__custom_bg__'
                          }
                          onChange={(e) => {
                            if (e.target.value !== '__custom_bg__') {
                              setFormDraft((p) =>
                                p ? { ...p, livestreamingBackground: e.target.value } : p
                              );
                            }
                          }}
                        >
                          {DESIGN_BACKGROUND_PRESETS.map((d) => (
                            <option key={d.id} value={d.code}>
                              {d.label}
                            </option>
                          ))}
                          <option value="__custom_bg__">Custom Kode / Link Design...</option>
                        </select>
                      </div>

                      <div className="mgmt-form-field">
                        <span className="field-label">Kode / Aset Background Design</span>
                        <input
                          type="text"
                          placeholder="Contoh: DSN-BG-BAU-01"
                          value={formDraft.livestreamingBackground}
                          onChange={(e) =>
                            setFormDraft((p) =>
                              p ? { ...p, livestreamingBackground: e.target.value } : p
                            )
                          }
                        />
                      </div>

                      <div className="mgmt-form-field" style={{ gridColumn: 'span 2' }}>
                        <span className="field-label">Livestreaming Tittle</span>
                        <input
                          type="text"
                          placeholder="Judul sesi livestreaming..."
                          value={formDraft.livestreamingTitle}
                          onChange={(e) =>
                            setFormDraft((p) =>
                              p ? { ...p, livestreamingTitle: e.target.value } : p
                            )
                          }
                        />
                      </div>
                    </div>
                  </div>

                  {/* Card 5: Host Behaviour Monitoring (Total Duration - Facing Camera) */}
                  <div className="mgmt-feedback-card op">
                    <div className="mgmt-card-head">
                      <h3>4. Host Behaviour Monitoring (Via Live ID)</h3>
                      <span className="mgmt-source-tag hbm">Host Behaviour Monitoring</span>
                    </div>

                    <div className="mgmt-checklist-list">
                      <div className="mgmt-check-row">
                        <span className="muted">Kunci Sinkronisasi (XLOOKUP Live ID):</span>
                        <strong style={{ fontFamily: 'monospace', color: '#1b588c' }}>
                          {modalPreview.liveId}
                        </strong>
                      </div>
                    </div>

                    <div className="mgmt-form-grid">
                      <div className="mgmt-form-field">
                        <span className="field-label">Total Duration (s)</span>
                        <input
                          type="number"
                          min={0}
                          value={formDraft.totalDurationSec}
                          onChange={(e) =>
                            setFormDraft((p) =>
                              p ? { ...p, totalDurationSec: Number(e.target.value) } : p
                            )
                          }
                        />
                      </div>

                      <div className="mgmt-form-field">
                        <span className="field-label">Speaking (s)</span>
                        <input
                          type="number"
                          min={0}
                          value={formDraft.speakingSec}
                          onChange={(e) =>
                            setFormDraft((p) =>
                              p ? { ...p, speakingSec: Number(e.target.value) } : p
                            )
                          }
                        />
                      </div>

                      <div className="mgmt-form-field">
                        <span className="field-label">Facing Camera (s)</span>
                        <input
                          type="number"
                          min={0}
                          value={formDraft.facingCameraSec}
                          onChange={(e) =>
                            setFormDraft((p) =>
                              p ? { ...p, facingCameraSec: Number(e.target.value) } : p
                            )
                          }
                        />
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                      <small className="muted">
                        Rasio Speaking:{' '}
                        <strong>
                          {formDraft.totalDurationSec > 0
                            ? fmtPct(formDraft.speakingSec / formDraft.totalDurationSec)
                            : '0%'}
                        </strong>{' '}
                        · Facing Camera:{' '}
                        <strong>
                          {formDraft.totalDurationSec > 0
                            ? fmtPct(formDraft.facingCameraSec / formDraft.totalDurationSec)
                            : '0%'}
                        </strong>
                      </small>
                      <button
                        type="button"
                        style={{ minHeight: 28, padding: '3px 10px', fontSize: '0.75rem' }}
                        onClick={() => {
                          const synced = lookupHostBehaviourByLiveId(
                            modalPreview.liveId,
                            modalPreview.duration
                          );
                          setFormDraft((p) =>
                            p
                              ? {
                                  ...p,
                                  totalDurationSec: synced.totalDurationSec,
                                  speakingSec: synced.speakingSec,
                                  facingCameraSec: synced.facingCameraSec,
                                }
                              : p
                          );
                        }}
                      >
                        Sync Ulang via Live ID
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="mgmt-modal-footer">
                <span className="muted" style={{ fontSize: '0.75rem' }}>
                  Tekan <kbd style={{ padding: '1px 5px', background: '#eee', borderRadius: 4 }}>Esc</kbd> atau klik di luar untuk menutup
                </span>
                <div className="row-actions">
                  <button
                    type="button"
                    onClick={() => setSelectedDetail(null)}
                  >
                    Batal / Tutup
                  </button>
                  <button
                    type="button"
                    className="primary"
                    onClick={handleSaveTrackerForm}
                  >
                    Simpan ke Sheet Tracker
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

