'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { pathToFileURL } = require('url');

let QRCode;
try { QRCode = require('qrcode'); } catch { QRCode = null; }

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtMoney(value) {
  return (Number(value) || 0).toLocaleString('pt-AO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(str) {
  if (!str) return '-';
  const m = String(str).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return String(str);
}

function formatDateTime(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return String(isoStr);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${d.getFullYear()} ${hh}:${min}`;
  } catch { return String(isoStr); }
}

function findAppCssHref() {
  try {
    const assetsDir = path.join(__dirname, '../../../dist/assets');
    const files = fs.readdirSync(assetsDir);
    const cssFile = files.find(f => /^index.*\.css$/.test(f));
    if (cssFile) return pathToFileURL(path.join(assetsDir, cssFile)).href;
  } catch {}
  return null;
}

async function generateQrSvg(viewModel) {
  if (!QRCode || !viewModel.settings?.showQrCode) return '';
  try {
    const text = [
      viewModel.document?.number || '',
      formatDate(viewModel.document?.issueDate),
      String(viewModel.totals?.total || 0),
      viewModel.header?.companyNif || '',
    ].join(';');
    return await QRCode.toString(text, { type: 'svg', width: 70, margin: 1 });
  } catch { return ''; }
}

// Generates HTML that matches InvoiceA4.jsx exactly (same class names + app CSS)
async function buildInvoiceHtml(vm) {
  const cssHref = findAppCssHref();
  const qrSvg = await generateQrSvg(vm);
  const { header: hdr = {}, document: doc = {}, client = {}, items = [],
          totals = {}, settings = {}, footer = {} } = vm;

  const itemRows = items.map(item => `
    <tr>
      <td>${escapeHtml(item.code)}</td>
      <td>${escapeHtml(item.description)}</td>
      <td>${item.quantity}</td>
      <td>${fmtMoney(item.unitPrice)}</td>
      <td>${fmtMoney(item.total)}</td>
    </tr>`).join('');

  const taxRows = (totals.taxSummary || []).map(row => `
    <tr>
      <td>${escapeHtml(row.designation)}</td>
      <td>${fmtMoney(row.incidence)}</td>
      <td>${row.taxRate}</td>
      <td>${fmtMoney(row.taxValue)}</td>
    </tr>`).join('');

  const bankAccounts = settings.bankAccounts || [];
  const bankHtml = bankAccounts.length ? `
    <section class="invoice-a4-bank-accounts">
      <h3>Coordenadas Bancarias</h3>
      <div class="invoice-a4-bank-list">
        ${bankAccounts.map(acc => `
        <div class="invoice-a4-bank-account">
          <p class="invoice-a4-bank-line bank"><strong>BANCO:</strong><span>${escapeHtml(acc.bank)}</span></p>
          <p class="invoice-a4-bank-line"><span>Conta N.:</span><span>${escapeHtml(acc.account)}</span></p>
          <p class="invoice-a4-bank-line"><span>IBAN:</span><span>${escapeHtml(acc.iban)}</span></p>
        </div>`).join('')}
      </div>
    </section>` : '';

  return `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(doc.title || 'Documento')} ${escapeHtml(doc.number || '')}</title>
  ${cssHref ? `<link rel="stylesheet" href="${cssHref}">` : ''}
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    html, body { margin: 0; padding: 0; background: #fff !important; }
    .invoice-a4-page {
      box-shadow: none !important;
      border: none !important;
      margin: 0 !important;
      min-height: unset !important;
    }
    .invoice-a4-qr { display: flex; align-items: center; justify-content: center; }
    .invoice-a4-qr svg { width: 100%; height: 100%; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
  </style>
</head>
<body>
  <article class="invoice-a4-page">
    <header class="invoice-a4-header">
      <section class="invoice-a4-company">
        ${hdr.logoDataUrl ? `<img class="invoice-a4-company-logo" src="${hdr.logoDataUrl}" alt="" />` : ''}
        <p class="invoice-a4-company-text">${escapeHtml(hdr.documentHeaderText || '')}</p>
      </section>
      <section class="invoice-a4-document-box">
        <span>${escapeHtml(doc.viaLabel || 'Original')}</span>
        <h2>${escapeHtml(doc.title || 'Factura')}</h2>
        <strong>${escapeHtml(doc.number || '')}</strong>
        ${doc.isCancelled ? '<em>Anulado</em>' : ''}
        ${qrSvg ? `<div class="invoice-a4-qr">${qrSvg}</div>` : ''}
      </section>
    </header>

    <section class="invoice-a4-client">
      <h3>Exmo.(s) Sr.(s)</h3>
      <strong>${escapeHtml(client.name || 'Consumidor final')}</strong>
      ${client.taxId  ? `<span>Contribuinte: ${escapeHtml(client.taxId)}</span>` : ''}
      ${client.phone  ? `<span>Telefone: ${escapeHtml(client.phone)}</span>` : ''}
      ${client.address ? `<span>${escapeHtml(client.address)}</span>` : ''}
    </section>

    <section class="invoice-a4-meta">
      <span><strong>Data Emissao</strong>${formatDate(doc.issueDate)}</span>
      <span><strong>Data Vencimento</strong>${doc.dueDate ? formatDate(doc.dueDate) : '-'}</span>
      <span><strong>Moeda</strong>${escapeHtml(doc.currency || 'AKZ')}</span>
      <span><strong>Condicao Pagamento</strong>${escapeHtml(doc.paymentCondition || '-')}</span>
    </section>

    <table class="invoice-a4-items">
      <colgroup>
        <col style="width:10%">
        <col style="width:52%">
        <col style="width:8%">
        <col style="width:15%">
        <col style="width:15%">
      </colgroup>
      <thead>
        <tr>
          <th>Codigo</th><th>Descricao</th><th>Qtd.</th><th>Preco Unit.</th><th>Total</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>

    <section class="invoice-a4-summary">
      <table class="invoice-a4-tax-summary">
        <caption>Quadro Resumo de Imposto</caption>
        <thead>
          <tr><th>Descricao</th><th>Incidencia</th><th>Taxa %</th><th>Imposto</th></tr>
        </thead>
        <tbody>${taxRows}</tbody>
      </table>
      <div class="invoice-a4-totals">
        <span><strong>Subtotal</strong>${fmtMoney(totals.subtotal)}</span>
        <span><strong>Desconto</strong>${fmtMoney(totals.discount)}</span>
        <span><strong>Imposto</strong>${fmtMoney(totals.tax)}</span>
        <span><strong>Retencao</strong>${fmtMoney(totals.retention)}</span>
        <span class="invoice-a4-grand-total"><strong>Total (Kz)</strong>${fmtMoney(totals.total)}</span>
      </div>
    </section>

    ${totals.totalInWords ? `<p class="invoice-a4-total-words">Sao: ${escapeHtml(totals.totalInWords)}</p>` : ''}
    ${bankHtml}
    ${doc.proformaNotice ? `<p class="invoice-a4-notice">${escapeHtml(doc.proformaNotice)}</p>` : ''}

    <footer class="invoice-a4-footer">
      <strong>${escapeHtml(footer.fiscalReference || '')}</strong>
      <span>Impresso por: ${escapeHtml(footer.printedBy || '')}</span>
      <span>Data: ${formatDateTime(footer.printedAt)}</span>
      <span>Regime Fiscal: ${escapeHtml(settings.fiscalRegime || '')}</span>
    </footer>
  </article>
</body>
</html>`;
}

// Generates HTML that matches ReportA4.jsx exactly (same class names + app CSS)
function buildReportHtml(report, branding, settings, printedBy) {
  const cssHref = findAppCssHref();
  const colHeaders = (report.columns || []).map(col => `<th>${escapeHtml(col.label)}</th>`).join('');
  const rows = (report.rows || []).map(row => {
    const cells = (report.columns || []).map(col => {
      const val = row[col.key];
      let display;
      if (col.type === 'money') display = fmtMoney(val);
      else if (val === null || val === undefined || val === '') display = '-';
      else display = escapeHtml(String(val));
      return `<td>${display}</td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  const filtersHtml = report.filters?.startDate
    ? `<small>${escapeHtml(report.filters.startDate)}${report.filters.endDate ? ` — ${escapeHtml(report.filters.endDate)}` : ''}</small>`
    : '';

  return `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(report.title || 'Relatorio')}</title>
  ${cssHref ? `<link rel="stylesheet" href="${cssHref}">` : ''}
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    html, body { margin: 0; padding: 0; background: #fff !important; }
    .report-a4-page {
      box-shadow: none !important;
      border: none !important;
      margin: 0 !important;
      min-height: unset !important;
    }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
  </style>
</head>
<body>
  <article class="report-a4-page">
    <header class="report-a4-header">
      <section class="report-a4-company">
        ${(branding.logoDataUrl) ? `<img class="report-a4-logo" src="${branding.logoDataUrl}" alt="" />` : ''}
        <p class="report-a4-company-text">${escapeHtml(settings.documentHeaderText || '')}</p>
      </section>
      <section class="report-a4-document-box">
        <span>Relatorio</span>
        <h2>${escapeHtml(report.title || '')}</h2>
        ${filtersHtml}
      </section>
    </header>
    <h2 class="report-a4-data-title">${escapeHtml(report.title || '')}</h2>
    <table class="report-a4-table">
      <thead><tr>${colHeaders}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${!report.rows?.length ? '<p class="report-a4-empty">Sem dados para os filtros selecionados.</p>' : ''}
    <footer class="report-a4-footer">
      <span>Impresso por ${escapeHtml(printedBy || '')}</span>
      <span>${escapeHtml(report.generatedAt || '')}</span>
      <span>${escapeHtml(settings.fiscalRegime || '')}</span>
    </footer>
  </article>
</body>
</html>`;
}

// Core PDF generation: loads HTML in hidden BrowserWindow, exports via printToPDF
async function htmlToPDF(html) {
  const { BrowserWindow } = require('electron');
  const tmpHtml = path.join(os.tmpdir(), `kil-doc-${Date.now()}.html`);
  fs.writeFileSync(tmpHtml, html, 'utf8');
  const win = new BrowserWindow({
    show: false,
    width: 1200,
    height: 900,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  try {
    await win.loadFile(tmpHtml);
    // Wait for CSS and images to fully render
    await win.webContents.executeJavaScript(`
      new Promise(resolve => {
        if (document.readyState === 'complete') {
          setTimeout(resolve, 300);
        } else {
          window.addEventListener('load', () => setTimeout(resolve, 300));
        }
      })
    `);
    const pdfBuffer = await win.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      margins: { marginType: 'none' },
    });
    return Buffer.from(pdfBuffer);
  } finally {
    win.destroy();
    try { fs.unlinkSync(tmpHtml); } catch {}
  }
}

// Shows OS save dialog, writes PDF, opens it in the system viewer
async function saveAndOpen(pdfBuffer, defaultName) {
  const { dialog, shell } = require('electron');
  const result = await dialog.showSaveDialog({
    title: 'Guardar documento em PDF',
    defaultPath: defaultName,
    filters: [{ name: 'Documento PDF', extensions: ['pdf'] }],
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  fs.writeFileSync(result.filePath, pdfBuffer);
  await shell.openPath(result.filePath);
  return { saved: true };
}

// Saves PDF to temp, opens in system viewer (print from viewer)
async function openForPrint(pdfBuffer, docName) {
  const { shell } = require('electron');
  const tmpPdf = path.join(os.tmpdir(), `kil-print-${Date.now()}-${docName}`);
  fs.writeFileSync(tmpPdf, pdfBuffer);
  await shell.openPath(tmpPdf);
  return { opened: true };
}

async function generateInvoicePDF(viewModel) {
  const html = await buildInvoiceHtml(viewModel);
  return htmlToPDF(html);
}

async function generateReportPDF(report, branding, settings, printedBy) {
  const html = buildReportHtml(report, branding, settings, printedBy);
  return htmlToPDF(html);
}

module.exports = { generateInvoicePDF, generateReportPDF, saveAndOpen, openForPrint };
