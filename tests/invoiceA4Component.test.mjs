import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('InvoiceA4 renders the approved A4 sections without watermark markup', async () => {
  const source = await readFile('src/components/InvoiceA4.jsx', 'utf8');

  assert.match(source, /function InvoiceA4\(\{ viewModel \}\)/);
  assert.match(source, /invoice-a4-page/);
  assert.match(source, /invoice-a4-header/);
  assert.match(source, /invoice-a4-items/);
  assert.match(source, /invoice-a4-tax-summary/);
  assert.match(source, /invoice-a4-bank-accounts/);
  assert.match(source, /invoice-a4-footer/);
  assert.doesNotMatch(source, /watermark/i);
});

test('InvoiceA4 renders the shared multiline company header', async () => {
  const source = await readFile('src/components/InvoiceA4.jsx', 'utf8');

  assert.match(source, /invoice-a4-company-logo/);
  assert.match(source, /viewModel\.header\.documentHeaderText/);
  assert.match(source, /invoice-a4-company-text/);
  assert.doesNotMatch(source, /viewModel\.header\.companyLines/);
});

test('InvoiceA4 item table keeps fiscal details in summary instead of item columns', async () => {
  const source = await readFile('src/components/InvoiceA4.jsx', 'utf8');

  assert.match(source, /<th>Codigo<\/th>/);
  assert.match(source, /<th>Descricao<\/th>/);
  assert.match(source, /<th>Qtd\.<\/th>/);
  assert.match(source, /<th>Preco Unit\.<\/th>/);
  assert.match(source, /<th>Total<\/th>/);
  assert.doesNotMatch(source, /<th>Lote<\/th>/);
  assert.doesNotMatch(source, /<th>Validade<\/th>/);
  assert.doesNotMatch(source, /<th>Desc\.<\/th>/);
  assert.doesNotMatch(source, /<th>IVA %<\/th>/);
  assert.doesNotMatch(source, /item\.discount/);
  assert.doesNotMatch(source, /item\.taxRate/);
  assert.match(source, /invoice-a4-tax-summary/);
  assert.match(source, /viewModel\.totals\.discount/);
  assert.match(source, /viewModel\.totals\.tax/);
});

test('invoice A4 stylesheet declares A4 print page and hides app chrome while printing', async () => {
  const css = await readFile('src/assets/tailwind.css', 'utf8');

  assert.match(css, /@page\s*\{\s*size:\s*A4/);
  assert.match(css, /\.invoice-a4-page/);
  assert.match(css, /print-color-adjust:\s*exact/);
  assert.match(css, /@media print/);
  assert.match(css, /\.invoice-a4-print-scope/);
});

test('invoice A4 preview can scroll and uses a neutral print palette', async () => {
  const css = await readFile('src/assets/tailwind.css', 'utf8');

  assert.match(css, /\.modal-card\.wide\.document-detail-modal\s*\{[^}]*width:\s*min\(1120px, calc\(100vw - 48px\)\)/s);
  assert.match(css, /\.document-detail-modal\s*\{[^}]*max-height:\s*calc\(100vh - 48px\)/s);
  assert.match(css, /\.document-detail-modal\s*\{[^}]*overflow-y:\s*auto/s);
  assert.match(css, /\.invoice-a4-actions/);
  assert.match(css, /\.invoice-a4-page h1,[^}]*font-weight:\s*400/s);
  assert.match(css, /\.invoice-a4-page th\s*\{[^}]*background:\s*#f2f2f2/s);
  assert.match(css, /\.invoice-a4-page th\s*\{[^}]*font-weight:\s*400/s);
  assert.match(css, /\.invoice-a4-total-words\s*\{[^}]*font-weight:\s*400/s);

  const invoiceCss = css.slice(css.indexOf('.invoice-a4-print-scope'), css.indexOf('@media print'));
  assert.doesNotMatch(invoiceCss, /#126782|#0b6f82|#b72018/i);
});

test('invoice A4 item table uses the approved neutral colors without capture-like header icons', async () => {
  const css = await readFile('src/assets/tailwind.css', 'utf8');
  const invoiceCss = css.slice(css.indexOf('.invoice-a4-print-scope'), css.indexOf('@media print'));

  assert.match(css, /\.invoice-a4-items thead th\s*\{[^}]*background:\s*#A5A5A5/s);
  assert.match(css, /\.invoice-a4-items tbody tr:nth-child\(odd\)\s*\{[^}]*background:\s*#FFFFFF/s);
  assert.match(css, /\.invoice-a4-items tbody tr:nth-child\(even\)\s*\{[^}]*background:\s*#EDEDED/s);
  assert.match(css, /\.invoice-a4-items tbody tr:nth-child\(odd\) td\s*\{[^}]*background:\s*#FFFFFF/s);
  assert.match(css, /\.invoice-a4-items tbody tr:nth-child\(even\) td\s*\{[^}]*background:\s*#EDEDED/s);
  assert.match(css, /\.invoice-a4-page\s*\{[^}]*font-family:\s*"Segoe UI", Arial, Helvetica, sans-serif/s);
  assert.match(css, /\.invoice-a4-page\s*\{[^}]*letter-spacing:\s*0/s);
  assert.doesNotMatch(invoiceCss, /#c9d8c7|#d8e3d8|#dff4e4|#e8e8e8|#a6a6a6/i);
  assert.doesNotMatch(css, /\.invoice-a4-items thead th::(?:before|after)/);
});

test('invoice A4 item table avoids Excel-like cell grids', async () => {
  const css = await readFile('src/assets/tailwind.css', 'utf8');

  assert.match(css, /\.invoice-a4-items\s*\{[^}]*border-block:\s*2px solid #111/s);
  assert.match(css, /\.invoice-a4-items th,\s*\.invoice-a4-items td\s*\{[^}]*border-inline:\s*0/s);
  assert.match(css, /\.invoice-a4-items th,\s*\.invoice-a4-items td\s*\{[^}]*border-block:\s*1px solid #d2d2d2/s);
  assert.match(css, /\.invoice-a4-items thead th\s*\{[^}]*border-bottom:\s*2px solid #111/s);
  assert.doesNotMatch(css, /\.invoice-a4-items th,\s*\.invoice-a4-items td\s*\{[^}]*border:\s*1px solid/s);
});

test('invoice A4 tax summary matches item table professional styling', async () => {
  const css = await readFile('src/assets/tailwind.css', 'utf8');

  assert.match(css, /\.invoice-a4-tax-summary\s*\{[^}]*border-block:\s*2px solid #111/s);
  assert.match(css, /\.invoice-a4-tax-summary th,\s*\.invoice-a4-tax-summary td\s*\{[^}]*border-inline:\s*0/s);
  assert.match(css, /\.invoice-a4-tax-summary th,\s*\.invoice-a4-tax-summary td\s*\{[^}]*border-block:\s*1px solid #d2d2d2/s);
  assert.match(css, /\.invoice-a4-tax-summary thead th\s*\{[^}]*background:\s*#A5A5A5/s);
  assert.match(css, /\.invoice-a4-tax-summary tbody tr:nth-child\(odd\) td\s*\{[^}]*background:\s*#FFFFFF/s);
  assert.match(css, /\.invoice-a4-tax-summary tbody tr:nth-child\(even\) td\s*\{[^}]*background:\s*#EDEDED/s);
  assert.doesNotMatch(css, /\.invoice-a4-tax-summary th,\s*\.invoice-a4-tax-summary td\s*\{[^}]*border:\s*1px solid/s);
});

test('invoice A4 typography, meta block and bank account layout match final print rules', async () => {
  const css = await readFile('src/assets/tailwind.css', 'utf8');

  assert.match(css, /--invoice-body-size:\s*12px/);
  assert.match(css, /--invoice-heading-size:\s*13px/);
  assert.match(css, /--invoice-bank-size:\s*10px/);
  assert.match(css, /\.invoice-a4-page\s*\{[^}]*font-size:\s*var\(--invoice-body-size\)/s);
  assert.match(css, /\.invoice-a4-client h3\s*\{[^}]*font-size:\s*var\(--invoice-body-size\)/s);
  assert.match(css, /\.invoice-a4-client strong\s*\{[^}]*font-size:\s*var\(--invoice-heading-size\)/s);
  assert.match(css, /\.invoice-a4-page th\s*\{[^}]*font-size:\s*var\(--invoice-heading-size\)/s);
  assert.match(css, /\.invoice-a4-meta\s*\{[^}]*border-block:\s*2px solid #111/s);
  assert.match(css, /\.invoice-a4-meta span\s*\{[^}]*background:\s*transparent/s);
  assert.match(css, /\.invoice-a4-meta span strong\s*\{[^}]*border-bottom:\s*1px solid #999/s);
  assert.match(css, /\.invoice-a4-bank-accounts\s*\{[^}]*max-width:\s*55%/s);
  assert.match(css, /\.invoice-a4-bank-accounts\s*\{[^}]*font-size:\s*var\(--invoice-bank-size\)/s);
  assert.match(css, /\.invoice-a4-grand-total\s*\{[^}]*font-weight:\s*700/s);
});

test('invoice A4 bank accounts render as compact clean text instead of a table', async () => {
  const source = await readFile('src/components/InvoiceA4.jsx', 'utf8');

  assert.match(source, /invoice-a4-bank-list/);
  assert.match(source, /invoice-a4-bank-account/);
  assert.match(source, /invoice-a4-bank-line/);
  assert.match(source, /Conta N\.:/);
  assert.doesNotMatch(source, /<tr><th>Banco<\/th><th>Conta<\/th><th>IBAN<\/th><\/tr>/);
});

test('Documentos uses InvoiceA4 for printable document details', async () => {
  const source = await readFile('src/components/Documentos.jsx', 'utf8');

  assert.match(source, /import InvoiceA4 from '\.\/InvoiceA4'/);
  assert.match(source, /buildInvoiceA4ViewModel/);
  assert.match(source, /buildDocumentSettingsFromSnapshot/);
  assert.match(source, /useSettings/);
  assert.doesNotMatch(source, /getStoredInvoiceA4Settings|getStoredBranding/);
  assert.match(source, /invoice-a4-print-scope/);
  assert.match(source, /<InvoiceA4 viewModel=\{viewModel\} \/>/);
});

test('Documentos exposes PDF and print actions inside A4 preview', async () => {
  const source = await readFile('src/components/Documentos.jsx', 'utf8');

  assert.match(source, /function handlePrintA4/);
  assert.match(source, /function handleSavePdf/);
  assert.match(source, /aria-label="Salvar PDF"/);
  assert.match(source, /aria-label="Imprimir factura"/);
  assert.match(source, /invoice-a4-actions/);
  assert.match(source, /window\.print\(\)/);
  assert.doesNotMatch(source, /<FileDown size=\{17\} \/>\s*Salvar PDF/);
  assert.doesNotMatch(source, /<Printer size=\{17\} \/>\s*Imprimir/);
});

test('Configuracoes exposes central document settings without localStorage', async () => {
  const source = await readFile('src/components/Configuracoes.jsx', 'utf8');

  assert.match(source, /useSettings/);
  assert.match(source, /'documents\.headerText'/);
  assert.match(source, /'documents\.fiscal'/);
  assert.match(source, /configuration\.updateSection/);
  assert.match(source, /validationNumber/);
  assert.match(source, /softwareName/);
  assert.match(source, /showQrCode/);
  assert.match(source, /showTotalInWords/);
  assert.doesNotMatch(source, /getStoredInvoiceA4Settings|saveStoredInvoiceA4Settings/);
  assert.doesNotMatch(source, /Mostrar lote e validade/);
  assert.doesNotMatch(source, /showWatermark.*input/);
});
