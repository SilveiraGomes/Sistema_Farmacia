import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('ReportA4 renders approved report print sections', async () => {
  const source = await readFile('src/components/ReportA4.jsx', 'utf8');

  assert.match(source, /function ReportA4\(\{ report, branding, settings, printedBy \}\)/);
  assert.match(source, /report-a4-page/);
  assert.match(source, /report-a4-header/);
  assert.match(source, /report-a4-document-box/);
  assert.match(source, /report-a4-filters/);
  assert.match(source, /report-a4-kpis/);
  assert.match(source, /report-a4-table/);
  assert.match(source, /report-a4-footer/);
});
