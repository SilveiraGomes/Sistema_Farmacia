'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { pathToFileURL } = require('url');

let QRCode;
try { QRCode = require('qrcode'); } catch { QRCode = null; }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function printWebContents(webContents, options = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;

    function finish(success, failureReason) {
      if (settled) return;
      settled = true;
      if (success) {
        resolve();
        return;
      }
      reject(new Error(failureReason || 'Print failed'));
    }

    try {
      const maybePromise = webContents.print(options, finish);
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.then(() => finish(true, ''), reject);
      }
    } catch (err) {
      reject(err);
    }
  });
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

// ---------------------------------------------------------------------------
// Critical CSS override
// Explicit width: 210mm fixes "content size is empty" on physical printers.
// ---------------------------------------------------------------------------
const PRINT_MEDIA_OVERRIDE = `
@media print {
  body * { visibility: visible !important; }
  html, body {
    width: 210mm !important;
    overflow: visible !important;
    margin: 0 !important;
    padding: 0 !important;
  }
  .invoice-a4-page, .report-a4-page { min-height: unset !important; }
  .print-toolbar, .no-print { display: none !important; }
}`;

// ---------------------------------------------------------------------------
// Toolbar (preview window only) — embeds configured printer + silent mode
// ---------------------------------------------------------------------------

const TOOLBAR_CSS = `
<style id="print-toolbar-style">
.print-toolbar {
  position: sticky;
  top: 0;
  z-index: 9999;
  background: #1a1a2e;
  color: #e2e8f0;
  display: flex;
  align-items: center;
  padding: 8px 16px;
  gap: 14px;
  flex-wrap: wrap;
  font-family: system-ui, sans-serif;
  font-size: 13px;
  box-shadow: 0 2px 8px rgba(0,0,0,.35);
}
.print-toolbar-title {
  font-weight: 700;
  font-size: 14px;
  flex: 0 0 auto;
  margin-right: 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 280px;
}
.print-toolbar-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.print-toolbar-label {
  display: flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
}
.print-toolbar-label select {
  border: 1px solid #4a5568;
  background: #2d3748;
  color: #e2e8f0;
  padding: 5px 8px;
  border-radius: 4px;
  font-size: 12px;
  max-width: 240px;
}
.print-toolbar-label input[type="number"] {
  border: 1px solid #4a5568;
  background: #2d3748;
  color: #e2e8f0;
  padding: 5px 8px;
  border-radius: 4px;
  font-size: 12px;
  width: 58px;
  text-align: center;
}
.print-toolbar-btn {
  padding: 6px 14px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  background: #3d4f70;
  color: #e2e8f0;
  white-space: nowrap;
}
.print-toolbar-btn:hover:not(:disabled) { background: #4a5f85; }
.print-toolbar-btn.primary { background: #2563eb; }
.print-toolbar-btn.primary:hover:not(:disabled) { background: #1d4ed8; }
.print-toolbar-btn.danger { background: #7f1d1d; }
.print-toolbar-btn.danger:hover:not(:disabled) { background: #991b1b; }
.print-toolbar-btn:disabled { opacity: .45; cursor: not-allowed; }
.print-status { font-size: 12px; padding: 4px 10px; border-radius: 4px; min-width: 140px; }
.print-status.success { color: #4ade80; }
.print-status.error   { color: #f87171; }
.print-status.info    { color: #94a3b8; }
@media print {
  .print-toolbar, .no-print { display: none !important; }
}
</style>`;

function buildToolbarHtml(title, filename, printConfig = {}) {
  const safeTitle = escapeHtml(title || 'Documento');
  const safeFilename = (filename || 'documento.pdf').replace(/'/g, "\\'");
  const configuredPrinter = (printConfig.printerName || '').replace(/'/g, "\\'");
  // If showDialog is false (default), print silently to the selected/configured printer
  const useSilent = !printConfig.showDialog;
  const configuredCopies = Math.max(1, Math.min(10, parseInt(printConfig.copies) || 1));

  return `
<div class="print-toolbar no-print" id="printToolbar">
  <span class="print-toolbar-title">${safeTitle}</span>
  <div class="print-toolbar-controls">
    <label class="print-toolbar-label">
      <span>Impressora:</span>
      <select id="printerSelect"><option value="">A carregar...</option></select>
    </label>
    <label class="print-toolbar-label">
      <span>Copias:</span>
      <input type="number" id="copiesInput" min="1" max="10" value="${configuredCopies}">
    </label>
    <button id="btnExportPdf" class="print-toolbar-btn">Exportar PDF</button>
    <button id="btnPrint" class="print-toolbar-btn primary">Imprimir</button>
    <button id="btnClose" class="print-toolbar-btn danger">Fechar</button>
    <span id="printStatus" class="print-status"></span>
  </div>
</div>
<script>
(async function initToolbar() {
  var printerSelect = document.getElementById('printerSelect');
  var copiesInput   = document.getElementById('copiesInput');
  var btnPrint      = document.getElementById('btnPrint');
  var btnExportPdf  = document.getElementById('btnExportPdf');
  var btnClose      = document.getElementById('btnClose');
  var statusEl      = document.getElementById('printStatus');
  var PDF_FILENAME      = '${safeFilename}';
  var CONFIGURED_PRINTER = '${configuredPrinter}';
  var USE_SILENT        = ${useSilent};

  function setStatus(msg, type) {
    statusEl.textContent = msg;
    statusEl.className = 'print-status ' + (type || '');
  }

  if (window.printApi) {
    try {
      var printers = await window.printApi.listPrinters();
      if (printers && printers.length) {
        printerSelect.innerHTML = printers.map(function(p) {
          var sel = (CONFIGURED_PRINTER && p.name === CONFIGURED_PRINTER) || (!CONFIGURED_PRINTER && p.isDefault);
          return '<option value="' + p.name + '"' + (sel ? ' selected' : '') + '>' +
                 (p.displayName || p.name) + '</option>';
        }).join('');
      } else {
        printerSelect.innerHTML = '<option value="">Impressora padrao do sistema</option>';
      }
    } catch (e) {
      printerSelect.innerHTML = '<option value="">Impressora padrao do sistema</option>';
    }
  } else {
    printerSelect.innerHTML = '<option value="">Impressora padrao do sistema</option>';
  }

  btnPrint.onclick = async function() {
    if (!window.printApi) { setStatus('API nao disponivel.', 'error'); return; }
    btnPrint.disabled = true;
    setStatus('A imprimir...', 'info');
    try {
      var result = await window.printApi.print({
        printerName: printerSelect.value,
        copies: parseInt(copiesInput.value, 10) || 1,
        silent: USE_SILENT,
      });
      if (result && result.success === false) {
        var errMsg = result.error || result.reason || '';
        if (errMsg && errMsg.toLowerCase().indexOf('cancel') >= 0) {
          setStatus('Impressao cancelada.', 'info');
        } else if (errMsg) {
          setStatus('Erro: ' + errMsg, 'error');
        } else {
          setStatus('Impressao nao concluida.', 'info');
        }
      } else if (result && result.method === 'pdf_fallback') {
        setStatus(result.message || 'PDF aberto para impressao.', 'success');
      } else {
        setStatus('Documento enviado para a impressora.', 'success');
      }
    } catch (e) {
      setStatus('Erro ao imprimir: ' + (e.message || String(e)), 'error');
    } finally {
      btnPrint.disabled = false;
    }
  };

  btnExportPdf.onclick = async function() {
    if (!window.printApi) { setStatus('API nao disponivel.', 'error'); return; }
    btnExportPdf.disabled = true;
    setStatus('A gerar PDF...', 'info');
    try {
      var result = await window.printApi.exportPdf({ filename: PDF_FILENAME });
      if (result && result.saved) {
        setStatus('PDF exportado com sucesso.', 'success');
      } else if (result && result.canceled) {
        setStatus('', '');
      } else {
        setStatus('Erro ao exportar PDF.', 'error');
      }
    } catch (e) {
      setStatus('Erro ao exportar PDF.', 'error');
    } finally {
      btnExportPdf.disabled = false;
    }
  };

  btnClose.onclick = function() {
    if (window.printApi) window.printApi.close();
    else window.close();
  };
})();
</script>`;
}

function wrapWithToolbar(html, title, filename, printConfig) {
  const toolbarBlock = buildToolbarHtml(title, filename, printConfig);
  return html
    .replace('</head>', `${TOOLBAR_CSS}\n</head>`)
    .replace('<body>', `<body>\n${toolbarBlock}\n`);
}

// ---------------------------------------------------------------------------
// Document HTML builders (pure document, no toolbar)
// ---------------------------------------------------------------------------

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
    ${PRINT_MEDIA_OVERRIDE}
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
    ${PRINT_MEDIA_OVERRIDE}
  </style>
</head>
<body>
  <article class="report-a4-page">
    <header class="report-a4-header">
      <section class="report-a4-company">
        ${branding.logoDataUrl ? `<img class="report-a4-logo" src="${branding.logoDataUrl}" alt="" />` : ''}
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

// ---------------------------------------------------------------------------
// Electron window helpers
// ---------------------------------------------------------------------------

function waitForRender(win) {
  return win.webContents.executeJavaScript(`
    new Promise(function(resolve) {
      if (document.readyState === 'complete') {
        setTimeout(resolve, 400);
      } else {
        window.addEventListener('load', function() { setTimeout(resolve, 400); });
      }
    })
  `);
}

async function waitForFontsAndContent(win) {
  try {
    await win.webContents.executeJavaScript(
      'document.fonts ? document.fonts.ready.then(function(){return true;}) : Promise.resolve(true)'
    );
  } catch {}
  await new Promise(r => setTimeout(r, 300));

  let contentInfo = { bodyHeight: 1, bodyWidth: 1 };
  try {
    contentInfo = await win.webContents.executeJavaScript(
      '({bodyHeight: document.body.scrollHeight, bodyWidth: document.body.scrollWidth, bodyTextLength: document.body.innerText.length})'
    );
    console.log('[print] contentInfo:', JSON.stringify(contentInfo));
  } catch {}
  return contentInfo;
}

async function doPrint(win, printOpts = {}) {
  const copies = Math.max(1, Math.min(10, parseInt(printOpts.copies) || 1));
  const deviceName = printOpts.printerName || '';
  const silent = printOpts.silent !== false; // default true (direct mode)

  console.log('[print] deviceName:', deviceName || '(padrao)', '| copies:', copies, '| silent:', silent);
  console.log('[print] pageSize: A4, margins: printableArea');

  // Attempt 1: printableArea margins (best printer compatibility)
  try {
    await printWebContents(win.webContents, {
      silent,
      printBackground: true,
      deviceName,
      copies,
      pageSize: 'A4',
      landscape: false,
      margins: { marginType: 'printableArea' },
    });
    console.log('[print] success: true');
    return { success: true };
  } catch (err) {
    const msg = err?.message || String(err);
    console.log('[print] error:', msg);

    if (/cancel/i.test(msg)) {
      return { success: false, error: 'Print Cancelled' };
    }

    // Attempt 2: default margins, always silent
    if (/invalid|empty|size|settings/i.test(msg)) {
      console.log('[print] Tentando fallback: default margins...');
      try {
        await printWebContents(win.webContents, {
          silent: true,
          printBackground: true,
          deviceName,
          copies,
          pageSize: 'A4',
          landscape: false,
          margins: { marginType: 'default' },
        });
        console.log('[print] success: true (default margins)');
        return { success: true };
      } catch (err2) {
        console.log('[print] fallback default error:', err2?.message || String(err2));
      }

      // Attempt 3: PDF fallback — open in system viewer
      console.log('[print] Fallback PDF...');
      try {
        const pdfBuffer = await win.webContents.printToPDF({
          printBackground: true,
          pageSize: 'A4',
          margins: { marginType: 'none' },
        });
        const tmpPdf = path.join(os.tmpdir(), `kil-fallback-${Date.now()}.pdf`);
        fs.writeFileSync(tmpPdf, Buffer.from(pdfBuffer));
        const { shell } = require('electron');
        await shell.openPath(tmpPdf);
        setTimeout(() => { try { fs.unlinkSync(tmpPdf); } catch {} }, 60000);
        return {
          success: true,
          method: 'pdf_fallback',
          message: 'PDF aberto no visualizador. Imprima a partir do visualizador.',
        };
      } catch (err3) {
        console.log('[print] PDF fallback error:', err3?.message);
        return {
          success: false,
          error: 'A impressora recusou as definicoes de pagina. Exporte o PDF e imprima manualmente.',
        };
      }
    }

    return { success: false, error: msg };
  }
}

// Hidden window — generate PDF buffer for save/export
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
    await waitForRender(win);
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

// Direct print — window shown off-screen to get a real compositor context.
// A fully hidden (show:false) BrowserWindow on Windows sends blank raster data
// to physical printers even when webContents.print() resolves successfully.
async function printHtmlDirect(html, printOpts = {}) {
  const { BrowserWindow, screen } = require('electron');
  const tmpHtml = path.join(os.tmpdir(), `kil-direct-${Date.now()}.html`);
  fs.writeFileSync(tmpHtml, html, 'utf8');

  // Position far off every display so the user never sees the window
  const displays = screen.getAllDisplays();
  const maxX = Math.max(...displays.map(d => d.bounds.x + d.bounds.width)) + 100;

  const win = new BrowserWindow({
    show: false,
    x: maxX,
    y: 0,
    width: 1240,
    height: 1754,  // ≈ A4 at 150 dpi — gives the renderer a realistic page area
    skipTaskbar: true,
    frame: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  try {
    await win.loadFile(tmpHtml);
    // showInactive gives the renderer a real GPU/compositor context without
    // stealing focus from the main window
    win.showInactive();
    await waitForFontsAndContent(win);
    // Extra paint cycle so Chromium flushes layers before print
    await new Promise(r => setTimeout(r, 200));

    return await doPrint(win, { ...printOpts, silent: true });
  } finally {
    win.destroy();
    try { fs.unlinkSync(tmpHtml); } catch {}
  }
}

// Preview window — visible, with toolbar, user-initiated print
async function openPrintPreview(html, windowTitle, pdfFilename, printConfig = {}) {
  const { BrowserWindow } = require('electron');
  const preloadPath = path.join(__dirname, '../printWindowPreload.js');
  const previewHtml = wrapWithToolbar(html, windowTitle, pdfFilename, printConfig);
  const tmpHtml = path.join(os.tmpdir(), `kil-preview-${Date.now()}.html`);
  fs.writeFileSync(tmpHtml, previewHtml, 'utf8');

  const win = new BrowserWindow({
    show: false,
    width: 1100,
    height: 850,
    minWidth: 900,
    minHeight: 700,
    title: windowTitle || 'Pre-visualizacao',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '../../../resources/icon.ico'),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  await win.loadFile(tmpHtml);
  await waitForRender(win);
  win.show();

  win.on('closed', () => { try { fs.unlinkSync(tmpHtml); } catch {} });
  return { ok: true };
}

// Save PDF with OS save dialog, open result in system viewer
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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

async function generateInvoicePDF(viewModel, filename) {
  const html = await buildInvoiceHtml(viewModel);
  const pdfBuffer = await htmlToPDF(html);
  return saveAndOpen(pdfBuffer, filename || 'documento.pdf');
}

async function printInvoice(viewModel, windowTitle, pdfFilename, printConfig) {
  const html = await buildInvoiceHtml(viewModel);
  return openPrintPreview(html, windowTitle || 'Documento', pdfFilename || 'documento.pdf', printConfig || {});
}

async function printDirect(viewModel, printOpts) {
  const html = await buildInvoiceHtml(viewModel);
  return printHtmlDirect(html, printOpts || {});
}

async function generateReportPDF(report, branding, settings, printedBy, filename) {
  const html = buildReportHtml(report, branding, settings, printedBy);
  const pdfBuffer = await htmlToPDF(html);
  return saveAndOpen(pdfBuffer, filename || 'relatorio.pdf');
}

async function printReport(report, branding, settings, printedBy, windowTitle, pdfFilename, printConfig) {
  const html = buildReportHtml(report, branding, settings, printedBy);
  return openPrintPreview(html, windowTitle || 'Relatorio', pdfFilename || 'relatorio.pdf', printConfig || {});
}

async function printReportDirect(report, branding, settings, printedBy, printOpts) {
  const html = buildReportHtml(report, branding, settings, printedBy);
  return printHtmlDirect(html, printOpts || {});
}

module.exports = {
  generateInvoicePDF,
  printInvoice,
  printDirect,
  generateReportPDF,
  printReport,
  printReportDirect,
  printWebContents,
};
