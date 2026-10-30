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
  downloadManagementExcelFile,
  type ManagementDataRow,
} from '../lib/managementExport';
import { buildRealisticDummyProductionData } from '../lib/dummyProductionData';

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

export interface LiveConditionInfo {
  type: 'lancar' | 'kendala' | 'pending_op' | 'pending_host' | 'belum_check';
  label: string;
  badgeClass: string;
  bannerClass: string;
  bannerText: string;
}

export function getLiveCondition(r: ManagementDataRow): LiveConditionInfo {
  if (r.hostCheckStatus !== 'Sudah' && r.opCheckStatus !== 'Sudah') {
    return {
      type: 'belum_check',
      label: 'Belum Check',
      badgeClass: 'cond-belum',
      bannerClass: 'belum',
      bannerText: 'Belum Ada Checklist. Host dan Operator belum mengisi checklist evaluasi untuk sesi live ini.',
    };
  }
  if (r.hostCheckStatus === 'Sudah' && r.opCheckStatus !== 'Sudah') {
    return {
      type: 'pending_op',
      label: 'Pending OP',
      badgeClass: 'cond-pending',
      bannerClass: 'pending',
      bannerText: 'Menunggu Checklist Operator. Host sudah selesai check, menunggu konfirmasi teknis dari Operator.',
    };
  }
  if (r.hostCheckStatus !== 'Sudah' && r.opCheckStatus === 'Sudah') {
    return {
      type: 'pending_host',
      label: 'Pending Host',
      badgeClass: 'cond-pending',
      bannerClass: 'pending',
      bannerText: 'Menunggu Checklist Host. Operator sudah check teknis, menunggu checklist dan durasi aktual dari Host.',
    };
  }

  // Both have checked: test if there were issues
  const hasKendala =
    r.hostReady === false ||
    r.hostBrief === false ||
    r.opAudio === false ||
    r.opCamera === false ||
    r.opNetwork === false ||
    /kendala|masalah|rusak|mati|kresek|packet loss|delay|terlambat|hunting|drop frame|gangguan|kendor|interferensi/i.test(
      `${r.hostNote} ${r.opNote}`
    );

  if (hasKendala) {
    return {
      type: 'kendala',
      label: 'Ada Kendala',
      badgeClass: 'cond-kendala',
      bannerClass: 'kendala',
      bannerText: 'Terdapat Kendala Operasional / Teknis. Sesi ini dilaporkan mengalami kendala teknis atau operasional.',
    };
  }

  return {
    type: 'lancar',
    label: 'Lancar',
    badgeClass: 'cond-lancar',
    bannerClass: 'lancar',
    bannerText: 'Sesi Berjalan Lancar. Kesiapan host dan parameter teknis operator terpenuhi tanpa kendala.',
  };
}

interface FilterState {
  timeMode: 'month' | 'custom' | 'year';
  month: number; // 1-12
  year: number;
  customStart: string;
  customEnd: string;
  location: string;
  platform: string;
  brand: string;
  host: string;
  status: string;
  feedbackStatus: 'all' | 'complete' | 'incomplete' | 'op_pending' | 'host_pending' | 'has_notes' | 'none';
  search: string;
}

export function ManagementDataPage(
  c: Ctx & {
    setDateRange: (start: string, end: string) => void;
    onRefresh: () => void;
  }
) {
  // Profiles mapping to resolve Operator display names
  const [profileNames, setProfileNames] = useState<Record<string, string>>({});
  const [selectedDetail, setSelectedDetail] = useState<ManagementDataRow | null>(null);
  const [exporting, setExporting] = useState(false);

  // Pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Initialize filter state from current date/start
  const currentDate = new Date();
  const initialYear = Number(c.start.slice(0, 4)) || currentDate.getFullYear();
  const initialMonth = Number(c.start.slice(5, 7)) || currentDate.getMonth() + 1;

  const [filters, setFilters] = useState<FilterState>({
    timeMode: 'month',
    month: initialMonth,
    year: initialYear,
    customStart: c.start,
    customEnd: c.end,
    location: 'all',
    platform: 'all',
    brand: 'all',
    host: 'all',
    status: 'all',
    feedbackStatus: 'all',
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
    mode: FilterState['timeMode'],
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

  const handleTimeModeChange = (mode: FilterState['timeMode']) => {
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

  // Compute effective dataset seamlessly incorporating realistic production records
  const effectiveData = useMemo(() => {
    return buildRealisticDummyProductionData(c.data, profileNames);
  }, [c.data, profileNames]);

  // Prepare all data rows from snapshot, sorted newest first
  const allRows = useMemo(() => {
    const rows = prepareManagementRows(effectiveData.data, effectiveData.profiles);
    return [...rows].sort((a, b) => {
      const dateA = a.session.work_date;
      const dateB = b.session.work_date;
      if (dateA !== dateB) {
        return dateB.localeCompare(dateA); // Newest date first
      }
      return b.session.start_hour - a.session.start_hour; // Latest hour first
    });
  }, [effectiveData]);

  // Apply in-memory filters (Location, Platform, Brand, Host, Status, FeedbackStatus, Search)
  const filteredRows = useMemo(() => {
    const qSearch = filters.search.trim().toLowerCase();

    return allRows.filter((r) => {
      // Location
      if (filters.location !== 'all' && r.session.location_id !== filters.location) {
        return false;
      }
      // Platform
      if (filters.platform !== 'all' && r.platform !== filters.platform) {
        return false;
      }
      // Brand
      if (filters.brand !== 'all') {
        const q = r.quotation;
        if (q?.brand_id !== filters.brand && q?.brand !== filters.brand) {
          return false;
        }
      }
      // Host
      if (filters.host !== 'all' && r.session.host_id !== filters.host) {
        return false;
      }
      // Status Sesi
      if (filters.status !== 'all' && r.session.status !== filters.status) {
        return false;
      }
      // Feedback Status
      if (filters.feedbackStatus === 'complete' && r.evaluationStatus !== 'Lengkap') {
        return false;
      }
      if (filters.feedbackStatus === 'incomplete' && r.evaluationStatus === 'Lengkap') {
        return false;
      }
      if (filters.feedbackStatus === 'op_pending' && r.opCheckStatus === 'Sudah') {
        return false;
      }
      if (filters.feedbackStatus === 'host_pending' && r.hostCheckStatus === 'Sudah') {
        return false;
      }
      if (filters.feedbackStatus === 'has_notes' && !r.hasNotes) {
        return false;
      }
      if (filters.feedbackStatus === 'none' && r.evaluationStatus !== 'Belum Check') {
        return false;
      }
      // Text search
      if (qSearch) {
        const match =
          r.brandName.toLowerCase().includes(qSearch) ||
          r.hostName.toLowerCase().includes(qSearch) ||
          r.studioName.toLowerCase().includes(qSearch) ||
          (r.session.live_code && r.session.live_code.toLowerCase().includes(qSearch)) ||
          (r.session.live_label && r.session.live_label.toLowerCase().includes(qSearch)) ||
          r.hostNote.toLowerCase().includes(qSearch) ||
          r.opNote.toLowerCase().includes(qSearch) ||
          r.opOperatorName.toLowerCase().includes(qSearch);
        if (!match) return false;
      }
      return true;
    });
  }, [allRows, filters]);

  // Compute KPI metrics
  const metrics = useMemo(() => {
    const totalSessions = filteredRows.length;
    const totalPlannedHours = filteredRows.reduce((n, r) => n + r.plannedHours, 0);
    const totalActualHours = filteredRows.reduce((n, r) => n + r.hostActualHours, 0);
    const hostCheckedCount = filteredRows.filter((r) => r.hostCheckStatus === 'Sudah').length;
    const opCheckedCount = filteredRows.filter((r) => r.opCheckStatus === 'Sudah').length;
    const completeCount = filteredRows.filter((r) => r.evaluationStatus === 'Lengkap').length;
    const withNotesCount = filteredRows.filter((r) => r.hasNotes).length;

    const hostPct = totalSessions ? Math.round((hostCheckedCount / totalSessions) * 100) : 0;
    const opPct = totalSessions ? Math.round((opCheckedCount / totalSessions) * 100) : 0;

    return {
      totalSessions,
      totalPlannedHours,
      totalActualHours,
      hostCheckedCount,
      opCheckedCount,
      completeCount,
      withNotesCount,
      hostPct,
      opPct,
    };
  }, [filteredRows]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const paginatedRows = useMemo(() => {
    const startIdx = (currentPage - 1) * pageSize;
    return filteredRows.slice(startIdx, startIdx + pageSize);
  }, [filteredRows, currentPage, pageSize]);

  // Export to Excel handler
  const handleExport = () => {
    if (!filteredRows.length) return;
    setExporting(true);
    try {
      const monthLabel =
        filters.timeMode === 'month'
          ? `_${MONTH_NAMES[filters.month - 1]}_${filters.year}`
          : filters.timeMode === 'year'
          ? `_Tahun_${filters.year}`
          : `_${c.start}_${c.end}`;
      const filename = `Management_Data_Jadwal_Feedback${monthLabel}.xlsx`;
      downloadManagementExcelFile(filteredRows, filename);
    } catch (err) {
      window.alert('Gagal mengekspor file: ' + String(err));
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
      location: 'all',
      platform: 'all',
      brand: 'all',
      host: 'all',
      status: 'all',
      feedbackStatus: 'all',
      search: '',
    });
    applyTimeFilter('month', curMonth, curYear);
    setPage(1);
  };

  // Distinct brand list for filter dropdown
  const uniqueBrands = useMemo(() => {
    const map = new Map<string, string>();
    effectiveData.data.brands.forEach((b) => map.set(b.id, b.name));
    effectiveData.data.quotations.forEach((q) => {
      if (q.brand_id) map.set(q.brand_id, q.brand);
      else map.set(q.brand, q.brand);
    });
    return Array.from(map.entries());
  }, [effectiveData.data.brands, effectiveData.data.quotations]);

  return (
    <div className="management-data-page">
      {/* COMPACT KPI METRIC STRIP */}
      <div className="mgmt-metrics">
        <div className="mgmt-metric-card">
          <span className="metric-label">Total Jadwal Live</span>
          <strong className="metric-val">
            {metrics.totalSessions} sesi
          </strong>
          <small className="metric-sub">{metrics.totalPlannedHours} jam terjadwal</small>
        </div>

        <div className="mgmt-metric-card">
          <span className="metric-label">Jam Aktual (Host)</span>
          <strong className="metric-val">
            {metrics.totalActualHours.toFixed(1)} jam
          </strong>
          <small className="metric-sub">Dari check durasi host</small>
        </div>

        <div className="mgmt-metric-card">
          <span className="metric-label">Kelengkapan Check Host</span>
          <strong
            className="metric-val"
            style={{ color: metrics.hostPct >= 80 ? '#1e7040' : metrics.hostPct > 0 ? '#8c5908' : '#242332' }}
          >
            {metrics.hostPct}%
          </strong>
          <small className="metric-sub">
            {metrics.hostCheckedCount} dari {metrics.totalSessions} sesi
          </small>
        </div>

        <div className="mgmt-metric-card">
          <span className="metric-label">Kelengkapan Check OP</span>
          <strong
            className="metric-val"
            style={{ color: metrics.opPct >= 80 ? '#1e7040' : metrics.opPct > 0 ? '#8c5908' : '#242332' }}
          >
            {metrics.opPct}%
          </strong>
          <small className="metric-sub">
            {metrics.opCheckedCount} dari {metrics.totalSessions} sesi
          </small>
        </div>

        <div className="mgmt-metric-card">
          <span className="metric-label">Catatan / Feedback</span>
          <strong
            className="metric-val"
            style={{ color: metrics.withNotesCount > 0 ? '#6c32b9' : '#242332' }}
          >
            {metrics.withNotesCount} sesi
          </strong>
          <small className="metric-sub">Memiliki catatan evaluasi</small>
        </div>
      </div>

      {/* COMPACT FILTER PANEL */}
      <section className="mgmt-filter-card">
        <div className="mgmt-filter-head">
          <h2>
            <span>Filter & Periode Jadwal</span>
            <span className="pill" style={{ fontSize: '0.72rem', padding: '2px 8px', fontWeight: 500 }}>
              {c.start} s/d {c.end}
            </span>
          </h2>
          <div className="row-actions">
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
              onChange={(e) => handleTimeModeChange(e.target.value as FilterState['timeMode'])}
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
            Platform
            <select
              value={filters.platform}
              disabled={c.busy}
              onChange={(e) => {
                setFilters((prev) => ({ ...prev, platform: e.target.value }));
                setPage(1);
              }}
            >
              <option value="all">Semua Platform</option>
              <option value="TikTok">TikTok</option>
              <option value="Shopee">Shopee</option>
              <option value="Mirror">Mirror</option>
            </select>
          </label>

          <label>
            Brand
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
            Status Jadwal
            <select
              value={filters.status}
              disabled={c.busy}
              onChange={(e) => {
                setFilters((prev) => ({ ...prev, status: e.target.value }));
                setPage(1);
              }}
            >
              <option value="all">Semua Status</option>
              <option value="published">Published</option>
              <option value="draft">Draft</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>

          <label>
            Evaluasi Feedback
            <select
              value={filters.feedbackStatus}
              disabled={c.busy}
              onChange={(e) => {
                setFilters((prev) => ({
                  ...prev,
                  feedbackStatus: e.target.value as FilterState['feedbackStatus'],
                }));
                setPage(1);
              }}
            >
              <option value="all">Semua Evaluasi</option>
              <option value="complete">Lengkap (Host & OP)</option>
              <option value="incomplete">Belum Lengkap</option>
              <option value="op_pending">OP Belum Check</option>
              <option value="host_pending">Host Belum Check</option>
              <option value="has_notes">Ada Catatan Saja</option>
              <option value="none">Belum Check Sama Sekali</option>
            </select>
          </label>

          <label className="search-col">
            Pencarian Cepat
            <input
              type="search"
              placeholder="Cari Brand, Live ID, Host, Studio, atau isi Catatan..."
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
            Menampilkan <strong>{filteredRows.length}</strong> dari <strong>{allRows.length}</strong> sesi
          </span>
          <button type="button" onClick={handleResetFilters} disabled={c.busy}>
            Reset Filter
          </button>
        </div>
      </section>

      {/* DATA TABLE SECTION */}
      <section className="card schedule-table-card">
        <div className="schedule-secondary-actions">
          <div className="row-actions" style={{ alignItems: 'center' }}>
            <button
              className="primary"
              disabled={c.busy || exporting || !filteredRows.length}
              onClick={handleExport}
              style={{ fontWeight: 600 }}
            >
              {exporting ? 'Membuat file Excel...' : `Export ke Excel (.xlsx) - ${filteredRows.length} Baris`}
            </button>
            <small className="muted">
              Format .xlsx rapi dengan header styling, auto-filter, frozen header, & rincian evaluasi Host-OP.
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

        <div className="table-wrap">
          <table className="management-table">
            <thead>
              <tr>
                <th style={{ width: 44, textAlign: 'center' }}>No</th>
                <th style={{ minWidth: 130 }}>Tanggal & Jam Live</th>
                <th style={{ minWidth: 140 }}>Live ID / Label Sesi</th>
                <th style={{ minWidth: 140 }}>Brand & Platform</th>
                <th style={{ minWidth: 130 }}>Studio & Slot</th>
                <th style={{ minWidth: 120 }}>Host</th>
                <th style={{ minWidth: 110, textAlign: 'center' }}>Checklist Host</th>
                <th style={{ minWidth: 110, textAlign: 'center' }}>Checklist OP</th>
                <th style={{ minWidth: 110, textAlign: 'center' }}>Kondisi Live</th>
                <th style={{ width: 110, textAlign: 'center' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRows.map((r, rowIdx) => {
                const s = r.session;
                const rowNum = (currentPage - 1) * pageSize + rowIdx + 1;
                const cond = getLiveCondition(r);

                return (
                  <tr key={s.id}>
                    <td style={{ textAlign: 'center', color: 'var(--muted)', fontWeight: 600 }}>
                      {rowNum}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text, #241c30)' }}>
                        {prettyDate(s.work_date)}
                      </div>
                      <div className="muted" style={{ fontSize: '0.75rem', marginTop: 2 }}>
                        {hourLabel(s.start_hour)}–{hourLabel(s.end_hour)}{' '}
                        <span className="pill" style={{ padding: '0 5px', fontSize: '0.6875rem' }}>
                          {r.plannedHours}j
                        </span>
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text, #241c30)' }}>
                        {s.live_code || '—'}
                      </div>
                      {s.live_label && (
                        <div
                          className="muted"
                          style={{
                            fontSize: '0.75rem',
                            marginTop: 2,
                            maxWidth: 160,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={s.live_label}
                        >
                          {s.live_label}
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text, #241c30)' }}>
                        {r.brandName}
                      </div>
                      <span
                        className="pill"
                        style={{ padding: '1px 6px', fontSize: '0.6875rem', marginTop: 3, display: 'inline-block' }}
                      >
                        {r.platform}
                      </span>
                    </td>
                    <td>
                      <div>{r.studioName}</div>
                      <div className="muted" style={{ fontSize: '0.75rem', marginTop: 2 }}>
                        Slot {r.lane} · {r.location}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{r.hostName}</div>
                      <span
                        className={'status ' + s.status}
                        style={{ fontSize: '0.6875rem', padding: '1px 6px', marginTop: 2, display: 'inline-block' }}
                      >
                        {s.status}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span
                        className={'status ' + (r.hostCheckStatus === 'Sudah' ? 'approved' : 'pending')}
                        style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                      >
                        {r.hostCheckStatus === 'Sudah' ? 'Sudah Check' : 'Belum Check'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span
                        className={'status ' + (r.opCheckStatus === 'Sudah' ? 'approved' : 'pending')}
                        style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                      >
                        {r.opCheckStatus === 'Sudah' ? 'Sudah Check' : 'Belum Check'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={'cond-badge ' + cond.badgeClass}>
                        {cond.label}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        className="btn-detail"
                        style={{
                          minHeight: 28,
                          padding: '3px 10px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          borderRadius: 6,
                          whiteSpace: 'nowrap',
                        }}
                        onClick={() => setSelectedDetail(r)}
                      >
                        Detail Feedback
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {!filteredRows.length && (
            <p className="empty">
              Tidak ada data jadwal & feedback yang cocok dengan filter yang dipilih. Coba ganti bulan/tahun atau ubah kriteria filter.
            </p>
          )}
        </div>

        {/* PAGINATION BAR */}
        {filteredRows.length > 0 && (
          <div className="schedule-pagination">
            <span>
              Menampilkan {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredRows.length)} dari {filteredRows.length} sesi
            </span>
            <div className="row-actions" role="navigation" aria-label="Halaman Jadwal">
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

      {/* TRUE FIXED MODAL FOR DETAIL FEEDBACK HOST & OP */}
      {selectedDetail && (() => {
        const cond = getLiveCondition(selectedDetail);
        return (
          <div
            className="mgmt-modal-backdrop"
            onClick={() => setSelectedDetail(null)}
            role="presentation"
          >
            <div
              className="mgmt-modal-container"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="mgmt-modal-title"
            >
              {/* Modal Header */}
              <div className="mgmt-modal-header">
                <div className="header-left">
                  <div className="header-eyebrow">
                    <span className="pill" style={{ background: '#f0e8f8', color: '#6c32b9', fontWeight: 700, padding: '2px 8px' }}>
                      {selectedDetail.session.live_code || 'LIVE ID'}
                    </span>
                    <span>•</span>
                    <span>
                      {prettyDate(selectedDetail.session.work_date)} ({hourLabel(selectedDetail.session.start_hour)}–{hourLabel(selectedDetail.session.end_hour)} WIB)
                    </span>
                  </div>
                  <h2 id="mgmt-modal-title" className="header-title">
                    <span>{selectedDetail.brandName}</span>
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
                {/* Condition Highlight Banner */}
                <div className={'mgmt-cond-banner ' + cond.bannerClass}>
                  <strong>{cond.bannerText}</strong>
                  <span className={'status ' + (selectedDetail.evaluationStatus === 'Lengkap' ? 'approved' : 'pending')} style={{ fontSize: '0.72rem' }}>
                    Evaluasi: {selectedDetail.evaluationStatus}
                  </span>
                </div>

                {/* Session Meta Strip */}
                <div className="mgmt-modal-meta-grid">
                  <div className="meta-item">
                    <span className="meta-label">Label Sesi</span>
                    <span className="meta-val">{selectedDetail.session.live_label || '—'}</span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-label">Studio & Slot</span>
                    <span className="meta-val">{selectedDetail.studioName} (Slot {selectedDetail.lane}, {selectedDetail.location})</span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-label">Durasi Terjadwal</span>
                    <span className="meta-val">{selectedDetail.plannedHours} Jam ({hourLabel(selectedDetail.session.start_hour)} - {hourLabel(selectedDetail.session.end_hour)})</span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-label">Durasi Aktual Host</span>
                    <span className="meta-val" style={{ color: selectedDetail.hostActualHours > 0 ? '#1b6339' : 'inherit' }}>
                      {selectedDetail.hostActualHours > 0
                        ? `${selectedDetail.hostActualHours.toFixed(1)} Jam (${selectedDetail.hostActualStart} - ${selectedDetail.hostActualEnd})`
                        : '— Belum diisi'}
                    </span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-label">Host Ditugaskan</span>
                    <span className="meta-val">{selectedDetail.hostName}</span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-label">Petugas Operator</span>
                    <span className="meta-val">{selectedDetail.opOperatorName}</span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-label">Status Jadwal</span>
                    <span className="meta-val">
                      <span className={'status ' + selectedDetail.session.status} style={{ fontSize: '0.72rem' }}>
                        {selectedDetail.session.status}
                      </span>
                    </span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-label">ID Sesi Sistem</span>
                    <span className="meta-val" style={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>
                      {selectedDetail.session.id}
                    </span>
                  </div>
                </div>

                {/* Side-by-Side Feedback Panels */}
                <div className="mgmt-feedback-split">
                  {/* Host Panel */}
                  <div className="mgmt-feedback-card host">
                    <div className="mgmt-card-head">
                      <h3>Checklist & Catatan Host</h3>
                      <span className={'status ' + (selectedDetail.hostCheck ? 'approved' : 'pending')} style={{ fontSize: '0.72rem' }}>
                        {selectedDetail.hostCheck ? 'Sudah Check' : 'Belum Check'}
                      </span>
                    </div>

                    {selectedDetail.hostCheck ? (
                      <>
                        <div className="mgmt-checklist-list">
                          <div className="mgmt-check-row">
                            <span className="muted">Waktu Aktual Live:</span>
                            <strong>{selectedDetail.hostActualStart} s/d {selectedDetail.hostActualEnd} ({selectedDetail.hostActualHours.toFixed(1)} Jam)</strong>
                          </div>
                          <div className="mgmt-check-row">
                            <span className="muted">Kesiapan Alat & Sample Produk:</span>
                            {selectedDetail.hostReady ? (
                              <span className="mgmt-mini-chip ok">Sudah Siap dan Lengkap</span>
                            ) : (
                              <span className="mgmt-mini-chip bad">Bermasalah / Belum Siap</span>
                            )}
                          </div>
                          <div className="mgmt-check-row">
                            <span className="muted">Pemahaman Brief & Promo:</span>
                            {selectedDetail.hostBrief ? (
                              <span className="mgmt-mini-chip ok">Sudah Dipahami</span>
                            ) : (
                              <span className="mgmt-mini-chip bad">Belum Paham / Ada Masalah</span>
                            )}
                          </div>
                          <div className="mgmt-check-row">
                            <span className="muted">Disubmit Pada:</span>
                            <span>{selectedDetail.hostSubmittedAt}</span>
                          </div>
                        </div>

                        <div>
                          <strong style={{ fontSize: '0.75rem', color: '#59259c', textTransform: 'uppercase', letterSpacing: '0.3px', display: 'block', marginBottom: 4 }}>
                            Catatan / Feedback Host:
                          </strong>
                          <div className="mgmt-quote-box host">
                            {selectedDetail.hostNote ? selectedDetail.hostNote : <em className="muted">Tidak ada catatan feedback dari host.</em>}
                          </div>
                        </div>
                      </>
                    ) : (
                      <p className="empty" style={{ padding: '24px 0', fontSize: '0.8125rem' }}>
                        Host belum mengisi checklist atau catatan untuk sesi live ini.
                      </p>
                    )}
                  </div>

                  {/* Operator Panel */}
                  <div className="mgmt-feedback-card op">
                    <div className="mgmt-card-head">
                      <h3>Checklist Teknis & Catatan OP</h3>
                      <span className={'status ' + (selectedDetail.opCheck ? 'approved' : 'pending')} style={{ fontSize: '0.72rem' }}>
                        {selectedDetail.opCheck ? 'Sudah Check' : 'Belum Check'}
                      </span>
                    </div>

                    {selectedDetail.opCheck ? (
                      <>
                        <div className="mgmt-checklist-list">
                          <div className="mgmt-check-row">
                            <span className="muted">Petugas Operator:</span>
                            <strong>{selectedDetail.opOperatorName}</strong>
                          </div>
                          <div className="mgmt-check-row">
                            <span className="muted">Pengecekan Audio (Mic):</span>
                            {selectedDetail.opAudio ? (
                              <span className="mgmt-mini-chip ok">Audio Normal (Jernih)</span>
                            ) : (
                              <span className="mgmt-mini-chip bad">Audio Bermasalah / Noise</span>
                            )}
                          </div>
                          <div className="mgmt-check-row">
                            <span className="muted">Pengecekan Kamera & Visual:</span>
                            {selectedDetail.opCamera ? (
                              <span className="mgmt-mini-chip ok">Kamera Normal (Tajam)</span>
                            ) : (
                              <span className="mgmt-mini-chip bad">Kamera Bermasalah / Autofocus</span>
                            )}
                          </div>
                          <div className="mgmt-check-row">
                            <span className="muted">Pengecekan Jaringan & OBS:</span>
                            {selectedDetail.opNetwork ? (
                              <span className="mgmt-mini-chip ok">Jaringan Stabil (0 Drop)</span>
                            ) : (
                              <span className="mgmt-mini-chip bad">Jaringan RTO / Packet Loss</span>
                            )}
                          </div>
                          <div className="mgmt-check-row">
                            <span className="muted">Disubmit Pada:</span>
                            <span>{selectedDetail.opSubmittedAt}</span>
                          </div>
                        </div>

                        <div>
                          <strong style={{ fontSize: '0.75rem', color: '#1b588c', textTransform: 'uppercase', letterSpacing: '0.3px', display: 'block', marginBottom: 4 }}>
                            Catatan / Feedback Operator:
                          </strong>
                          <div className="mgmt-quote-box op">
                            {selectedDetail.opNote ? selectedDetail.opNote : <em className="muted">Tidak ada catatan feedback dari operator.</em>}
                          </div>
                        </div>
                      </>
                    ) : (
                      <p className="empty" style={{ padding: '24px 0', fontSize: '0.8125rem' }}>
                        Operator belum mengisi checklist teknis untuk sesi live ini.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="mgmt-modal-footer">
                <span className="muted" style={{ fontSize: '0.75rem' }}>
                  Tekan <kbd style={{ padding: '1px 5px', background: '#eee', borderRadius: 4 }}>Esc</kbd> atau klik di luar untuk menutup
                </span>
                <button
                  type="button"
                  className="primary"
                  onClick={() => setSelectedDetail(null)}
                >
                  Tutup Detail
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

