import { useState, type ReactNode, type FormEvent } from 'react';
import { NavLink, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { db, errorText } from '../lib/supabase';
import { useData, type Data } from '../lib/data';
import {
  today,
  monday,
  addDays,
  prettyDate,
  calendarMonth,
  logbookPeriod,
  type Profile,
} from '../lib/domain';
import { Plotting } from './Plotting';
import { Availability } from './Availability';
import { Accounts } from './Accounts';
import { CostReport, PersonalSchedule } from './Reports';

export interface Context {
  data: Data;
  profile: Profile;
  location: string;
  start: string;
  end: string;
  busy: boolean;
  setDateRange: (start: string, end: string) => void;
  run: (
    label: string,
    fn: () => Promise<unknown>,
    confirm?: string
  ) => Promise<boolean>;
}

const links = [
  ['/production', 'Livestreaming Production ↗'],
  ['/overview', 'Ringkasan'],
  ['/plotting', 'Plotting Jadwal'],
  ['/availability', 'Availability & Izin'],
  ['/accounts', 'Operator Staff'],
  ['/cost', 'Cost Operator'],
];

export function Workspace() {
  const { profile } = useAuth();
  const path = useLocation().pathname;
  const [city, setCity] = useState('jakarta');
  const [start, setStart] = useState(monday(today()));
  const [end, setEnd] = useState(addDays(monday(today()), 6));
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [actionError, setActionError] = useState('');

  const staff = profile?.role === 'staff';
  const location =
    profile?.role === 'super_admin' ? city : profile?.location_id ?? 'jakarta';

  const { data, loading, error, live } = useData(
    location,
    start,
    end,
    staff,
    revision
  );

  if (!profile) return <Navigate to="/login" replace />;
  if (staff && !['/my-schedule', '/availability'].includes(path)) {
    return <Navigate to="/my-schedule" replace />;
  }
  if (!staff && !links.some(([to]) => to === path)) {
    return <Navigate to="/overview" replace />;
  }

  const resetDates = (s: string, e: string) => {
    setStart(s);
    setEnd(e);
    setMessage('');
    setActionError('');
  };

  const run: Context['run'] = async (label, fn, confirm) => {
    if (busy) return false;
    if (confirm && !window.confirm(confirm)) return false;
    setBusy(true);
    setMessage('');
    setActionError('');
    try {
      await fn();
      setMessage(label);
      setRevision((r) => r + 1);
      return true;
    } catch (e) {
      setActionError(errorText(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const context: Context = {
    data,
    profile,
    location,
    start,
    end,
    busy: busy || !!error,
    setDateRange: resetDates,
    run,
  };

  const title =
    path === '/my-schedule'
      ? 'Jadwal & Logbook Saya'
      : links.find(([to]) => to === path)?.[1];

  let content: ReactNode;
  if (loading) {
    content = (
      <div className="card loading" role="status">
        Memuat data…
      </div>
    );
  } else if (error && data.profiles.length === 0) {
    content = (
      <div className="notice error" role="alert">
        {error} <button onClick={() => setRevision((r) => r + 1)}>Coba lagi</button>
      </div>
    );
  } else if (path === '/plotting') {
    content = <Plotting {...context} />;
  } else if (path === '/availability') {
    content = <Availability {...context} />;
  } else if (path === '/accounts') {
    content = <Accounts {...context} />;
  } else if (path === '/cost') {
    content = <CostReport {...context} />;
  } else if (path === '/my-schedule') {
    content = <PersonalSchedule {...context} />;
  } else {
    const activeStaffCount = data.profiles.filter(
      (p) => p.active && p.role === 'staff'
    ).length;
    const pendingCount =
      data.submissions.filter((s) => s.status === 'pending').length +
      data.leaves.filter((l) => l.status === 'pending').length;
    const filledDays = new Set(data.assignments.map((a) => a.work_date)).size;
    const dayCount = Math.max(
      0,
      Math.min(
        31,
        Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1
      )
    );

    const maxAssignmentsPerDay = Math.max(
      1,
      ...Object.values(
        data.assignments.reduce<Record<string, number>>((s, a) => {
          s[a.work_date] = (s[a.work_date] ?? 0) + 1;
          return s;
        }, {})
      )
    );

    content = (
      <>
        <div className="metrics">
          <Metric label="Operator aktif" value={activeStaffCount} />
          <Metric label="Jam draft" value={data.assignments.length} />
          <Metric label="Hari terisi" value={filledDays} />
          <Metric label="Menunggu review" value={pendingCount} />
        </div>
        <section className="card">
          <div className="section-head">
            <h2>Jam jaga per hari</h2>
            <span className="muted">
              Draft · {location === 'jakarta' ? 'Jakarta' : 'Bandung'}
            </span>
          </div>
          <div className="bar-list">
            {Array.from({ length: dayCount }, (_, i) => addDays(start, i)).map(
              (date) => {
                const count = data.assignments.filter(
                  (a) => a.work_date === date
                ).length;
                return (
                  <div className="bar-row" key={date}>
                    <span>{prettyDate(date)}</span>
                    <div>
                      <i
                        style={{
                          width: `${(count / maxAssignmentsPerDay) * 100}%`,
                        }}
                      />
                    </div>
                    <strong>{count} jam</strong>
                  </div>
                );
              }
            )}
          </div>
        </section>
        <div className="notice">
          Ringkasan menggunakan jadwal draft. Cost dan logbook menggunakan jadwal published.
        </div>
      </>
    );
  }

  const navItems = staff
    ? [
        ['/production', 'Jadwal Live & Check ↗'],
        ['/my-schedule', 'Jadwal & Logbook'],
        ['/availability', 'Availability & Izin'],
      ]
    : links;

  return (
    <div className="app">
      <aside>
        <div className="brand">
          <span className="logo">O</span>
          <div>
            <strong>Orbiz Ops</strong>
            <small>Operator Management</small>
          </div>
        </div>
        <p className="eyebrow">WORKSPACE</p>
        <nav>
          {navItems.map(([to, label]) => (
            <NavLink key={to} to={to}>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="identity">
          <strong>{profile.display_name}</strong>
          <small>{profile.role.replaceAll('_', ' ')}</small>
          <button
            disabled={busy}
            onClick={() =>
              void run('Keluar', async () => {
                const { error: signOutError } = await db().auth.signOut();
                if (signOutError) throw signOutError;
              })
            }
          >
            Keluar
          </button>
        </div>
      </aside>

      <main className="workspace">
        <header>
          <div>
            <p className="eyebrow">ORBIZ / OPERATOR MANAGEMENT</p>
            <h1>{title}</h1>
          </div>
          {profile.role === 'super_admin' ? (
            <div className="segmented">
              {['jakarta', 'bandung'].map((c) => (
                <button
                  disabled={busy}
                  className={c === city ? 'selected' : ''}
                  key={c}
                  onClick={() => {
                    setCity(c);
                    setMessage('');
                    setActionError('');
                  }}
                >
                  {c === 'jakarta' ? 'Jakarta' : 'Bandung'}
                </button>
              ))}
            </div>
          ) : (
            <span className="pill">
              {location === 'jakarta' ? 'Jakarta' : 'Bandung'}
            </span>
          )}
        </header>

        <div className="toolbar">
          <label>
            Dari
            <input
              type="date"
              value={start}
              max={end}
              disabled={busy}
              onChange={(e) => {
                if (e.target.value) setStart(e.target.value);
              }}
            />
          </label>
          <label>
            Sampai
            <input
              type="date"
              value={end}
              min={start}
              disabled={busy}
              onChange={(e) => {
                if (e.target.value) setEnd(e.target.value);
              }}
            />
          </label>
          <button
            disabled={busy}
            onClick={() =>
              resetDates(monday(today()), addDays(monday(today()), 6))
            }
          >
            Minggu ini
          </button>
          <button
            disabled={busy}
            onClick={() => {
              const p = calendarMonth(today());
              resetDates(p.start, p.end);
            }}
          >
            Bulan ini
          </button>
          {path === '/my-schedule' && (
            <button
              disabled={busy}
              onClick={() => {
                const p = logbookPeriod(start);
                resetDates(p.start, p.end);
              }}
            >
              Periode 21–20
            </button>
          )}
          <small className="sync">
            WIB ·{' '}
            {live
              ? 'Pembaruan langsung aktif'
              : 'Memeriksa pembaruan setiap 15 detik'}
          </small>
        </div>

        {error && data.profiles.length > 0 && (
          <div className="notice" role="status">
            Pembaruan data gagal. Menampilkan data terakhir; tunggu pembaruan berhasil sebelum mengubah jadwal.{' '}
            <button onClick={() => setRevision((r) => r + 1)}>Coba lagi</button>
          </div>
        )}
        {message && (
          <div className="notice success" role="status">
            {message}
          </div>
        )}
        {actionError && (
          <div className="notice error" role="alert">
            {actionError}
          </div>
        )}

        <div key={location + ':' + path} aria-busy={busy}>
          {content}
        </div>

        <footer>Orbiz Operator Management · Asia/Jakarta</footer>
      </main>
    </div>
  );
}

export function Metric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <article className="card metric">
      <p>{label}</p>
      <strong>{value}</strong>
    </article>
  );
}

export function Status({ value }: { value: string }) {
  const statusLabels: Record<string, string> = {
    pending: 'Menunggu',
    approved: 'Disetujui',
    rejected: 'Ditolak',
  };
  return <span className={'status ' + value}>{statusLabels[value] ?? value}</span>;
}

export async function checked<T>({
  data,
  error,
}: {
  data: T;
  error: unknown;
}): Promise<T> {
  if (error) throw error;
  return data;
}

export const fields = (e: FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  return new FormData(e.currentTarget);
};
