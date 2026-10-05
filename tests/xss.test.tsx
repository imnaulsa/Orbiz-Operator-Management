import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { logbookWorkbook } from '../src/lib/xlsx';
import { unzipSync, strFromU8 } from 'fflate';
import { QuotationPage, MasterDataPage } from '../src/components/ProductionManagement';
import { ScheduleTablePage, SessionPlacement } from '../src/components/ProductionSchedule';
import { LiveCheckForm, HostsPage, type Ctx } from '../src/components/ProductionWorkspace';
import type { LiveSession } from '../src/lib/production';

const xssPayloads = [
  '<script>alert(document.domain)</script>',
  '<img src=x onerror=alert(1)>',
  '<svg onload=alert(1)>',
  '"><script>alert(1)</script>',
  'javascript:alert(1)',
  "';alert(1);'",
  '<iframe src="javascript:alert(1)">',
];

describe('XSS Security & Safe Output Encoding', () => {
  describe('OOXML Spreadsheet XML Escaping', () => {
    it('safely escapes all XSS payloads into XML entities without raw HTML or script tags', () => {
      for (const payload of xssPayloads) {
        const rows = [[payload, 10, 20]];
        const bytes = logbookWorkbook(rows, ['Field', 'Start', 'End'], 'TestSheet');
        const zip = unzipSync(bytes);
        const sheetXml = strFromU8(zip['xl/worksheets/sheet1.xml']);

        // Raw executable tags must not be present in XML
        expect(sheetXml).not.toContain('<script');
        expect(sheetXml).not.toContain('</script>');
        expect(sheetXml).not.toContain('<img ');
        expect(sheetXml).not.toContain('<svg');
        expect(sheetXml).not.toContain('<iframe');

        // All XML special characters must be properly escaped
        if (payload.includes('<')) {
          expect(sheetXml).toContain('&lt;');
        }
        if (payload.includes('>')) {
          expect(sheetXml).toContain('&gt;');
        }
      }
    });
  });

  describe('Component Rendering of Untrusted Data (Stored & Reflected XSS Protection)', () => {
    it('escapes XSS payloads in Quotation and Master Data brand/account names', () => {
      for (const payload of xssPayloads) {
        const maliciousContext = {
          data: {
            brands: [
              {
                id: 'b1',
                name: payload,
                active: true,
                shop_id_tiktok: payload,
                shop_id_shopee: payload,
                shop_id_mirror: payload,
              },
            ],
            studios: [{ id: 'st1', name: payload, location_id: 'jakarta', capacity: 2 }],
            hosts: [{ id: 'h1', display_name: payload, active: true, location_id: 'jakarta' }],
            sessions: [],
            checks: [],
            quotations: [
              {
                id: 'q1',
                brand_id: 'b1',
                reference: payload,
                brand: payload,
                account: payload,
                platform: 'TikTok',
                hours: 10,
                allocated_hours: 2,
                rate: 50000,
                period_start: '2099-01-01',
                period_end: '2099-01-31',
              },
            ],
          },
          profile: { id: 'admin', role: 'super_admin' },
          start: '2099-01-01',
          end: '2099-01-31',
          location: 'jakarta',
          busy: false,
          act: async () => true,
          run: async () => true,
        } as unknown as Ctx;

        const quotationHtml = renderToStaticMarkup(createElement(QuotationPage, maliciousContext));
        const masterHtml = renderToStaticMarkup(createElement(MasterDataPage, maliciousContext));

        // Ensure no unescaped executable HTML tags exist in DOM string
        expect(quotationHtml).not.toContain('<script');
        expect(quotationHtml).not.toContain('<img ');
        expect(quotationHtml).not.toContain('<svg');
        expect(quotationHtml).not.toContain('<iframe');

        expect(masterHtml).not.toContain('<script');
        expect(masterHtml).not.toContain('<img ');
        expect(masterHtml).not.toContain('<svg');
        expect(masterHtml).not.toContain('<iframe');

        // Verify HTML entities are escaped safely
        if (payload.includes('<')) {
          expect(quotationHtml).toContain('&lt;');
          expect(masterHtml).toContain('&lt;');
        }
      }
    });

    it('escapes XSS payloads in Schedule Table and Host/Checklist components', () => {
      for (const payload of xssPayloads) {
        const maliciousSession = {
          id: 's1',
          quotation_id: 'q1',
          studio_id: 'st1',
          location_id: 'jakarta',
          work_date: '2099-01-01',
          start_hour: 9,
          end_hour: 11,
          status: 'published',
          host_id: 'h1',
          host_published: true,
          live_code: payload,
          live_label: payload,
          legacy_live_id: payload,
        } as unknown as LiveSession;

        const ctx = {
          data: {
            sessions: [maliciousSession],
            quotations: [{ id: 'q1', brand_id: 'b1', brand: payload, platform: 'TikTok' }],
            brands: [{ id: 'b1', name: payload }],
            studios: [{ id: 'st1', name: payload, location_id: 'jakarta' }],
            hosts: [{ id: 'h1', display_name: payload, active: true, location_id: 'jakarta' }],
            checks: [
              {
                session_id: 's1',
                kind: 'host',
                note: payload,
                submitted_by: 'h1',
              },
            ],
          },
          profile: { id: 'admin', role: 'super_admin' },
          start: '2099-01-01',
          end: '2099-01-31',
          location: 'jakarta',
          busy: false,
          act: async () => true,
          run: async () => true,
        } as unknown as Ctx;

        const scheduleHtml = renderToStaticMarkup(
          createElement(ScheduleTablePage, {
            ...ctx,
            calendar: { mode: 'daily', change: () => {}, refresh: () => {} },
          }),
        );
        const checkHtml = renderToStaticMarkup(
          createElement(LiveCheckForm, {
            c: ctx,
            session: maliciousSession,
            close: () => {},
          }),
        );
        const hostHtml = renderToStaticMarkup(createElement(HostsPage, ctx));

        expect(scheduleHtml).not.toContain('<script');
        expect(scheduleHtml).not.toContain('<img ');
        expect(scheduleHtml).not.toContain('<svg');
        expect(scheduleHtml).not.toContain('<iframe');

        expect(checkHtml).not.toContain('<script');
        expect(checkHtml).not.toContain('<img ');
        expect(checkHtml).not.toContain('<svg');
        expect(checkHtml).not.toContain('<iframe');

        expect(hostHtml).not.toContain('<script');
        expect(hostHtml).not.toContain('<img ');
        expect(hostHtml).not.toContain('<svg');
        expect(hostHtml).not.toContain('<iframe');
      }
    });

    it('escapes XSS payloads in SessionPlacement host options and labels', () => {
      const payload = '<script>alert("xss")</script>';
      const ctx = {
        data: {
          sessions: [],
          quotations: [],
          brands: [],
          studios: [{ id: 'st1', name: payload, location_id: 'jakarta' }],
          hosts: [{ id: 'h1', display_name: payload, active: true, location_id: 'jakarta' }],
          checks: [],
        },
        profile: { id: 'admin', role: 'super_admin' },
        location: 'jakarta',
        start: '2099-01-01',
        end: '2099-01-31',
        busy: false,
      } as unknown as Ctx;

      const session = {
        id: 's1',
        quotation_id: 'q1',
        studio_id: 'st1',
        location_id: 'jakarta',
        work_date: '2099-01-01',
        start_hour: 9,
        end_hour: 11,
        status: 'published',
        host_id: 'h1',
        host_published: true,
      } as unknown as LiveSession;

      const html = renderToStaticMarkup(
        createElement(
          'table',
          {},
          createElement(
            'tbody',
            {},
            createElement(
              'tr',
              {},
              createElement(SessionPlacement, { c: ctx, session, onDirty: () => {} }),
            ),
          ),
        ),
      );

      expect(html).not.toContain('<script');
      expect(html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    });
  });
});
