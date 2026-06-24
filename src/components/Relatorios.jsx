import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Download,
  FileBarChart,
  FileDown,
  Loader2,
  Printer,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { documents as reportDocuments } from '../data/documents.mjs';
import { buildDocumentSettingsFromSnapshot } from '../data/invoiceA4.mjs';
import { useSettings } from '../configuration/SettingsContext';
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
import { request } from '../services/ipcClient.js';
import ReportA4 from './ReportA4';

const TODAY = new Date().toISOString().slice(0, 10);
const MONTH_START = `${TODAY.slice(0, 7)}-01`;

const DEFAULT_FILTERS = {
  startDate: MONTH_START,
  endDate: TODAY,
  daysAhead: '90',
  limit: '50',
  orderStatus: '',
};

const ORDER_STATUS_OPTIONS = [
  { value: '', label: 'Todos os estados' },
  { value: 'RASCUNHO', label: 'Rascunho' },
  { value: 'ENVIADA', label: 'Enviada' },
  { value: 'PARCIALMENTE_RECEBIDA', label: 'Parcialmente recebida' },
  { value: 'RECEBIDA', label: 'Recebida' },
  { value: 'CANCELADA', label: 'Cancelada' },
];

const BACKEND_REPORT_META = {
  'abc-produtos': {
    kpiKeys: [],
    columns: [
      { key: 'posicao', label: '#' },
      { key: 'produto', label: 'Produto' },
      { key: 'categoria', label: 'Categoria' },
      { key: 'unidades', label: 'Unidades', type: 'number' },
      { key: 'receita', label: 'Receita (KZ)', type: 'money' },
      { key: 'pct_receita', label: '% Receita' },
      { key: 'pct_acumulado', label: '% Acumulado' },
      { key: 'classe', label: 'Classe ABC' },
    ],
  },
  'validades-proximas': {
    columns: [
      { key: 'produto', label: 'Produto' },
      { key: 'categoria', label: 'Categoria' },
      { key: 'lote', label: 'Lote' },
      { key: 'data_validade', label: 'Validade' },
      { key: 'dias_restantes', label: 'Dias restantes', type: 'number' },
      { key: 'quantidade', label: 'Quantidade', type: 'number' },
      { key: 'urgencia', label: 'Urgência' },
    ],
  },
  'stock-valorizado': {
    columns: [
      { key: 'produto', label: 'Produto' },
      { key: 'categoria', label: 'Categoria' },
      { key: 'unidades', label: 'Unidades', type: 'number' },
      { key: 'preco_venda', label: 'Preço venda (KZ)', type: 'money' },
      { key: 'valor_custo', label: 'Valor custo (KZ)', type: 'money' },
      { key: 'valor_venda', label: 'Valor venda (KZ)', type: 'money' },
      { key: 'margem', label: 'Margem %' },
    ],
  },
  'encomendas-resumo': {
    columns: [
      { key: 'numero', label: 'Número' },
      { key: 'fornecedor', label: 'Fornecedor' },
      { key: 'status', label: 'Estado' },
      { key: 'data_emissao', label: 'Emissão' },
      { key: 'data_entrega', label: 'Entrega prev.' },
      { key: 'itens', label: 'Itens', type: 'number' },
      { key: 'total', label: 'Total (KZ)', type: 'money' },
      { key: 'pendente', label: 'Pend.', type: 'number' },
    ],
  },
  'fornecedores-resumo': {
    columns: [
      { key: 'fornecedor', label: 'Fornecedor' },
      { key: 'nif', label: 'NIF' },
      { key: 'telefone', label: 'Telefone' },
      { key: 'estado', label: 'Estado' },
      { key: 'encomendas', label: 'Encomendas', type: 'number' },
      { key: 'total_comprado', label: 'Total comprado (KZ)', type: 'money' },
      { key: 'ultima_encomenda', label: 'Última encomenda' },
    ],
  },
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

function resolveReportDescription(report) {
  if (!report?.filters) return '';
  return `Operacoes de ${report.filters.startDate} ate ${report.filters.endDate}.`;
}

function formatReportCell(value, type) {
  if (type === 'money') return formatKwanza(value);
  if (typeof value === 'number' && Math.abs(value) >= 1000 && type !== 'number') return formatKwanza(value);
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Nao';
  return String(value);
}

function buildBackendKpis(reportId, rows) {
  if (reportId === 'abc-produtos') {
    const totalReceita = rows.reduce((s, r) => s + Number(r.receita || 0), 0);
    const countA = rows.filter((r) => r.classe === 'A').length;
    return [
      { label: 'Receita total', value: formatKwanza(totalReceita) },
      { label: 'Produtos classe A', value: countA },
      { label: 'Total produtos', value: rows.length },
    ];
  }
  if (reportId === 'validades-proximas') {
    const criticos = rows.filter((r) => r.urgencia === 'CRITICO').length;
    return [
      { label: 'Lotes críticos (≤30 dias)', value: criticos },
      { label: 'Total lotes', value: rows.length },
    ];
  }
  if (reportId === 'stock-valorizado') {
    const totalCusto = rows.reduce((s, r) => s + Number(r.valor_custo || 0), 0);
    const totalVenda = rows.reduce((s, r) => s + Number(r.valor_venda || 0), 0);
    return [
      { label: 'Valor total (custo)', value: formatKwanza(totalCusto) },
      { label: 'Valor total (venda)', value: formatKwanza(totalVenda) },
    ];
  }
  if (reportId === 'encomendas-resumo') {
    const totalVal = rows.reduce((s, r) => s + Number(r.total || 0), 0);
    return [
      { label: 'Encomendas', value: rows.length },
      { label: 'Valor total', value: formatKwanza(totalVal) },
    ];
  }
  if (reportId === 'fornecedores-resumo') {
    const ativos = rows.filter((r) => r.estado === 'Activo').length;
    const totalComprado = rows.reduce((s, r) => s + Number(r.total_comprado || 0), 0);
    return [
      { label: 'Fornecedores activos', value: ativos },
      { label: 'Total comprado', value: formatKwanza(totalComprado) },
    ];
  }
  return [];
}

function Relatorios() {
  const { snapshot } = useSettings();
  const documentSettings = buildDocumentSettingsFromSnapshot(snapshot);
  const { hasPermission, user } = useAuth();
  const operation = useOperation();
  const canExport = hasPermission('relatorios.exportar');
  const [selectedReportId, setSelectedReportId] = useState(getFirstReportId);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [notice, setNotice] = useState('');

  // Backend advanced reports
  const [backendRows, setBackendRows] = useState(null);
  const [backendLoading, setBackendLoading] = useState(false);
  const [backendError, setBackendError] = useState('');

  const selectedDefinition = findReportDefinition(selectedReportId);
  const isBackendReport = Boolean(selectedDefinition?.backend);

  const mockData = useMemo(() => ({
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

  const mockReport = useMemo(
    () => isBackendReport ? null : buildReportData(selectedReportId, mockData, filters),
    [selectedReportId, mockData, filters, isBackendReport],
  );

  const backendMeta = BACKEND_REPORT_META[selectedReportId];

  const backendReport = useMemo(() => {
    if (!isBackendReport || !backendRows) return null;
    const rows = backendRows;
    const meta = backendMeta || { columns: [] };
    return {
      id: selectedReportId,
      title: selectedDefinition?.title || '',
      filters,
      kpis: buildBackendKpis(selectedReportId, rows),
      columns: meta.columns,
      rows,
    };
  }, [isBackendReport, backendRows, selectedReportId, filters, selectedDefinition, backendMeta]);

  const report = isBackendReport ? backendReport : mockReport;

  function loadBackendReport() {
    if (!isBackendReport) return;
    setBackendLoading(true);
    setBackendError('');
    request('relatorio.data', { reportId: selectedReportId, filters })
      .then((rows) => setBackendRows(rows))
      .catch((e) => setBackendError(e.message || 'Erro ao carregar relatório.'))
      .finally(() => setBackendLoading(false));
  }

  useEffect(() => {
    if (!isBackendReport) { setBackendRows(null); return; }
    loadBackendReport();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedReportId, isBackendReport]);

  function updateFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  function exportCsv() {
    const target = report;
    if (!target) return;
    const csv = isBackendReport ? buildBackendCsv(target) : buildReportCsv(target);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${selectedReportId}-${TODAY}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice('Relatório exportado.');
  }

  function buildBackendCsv(r) {
    const header = r.columns.map((c) => c.label).join(';');
    const body = r.rows.map((row) =>
      r.columns.map((c) => String(row[c.key] ?? '')).join(';'),
    );
    return `﻿${[header, ...body].join('\n')}`;
  }

  const extraFilters = selectedDefinition?.extraFilters || [];
  const showDateRange = !isBackendReport || extraFilters.includes('dateRange');

  return (
    <section className="standard-screen reports-screen report-center">
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
                    setBackendRows(null);
                    setBackendError('');
                  }}
                >
                  <span>{item.title}</span>
                  {item.backend ? <small>Dados reais</small> : <small>Período</small>}
                </button>
              ))}
            </section>
          ))}
        </aside>

        <main className="report-result">
          <div className="panel report-result-header">
            <div className="report-header-top">
              <div>
                <span className="report-group-label">{selectedDefinition?.groupTitle}</span>
                <h2>{selectedDefinition?.title}</h2>
                {!isBackendReport ? <p className="report-desc">{resolveReportDescription(report || {})}</p> : null}
              </div>
              <div className="report-actions">
                {isBackendReport ? (
                  <button type="button" className="soft-button" onClick={loadBackendReport} disabled={backendLoading}>
                    {backendLoading ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />} Actualizar
                  </button>
                ) : (
                  <button type="button" className="soft-button" onClick={() => setPreviewOpen(true)}>
                    <FileBarChart size={17} /> Visualizar
                  </button>
                )}
                {canExport ? (
                  <>
                    <button type="button" className="icon-button" aria-label="Exportar Excel" title="Exportar CSV/Excel" onClick={exportCsv}>
                      <Download size={19} />
                    </button>
                    {!isBackendReport ? (
                      <>
                        <button type="button" className="icon-button" aria-label="Salvar PDF" title="Salvar PDF" onClick={() => { setPreviewOpen(true); window.setTimeout(() => window.print(), 0); }}>
                          <FileDown size={19} />
                        </button>
                        <button type="button" className="icon-button" aria-label="Imprimir" title="Imprimir" onClick={() => { setPreviewOpen(true); window.setTimeout(() => window.print(), 0); }}>
                          <Printer size={19} />
                        </button>
                      </>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>

            {/* Filter form — form-grid pattern, same as Estoque */}
            <div className="report-period-control">
            <div className="form-grid report-filter-grid">
              {showDateRange ? (
                <>
                  <label>
                    <span>Data inicial</span>
                    <input
                      aria-label="Data inicial"
                      type="date"
                      value={filters.startDate}
                      onChange={(e) => updateFilter('startDate', e.target.value)}
                    />
                  </label>
                  <label>
                    <span>Data final</span>
                    <input
                      aria-label="Data final"
                      type="date"
                      value={filters.endDate}
                      onChange={(e) => updateFilter('endDate', e.target.value)}
                    />
                  </label>
                </>
              ) : null}

              {extraFilters.includes('daysAhead') ? (
                <label>
                  <span>Vencer em (dias)</span>
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={filters.daysAhead}
                    onChange={(e) => updateFilter('daysAhead', e.target.value)}
                  />
                </label>
              ) : null}

              {extraFilters.includes('limit') ? (
                <label>
                  <span>Máx. resultados</span>
                  <input
                    type="number"
                    min="10"
                    max="500"
                    step="10"
                    value={filters.limit}
                    onChange={(e) => updateFilter('limit', e.target.value)}
                  />
                </label>
              ) : null}

              {extraFilters.includes('orderStatus') ? (
                <label>
                  <span>Estado</span>
                  <select value={filters.orderStatus} onChange={(e) => updateFilter('orderStatus', e.target.value)}>
                    {ORDER_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
              ) : null}
            </div>
            </div>{/* /report-period-control */}
          </div>

          {/* KPI strip */}
          {report?.kpis?.length ? (
            <div className="standard-metrics report-summary-metrics">
              {report.kpis.map((item) => (
                <Metric key={item.key || item.label} label={item.label} value={typeof item.value === 'number' ? formatReportCell(item.value, 'number') : item.value} />
              ))}
            </div>
          ) : null}

          {/* Error */}
          {backendError ? (
            <div className="empty-state">
              <AlertTriangle size={24} />
              <strong>{backendError}</strong>
            </div>
          ) : null}

          {/* Loading */}
          {backendLoading ? (
            <div className="empty-state"><Loader2 size={28} className="spin" /><strong>A carregar dados…</strong></div>
          ) : (
            <div className="panel table-panel report-table-panel">
              <table>
                <thead>
                  <tr>
                    {(report?.columns || []).map((column) => <th key={column.key}>{column.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {(report?.rows || []).map((row, index) => (
                    <tr key={`${selectedReportId}-${index}`}>
                      {(report?.columns || []).map((column) => (
                        <td key={column.key}>{formatReportCell(row[column.key], column.type)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {!report?.rows?.length && !backendLoading ? (
                <div className="empty-state">
                  <FileBarChart size={28} />
                  <strong>Sem dados para os filtros seleccionados</strong>
                </div>
              ) : null}
            </div>
          )}
        </main>
      </div>

      {previewOpen && report ? (
        <ReportPreview report={report} documentSettings={documentSettings} userName={getUserName(user)} onClose={() => setPreviewOpen(false)} />
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

function ReportPreview({ report, documentSettings, userName, onClose }) {
  return (
    <div className="modal-backdrop reports-print-scope" role="dialog" aria-modal="true">
      <div className="modal-card wide report-preview-modal">
        <div className="modal-title-row">
          <h2>{report.title}</h2>
          <div className="invoice-a4-actions">
            <button type="button" className="icon-button" aria-label="Salvar PDF" title="Salvar PDF" onClick={() => window.setTimeout(() => window.print(), 0)}>
              <FileDown size={20} />
            </button>
            <button type="button" className="icon-button" aria-label="Imprimir" title="Imprimir" onClick={() => window.setTimeout(() => window.print(), 0)}>
              <Printer size={20} />
            </button>
            <button type="button" className="icon-button" aria-label="Fechar" onClick={onClose}>×</button>
          </div>
        </div>
        <ReportA4
          report={report}
          branding={documentSettings.branding}
          settings={documentSettings.settings}
          printedBy={userName}
        />
      </div>
    </div>
  );
}

export default Relatorios;
