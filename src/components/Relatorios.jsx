import React, { useMemo, useState } from 'react';
import {
  CalendarDays,
  Download,
  FileBarChart,
  FileDown,
  Printer,
  RefreshCcw,
  Search,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { getStoredBranding } from '../data/branding.mjs';
import { documents as reportDocuments } from '../data/documents.mjs';
import { getStoredInvoiceA4Settings } from '../data/invoiceSettings.mjs';
import {
  REPORT_CATALOG,
  buildReportCsv,
  buildReportData,
} from '../data/reports.mjs';
import {
  clients,
  financeExpenses,
  financeLosses,
  financeOtherRevenues,
  financeProductSales,
  formatKwanza,
  invoices,
  stockItems,
} from '../data/pharmacyData.mjs';
import { useOperation } from '../operation/OperationContext';
import ReportA4 from './ReportA4';

const DEFAULT_FILTERS = {
  startDate: '2026-06-01',
  endDate: '2026-06-15',
  date: '2026-06-15',
  compareStartDate: '2026-06-01',
  compareEndDate: '2026-06-14',
  shift: 'Todos',
  category: '',
  paymentMethod: '',
  query: '',
};

function getUserName(user) {
  return user?.nome_completo || user?.nome_usuario || 'Usuario';
}

function getFirstReportId() {
  return REPORT_CATALOG[0].reports[0].id;
}

function findReportDefinition(reportId) {
  return REPORT_CATALOG.flatMap((group) =>
    group.reports.map((report) => ({ ...report, groupId: group.id, groupTitle: group.title })))
    .find((report) => report.id === reportId);
}

function isDailyReport(report) {
  return report?.id?.includes('diario') || report?.id?.includes('dia');
}

function Relatorios() {
  const { hasPermission, user } = useAuth();
  const operation = useOperation();
  const canExport = hasPermission('relatorios.exportar');
  const [selectedReportId, setSelectedReportId] = useState(getFirstReportId);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const selectedDefinition = findReportDefinition(selectedReportId);
  const data = useMemo(() => ({
    clients,
    stockRows: stockItems,
    sales: financeProductSales,
    losses: financeLosses,
    expenses: financeExpenses,
    otherRevenues: financeOtherRevenues,
    documents: reportDocuments,
    invoices,
    operationState: operation,
  }), [operation]);
  const report = useMemo(() => buildReportData(selectedReportId, data, filters), [data, filters, selectedReportId]);

  function updateFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  function resetFilters() {
    setFilters(DEFAULT_FILTERS);
    setNotice('');
  }

  function openPreview() {
    setPreviewOpen(true);
  }

  function handlePrint() {
    setPreviewOpen(true);
    window.setTimeout(() => window.print(), 0);
  }

  function handleSavePdf() {
    setPreviewOpen(true);
    window.setTimeout(() => window.print(), 0);
  }

  function exportExcel() {
    const csv = buildReportCsv(report);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${report.id}-${filters.startDate}-${filters.endDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice('Relatorio exportado para Excel.');
  }

  return (
    <section className="standard-screen reports-screen report-center">
      <div className="report-workbar panel">
        <label className="compact-search report-search">
          <Search size={17} />
          <input
            value={filters.query}
            onChange={(event) => updateFilter('query', event.target.value)}
            placeholder="Pesquisar no relatorio"
          />
        </label>
        <label>
          <CalendarDays size={17} />
          <input type="date" value={filters.startDate} onChange={(event) => updateFilter('startDate', event.target.value)} />
        </label>
        <input type="date" value={filters.endDate} onChange={(event) => updateFilter('endDate', event.target.value)} aria-label="Data final" />
        {isDailyReport(selectedDefinition) ? (
          <input type="date" value={filters.date} onChange={(event) => updateFilter('date', event.target.value)} aria-label="Data diaria" />
        ) : null}
        {selectedDefinition?.mode === 'comparison' ? (
          <>
            <input type="date" value={filters.compareStartDate} onChange={(event) => updateFilter('compareStartDate', event.target.value)} aria-label="Data comparada inicial" />
            <input type="date" value={filters.compareEndDate} onChange={(event) => updateFilter('compareEndDate', event.target.value)} aria-label="Data comparada final" />
          </>
        ) : null}
        <select value={filters.shift} onChange={(event) => updateFilter('shift', event.target.value)} aria-label="Turno">
          <option>Todos</option>
          <option>Manha</option>
          <option>Tarde</option>
          <option>Noite</option>
        </select>
        <select value={filters.paymentMethod} onChange={(event) => updateFilter('paymentMethod', event.target.value)} aria-label="Forma de pagamento">
          <option value="">Todos pagamentos</option>
          <option>Dinheiro</option>
          <option>TPA</option>
          <option>Transferencia</option>
          <option>Credito</option>
        </select>
        <button type="button" className="soft-button" onClick={resetFilters}><RefreshCcw size={17} /> Limpar</button>
      </div>

      {notice ? <p className="form-error documents-notice" role="status">{notice}</p> : null}

      <div className="report-center-layout">
        <aside className="panel report-catalog">
          {REPORT_CATALOG.map((group) => (
            <section key={group.id}>
              <h2>{group.title}</h2>
              {group.reports.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={item.id === selectedReportId ? 'active' : ''}
                  onClick={() => {
                    setSelectedReportId(item.id);
                    setNotice('');
                  }}
                >
                  <span>{item.title}</span>
                  <small>{item.mode === 'comparison' ? 'Comparativo' : isDailyReport(item) ? 'Diario' : 'Periodo'}</small>
                </button>
              ))}
            </section>
          ))}
        </aside>

        <main className="report-result">
          <div className="panel report-result-header">
            <div>
              <span>{selectedDefinition?.groupTitle}</span>
              <h2>{report.title}</h2>
              <p>{resolveReportDescription(report)}</p>
            </div>
            <div className="report-actions">
              <button type="button" className="soft-button" onClick={openPreview}><FileBarChart size={17} /> Visualizar</button>
              {canExport ? (
                <>
                  <button type="button" className="icon-button" aria-label="Exportar Excel" title="Exportar Excel" onClick={exportExcel}>
                    <Download size={19} />
                  </button>
                  <button type="button" className="icon-button" aria-label="Salvar PDF" title="Salvar PDF" onClick={handleSavePdf}>
                    <FileDown size={19} />
                  </button>
                  <button type="button" className="icon-button" aria-label="Imprimir relatorio" title="Imprimir" onClick={handlePrint}>
                    <Printer size={19} />
                  </button>
                </>
              ) : null}
            </div>
          </div>

          <div className="standard-metrics report-summary-metrics">
            {report.kpis.map((item) => (
              <Metric key={item.key || item.label} label={item.label} value={formatReportCell(item.value, item.type)} />
            ))}
          </div>

          {report.comparison ? (
            <div className="panel report-comparison-strip">
              {Object.entries(report.comparison).map(([key, value]) => (
                <span key={key}>{key}: {formatReportCell(value)}</span>
              ))}
            </div>
          ) : null}

          <div className="panel table-panel report-table-panel">
            <table>
              <thead>
                <tr>
                  {report.columns.map((column) => <th key={column.key}>{column.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row, index) => (
                  <tr key={`${report.id}-${index}`}>
                    {report.columns.map((column) => (
                      <td key={column.key}>{formatReportCell(row[column.key], column.type)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {!report.rows.length ? (
              <div className="empty-state">
                <FileBarChart size={28} />
                <strong>Sem dados para os filtros selecionados</strong>
              </div>
            ) : null}
          </div>
        </main>
      </div>

      {previewOpen ? (
        <ReportPreview report={report} userName={getUserName(user)} onClose={() => setPreviewOpen(false)} />
      ) : null}
    </section>
  );
}

function Metric({ label, value }) {
  return (
    <div className="standard-metric blue">
      <span><FileBarChart size={30} /></span>
      <div>
        <h2>{label}</h2>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function resolveReportDescription(report) {
  if (report.mode === 'comparison') return 'Comparacao de valores entre as datas selecionadas.';
  if (report.groupId === 'vendas') return 'Vendas filtradas por periodo, turno e forma de pagamento.';
  if (report.groupId === 'financeiro') return 'Resumo financeiro do periodo selecionado.';
  if (report.groupId === 'stock') return 'Estado do stock conforme os filtros atuais.';
  if (report.groupId === 'documentos') return 'Documentos comerciais emitidos no periodo.';
  if (report.groupId === 'operacao') return 'Estado operacional do dia e do turno.';
  return 'Resumo executivo com indicadores essenciais.';
}

function formatReportCell(value, type) {
  if (type === 'money') return formatKwanza(value);
  if (typeof value === 'number' && Math.abs(value) >= 1000) return formatKwanza(value);
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Nao';
  return String(value);
}

function ReportPreview({ report, userName, onClose }) {
  function handlePrintA4() {
    window.setTimeout(() => window.print(), 0);
  }

  function handleSavePdf() {
    window.setTimeout(() => window.print(), 0);
  }

  return (
    <div className="modal-backdrop reports-print-scope" role="dialog" aria-modal="true">
      <div className="modal-card wide report-preview-modal">
        <div className="modal-title-row">
          <h2>{report.title}</h2>
          <div className="invoice-a4-actions">
            <button type="button" className="icon-button" aria-label="Salvar PDF" title="Salvar PDF" onClick={handleSavePdf}>
              <FileDown size={20} />
            </button>
            <button type="button" className="icon-button" aria-label="Imprimir relatorio" title="Imprimir" onClick={handlePrintA4}>
              <Printer size={20} />
            </button>
            <button type="button" className="icon-button" aria-label="Fechar visualizacao" onClick={onClose}>x</button>
          </div>
        </div>
        <ReportA4
          report={report}
          branding={getStoredBranding()}
          settings={getStoredInvoiceA4Settings()}
          printedBy={userName}
        />
      </div>
    </div>
  );
}

export default Relatorios;
