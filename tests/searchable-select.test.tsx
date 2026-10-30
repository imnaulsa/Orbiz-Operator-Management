import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SearchableSelect } from '../src/components/SearchableSelect';
import { SheetTrackerPage } from '../src/components/SheetTrackerPage';

describe('SearchableSelect component', () => {
  const options = [
    { value: 'all', label: 'Semua Brand', subLabel: '10 sesi', count: 10 },
    { value: 'b_astra', label: 'ASTRA', subLabel: '11 sesi', count: 11 },
    { value: 'b_skintific', label: 'Skintific Indonesia', subLabel: '4 sesi', count: 4 },
  ];

  it('renders trigger button with selected option label and count badge', () => {
    const html = renderToStaticMarkup(
      <SearchableSelect
        label="Brand Filter"
        value="b_astra"
        onChange={vi.fn()}
        options={options}
      />
    );

    expect(html).toContain('Brand Filter');
    expect(html).toContain('ASTRA');
    expect(html).toContain('11');
    expect(html).toContain('searchable-select-trigger');
    expect(html).toContain('is-active-filter');
  });

  it('renders placeholder when value is empty or not matching', () => {
    const html = renderToStaticMarkup(
      <SearchableSelect
        label="Platform Filter"
        value=""
        placeholder="Pilih Platform"
        onChange={vi.fn()}
        options={[]}
      />
    );

    expect(html).toContain('Platform Filter');
    expect(html).toContain('Pilih Platform');
  });
});

describe('SheetTrackerPage searchable dropdown filters (brand, date, platform)', () => {
  const defaultProps = {
    data: {
      brands: [],
      studios: [],
      quotations: [],
      hosts: [],
      availability: [],
      leaves: [],
      rates: [],
      sessions: [],
      checks: [],
    },
    profile: {
      id: 'admin1',
      display_name: 'Super Admin',
      role: 'super_admin' as const,
      location_id: 'jakarta',
      employment_type: 'internal' as const,
      active: true,
      created_at: '2026-01-01T00:00:00Z',
    },
    location: 'jakarta',
    start: '2026-10-01',
    end: '2026-10-31',
    busy: false,
    act: vi.fn(),
    run: vi.fn(),
    setDateRange: vi.fn(),
    onRefresh: vi.fn(),
  };

  it('renders searchable dropdowns for Brand, Tanggal Live (By Date), and Platform Live (By Platform)', () => {
    const html = renderToStaticMarkup(<SheetTrackerPage {...defaultProps} />);

    // Brand searchable select
    expect(html).toContain('Brand (Output Tracker)');
    expect(html).toContain('ASTRA');

    // Date searchable select
    expect(html).toContain('Tanggal Live (By Date)');
    expect(html).toContain('Semua Tanggal');

    // Platform searchable select
    expect(html).toContain('Platform Live (By Platform)');
    expect(html).toContain('Semua Platform');

    // Active filter chip strip
    expect(html).toContain('Filter Aktif:');
    expect(html).toContain('Brand: ASTRA');
    expect(html).toContain('Reset Semua Filter');
  });
});

