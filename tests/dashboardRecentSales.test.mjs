import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Dashboard titles recent sales table and limits it to six movements', async () => {
  const source = await readFile(new URL('../src/components/Dashboard.jsx', import.meta.url), 'utf8');

  assert.match(source, /RECENT_SALES_LIMIT\s*=\s*6/);
  assert.match(source, /liveData\.recentSales\.slice\(0,\s*RECENT_SALES_LIMIT\)\.map/);
  assert.match(source, /title="Últimos movimentos de vendas"/);
  assert.match(source, /className="dashboard-table dashboard-recent-sales-panel"/);
});

test('Dashboard service fetches only the last six sales movements', async () => {
  const source = await readFile(new URL('../src/backend/services/dashboardService.js', import.meta.url), 'utf8');

  assert.match(source, /getRecentSales\(6\)/);
});

test('Dashboard recent sales panel has a stable table area', async () => {
  const css = await readFile(new URL('../src/assets/tailwind.css', import.meta.url), 'utf8');
  const recentTableScrollRule = css.match(/\.dashboard-recent-sales-panel\s+\.table-scroll\s*\{[^}]+\}/s)?.[0] ?? '';

  assert.match(css, /\.dashboard-recent-sales-panel/);
  assert.match(css, /\.dashboard-recent-sales-panel\s+\.table-scroll/);
  assert.match(recentTableScrollRule, /max-height:\s*360px/);
  assert.match(recentTableScrollRule, /overflow:\s*visible/);
});
