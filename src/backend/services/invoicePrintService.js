'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

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
  const n = Number(value) || 0;
  return n.toLocaleString('pt-AO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
  } catch {
    return String(isoStr);
  }
}

async function generateQrSvg(vm) {
  if (!QRCode) return '';
  if (!vm.settings?.showQrCode) return '';
  try {
    const qrText = [
      vm.document?.number || '',
      formatDate(vm.document?.issueDate),
      String(vm.totals?.total || 0),
      vm.header?.companyNif || '',
    ].join(';');
    return await QRCode.toString(qrText, { type: 'svg', width: 70, margin: 1 });
  } catch (e) {
    console.warn('[invoicePrint] QR failed:', e.message);
    return '';
  }
}

function buildCSS() {
  return `
    @page { size: A4 portrait; margin: 10mm; }
    *, *::before, *::after { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0;
      background: #fff;
      font-family: Arial, Helvetica, "Segoe UI", sans-serif;
      font-size: 13px;
      color: #111;
    }
    .inv { width: 190mm; margin: 0 auto; }
    .inv-header {
      display: grid;
      grid-template-columns: 1.35fr 0.75fr;
      gap: 12px;
      padding-bottom: 8px;
      border-bottom: 3px solid #111;
      align-items: start;
    }
    .inv-company { display: flex; align-items: flex-start; gap: 8px; }
    .inv-company-logo { max-width: 70px; max-height: 60px; object-fit: contain; flex-shrink: 0; }
    .inv-company-text { margin: 0; font-size: 10px; line-height: 1.5; white-space: pre-line; }
    .inv-doc-box { text-align: right; }
    .inv-doc-via { font-size: 11px; color: #555; display: block; }
    .inv-doc-title { font-size: 13px; font-weight: 400; display: block; }
    .inv-doc-number { font-size: 16px; font-weight: 700; display: block; }
    .inv-doc-cancelled { display: block; font-style: italic; color: #c00; font-size: 12px; }
    .inv-qr { display: inline-block; width: 60px; height: 60px; margin-top: 6px; border: 1px solid #ddd; }
    .inv-qr svg { width: 100%; height: 100%; display: block; }
    .inv-client { margin-top: 8px; padding-bottom: 8px; border-bottom: 1px solid #ddd; }
    .inv-client-label { margin: 0 0 2px; font-size: 11px; color: #555; font-weight: 400; }
    .inv-client-name { font-size: 14px; font-weight: 700; margin: 0 0 2px; }
    .inv-client-info { font-size: 11px; color: #444; margin: 1px 0; }
    .inv-meta {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 6px;
      margin: 8px 0;
      padding-bottom: 8px;
      border-bottom: 1px solid #ddd;
    }
    .inv-meta-item { display: flex; flex-direction: column; }
    .inv-meta-label { font-size: 10px; color: #555; font-weight: 700; margin-bottom: 2px; }
    .inv-meta-value { font-size: 12px; }
    .inv-items {
      width: 100%;
      border-collapse: collapse;
      margin-top: 6px;
      border-top: 2px solid #111;
      border-bottom: 2px solid #111;
      table-layout: fixed;
      page-break-inside: auto;
    }
    .inv-items col.c-code  { width: 10%; }
    .inv-items col.c-desc  { width: 52%; }
    .inv-items col.c-qty   { width: 8%; }
    .inv-items col.c-price { width: 15%; }
    .inv-items col.c-total { width: 15%; }
    thead { display: table-header-group; }
    tfoot { display: table-footer-group; }
    tr { page-break-inside: avoid; page-break-after: auto; }
    .inv-items thead th {
      background: #A5A5A5;
      color: #111;
      padding: 5px 6px;
      text-align: left;
      border-bottom: 2px solid #111;
      font-weight: 700;
      font-size: 13px;
    }
    .inv-items tbody td {
      padding: 5px 6px;
      border-bottom: 1px solid #ddd;
      vertical-align: middle;
      line-height: 1.3;
      font-size: 13px;
    }
    .inv-items tbody tr:nth-child(even) td { background: #EDEDED; }
    .inv-items td:nth-child(n+3), .inv-items th:nth-child(n+3) { text-align: right; }
    .inv-lot-row td { font-size: 10px; color: #555; padding-top: 0; padding-bottom: 2px; }
    .inv-summary {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 16px;
      margin-top: 12px;
      align-items: start;
    }
    .inv-tax-table {
      width: 100%;
      border-collapse: collapse;
      border-top: 2px solid #111;
      border-bottom: 2px solid #111;
      font-size: 12px;
    }
    .inv-tax-caption { font-size: 11px; text-align: left; padding-bottom: 4px; color: #555; caption-side: top; }
    .inv-tax-table thead th {
      background: #A5A5A5;
      font-size: 12px;
      font-weight: 700;
      padding: 4px 6px;
      border-bottom: 2px solid #111;
    }
    .inv-tax-table tbody td { padding: 4px 6px; border-bottom: 1px solid #ddd; }
    .inv-tax-table th:not(:first-child), .inv-tax-table td:not(:first-child) { text-align: right; }
    .inv-totals { min-width: 170px; border: 1px solid #ddd; padding: 8px 10px; }
    .inv-totals-row {
      display: flex;
      justify-content: space-between;
      padding: 3px 0;
      border-bottom: 1px solid #eee;
      font-size: 12px;
      gap: 12px;
    }
    .inv-totals-grand {
      font-size: 14px;
      font-weight: 700;
      border-top: 2px solid #111;
      border-bottom: none;
      padding-top: 6px;
      margin-top: 4px;
    }
    .inv-words { margin: 10px 0; font-size: 11px; color: #555; text-align: center; }
    .inv-bank { margin-top: 10px; padding-top: 8px; border-top: 1px solid #ddd; }
    .inv-bank-title { font-size: 12px; margin: 0 0 4px; }
    .inv-bank-account { display: flex; gap: 16px; margin-bottom: 3px; font-size: 11px; }
    .inv-bank-item { white-space: nowrap; }
    .inv-notice { margin: 10px 0; font-size: 11px; text-align: center; color: #555; font-style: italic; }
    .inv-footer { margin-top: 14px; padding-top: 8px; border-top: 2px solid #111; text-align: center; }
    .inv-footer-ref { font-size: 12px; font-weight: 700; display: block; margin-bottom: 4px; }
    .inv-footer-line { font-size: 11px; color: #555; display: block; margin: 2px 0; }
    .inv-watermark {
      position: fixed; top: 40%; left: 10%; width: 80%;
      text-align: center; font-size: 72px; font-weight: 900;
      color: rgba(200,0,0,0.10); transform: rotate(-30deg);
      pointer-events: none; z-index: -1;
    }
  `;
}

function buildHTML(vm, qrSvg) {
  const hdr      = vm.header   || {};
  const doc      = vm.document || {};
  const client   = vm.client   || {};
  const items    = vm.items    || [];
  const totals   = vm.totals   || {};
  const settings = vm.settings || {};
  const footer   = vm.footer   || {};
  const taxSummary   = totals.taxSummary  || [];
  const bankAccounts = settings.bankAccounts || [];

  const logoHtml = hdr.logoDataUrl
    ? `<img class="inv-company-logo" src="${hdr.logoDataUrl}" alt="" />`
    : '';

  const itemRows = items.map((item) => {
    let row = `<tr>
      <td>${escapeHtml(item.code)}</td>
      <td>${escapeHtml(item.description)}</td>
      <td>${item.quantity}</td>
      <td>${fmtMoney(item.unitPrice)}</td>
      <td>${fmtMoney(item.total)}</td>
    </tr>`;
    if (settings.showLotAndExpiry && (item.lot || item.expiryDate)) {
      row += `<tr class="inv-lot-row">
        <td colspan="5">Lote: ${escapeHtml(item.lot || '-')} &nbsp;|&nbsp; Val: ${formatDate(item.expiryDate) || '-'}</td>
      </tr>`;
    }
    return row;
  }).join('\n');

  const taxRows = taxSummary.map(row => `<tr>
    <td>${escapeHtml(row.designation)}</td>
    <td>${fmtMoney(row.incidence)}</td>
    <td>${row.taxRate}</td>
    <td>${fmtMoney(row.taxValue)}</td>
  </tr>`).join('\n');

  const bankHtml = bankAccounts.length ? `
  <div class="inv-bank">
    <h3 class="inv-bank-title">Coordenadas Bancarias</h3>
    ${bankAccounts.map(acc => `
    <div class="inv-bank-account">
      <span class="inv-bank-item"><strong>BANCO:</strong> ${escapeHtml(acc.bank)}</span>
      <span class="inv-bank-item">Conta N.: ${escapeHtml(acc.account)}</span>
      <span class="inv-bank-item">IBAN: ${escapeHtml(acc.iban)}</span>
    </div>`).join('')}
  </div>` : '';

  return `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(doc.title || 'Documento')} ${escapeHtml(doc.number || '')}</title>
  <style>${buildCSS()}</style>
</head>
<body>
${doc.isCancelled ? '<div class="inv-watermark">ANULADO</div>' : ''}
<div class="inv">

  <header class="inv-header">
    <div class="inv-company">
      ${logoHtml}
      <p class="inv-company-text">${escapeHtml(hdr.documentHeaderText || '')}</p>
    </div>
    <div class="inv-doc-box">
      <span class="inv-doc-via">${escapeHtml(doc.viaLabel || 'Original')}</span>
      <span class="inv-doc-title">${escapeHtml(doc.title || 'Factura')}</span>
      <span class="inv-doc-number">${escapeHtml(doc.number || '')}</span>
      ${doc.isCancelled ? '<span class="inv-doc-cancelled">Anulado</span>' : ''}
      ${qrSvg ? `<div class="inv-qr">${qrSvg}</div>` : ''}
    </div>
  </header>

  <div class="inv-client">
    <p class="inv-client-label">Exmo.(s) Sr.(s)</p>
    <p class="inv-client-name">${escapeHtml(client.name || 'Consumidor final')}</p>
    ${client.taxId  ? `<p class="inv-client-info">Contribuinte: ${escapeHtml(client.taxId)}</p>` : ''}
    ${client.phone  ? `<p class="inv-client-info">Telefone: ${escapeHtml(client.phone)}</p>` : ''}
    ${client.address ? `<p class="inv-client-info">${escapeHtml(client.address)}</p>` : ''}
  </div>

  <div class="inv-meta">
    <div class="inv-meta-item">
      <span class="inv-meta-label">Data Emissao</span>
      <span class="inv-meta-value">${formatDate(doc.issueDate)}</span>
    </div>
    <div class="inv-meta-item">
      <span class="inv-meta-label">Data Vencimento</span>
      <span class="inv-meta-value">${formatDate(doc.dueDate) || '-'}</span>
    </div>
    <div class="inv-meta-item">
      <span class="inv-meta-label">Moeda</span>
      <span class="inv-meta-value">${escapeHtml(doc.currency || 'AKZ')}</span>
    </div>
    <div class="inv-meta-item">
      <span class="inv-meta-label">Condicao Pagamento</span>
      <span class="inv-meta-value">${escapeHtml(doc.paymentCondition || '-')}</span>
    </div>
  </div>

  <table class="inv-items">
    <colgroup>
      <col class="c-code" />
      <col class="c-desc" />
      <col class="c-qty" />
      <col class="c-price" />
      <col class="c-total" />
    </colgroup>
    <thead>
      <tr>
        <th>Codigo</th>
        <th>Descricao</th>
        <th>Qtd.</th>
        <th>Preco Unit.</th>
        <th>Total</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows}
    </tbody>
  </table>

  <div class="inv-summary">
    <table class="inv-tax-table">
      <caption class="inv-tax-caption">Quadro Resumo de Imposto</caption>
      <thead>
        <tr>
          <th>Descricao</th>
          <th>Incidencia</th>
          <th>Taxa %</th>
          <th>Imposto</th>
        </tr>
      </thead>
      <tbody>${taxRows}</tbody>
    </table>
    <div class="inv-totals">
      <div class="inv-totals-row"><strong>Subtotal</strong><span>${fmtMoney(totals.subtotal)}</span></div>
      <div class="inv-totals-row"><strong>Desconto</strong><span>${fmtMoney(totals.discount)}</span></div>
      <div class="inv-totals-row"><strong>Imposto</strong><span>${fmtMoney(totals.tax)}</span></div>
      <div class="inv-totals-row"><strong>Retencao</strong><span>${fmtMoney(totals.retention)}</span></div>
      <div class="inv-totals-row inv-totals-grand"><strong>Total (Kz)</strong><span>${fmtMoney(totals.total)}</span></div>
    </div>
  </div>

  ${totals.totalInWords ? `<p class="inv-words">Sao: ${escapeHtml(totals.totalInWords)}</p>` : ''}
  ${bankHtml}
  ${doc.proformaNotice ? `<p class="inv-notice">${escapeHtml(doc.proformaNotice)}</p>` : ''}

  <footer class="inv-footer">
    <span class="inv-footer-ref">${escapeHtml(footer.fiscalReference || '')}</span>
    <span class="inv-footer-line">Impresso por: ${escapeHtml(footer.printedBy || '')}</span>
    <span class="inv-footer-line">Data: ${formatDateTime(footer.printedAt)}</span>
    <span class="inv-footer-line">Regime Fiscal: ${escapeHtml(settings.fiscalRegime || '')}</span>
  </footer>

</div>
</body>
</html>`;
}

async function generatePDF(viewModel) {
  const { BrowserWindow } = require('electron');
  const qrSvg = await generateQrSvg(viewModel);
  const html = buildHTML(viewModel, qrSvg);
  const tmpPath = path.join(os.tmpdir(), `kil-invoice-${Date.now()}.html`);
  fs.writeFileSync(tmpPath, html, 'utf8');
  const win = new BrowserWindow({
    show: false,
    width: 794,
    height: 1123,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  try {
    await win.loadFile(tmpPath);
    const pdfBuffer = await win.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      margins: { marginType: 'none' },
    });
    return Buffer.from(pdfBuffer);
  } finally {
    win.destroy();
    try { fs.unlinkSync(tmpPath); } catch {}
  }
}

async function printDocument(viewModel) {
  const { BrowserWindow } = require('electron');
  const qrSvg = await generateQrSvg(viewModel);
  const html = buildHTML(viewModel, qrSvg);
  const tmpPath = path.join(os.tmpdir(), `kil-invoice-${Date.now()}.html`);
  fs.writeFileSync(tmpPath, html, 'utf8');
  const win = new BrowserWindow({
    show: false,
    width: 794,
    height: 1123,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  try {
    await win.loadFile(tmpPath);
    await new Promise((resolve) => {
      win.webContents.print(
        { silent: false, printBackground: true, margins: { marginType: 'none' } },
        () => resolve(),
      );
    });
  } finally {
    win.destroy();
    try { fs.unlinkSync(tmpPath); } catch {}
  }
}

module.exports = { generatePDF, printDocument, buildHTML };
