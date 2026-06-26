import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
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
import { buildDocumentSettingsFromSnapshot } from '../data/invoiceA4.mjs';
import { useSettings } from '../configuration/SettingsContext';
import {
  REPORT_CATALOG,
  buildReportData,
} from '../data/reports.mjs';
import { formatKwanza } from '../data/pharmacyData.mjs';
import { useOperation } from '../operation/OperationContext';
import { request } from '../services/ipcClient.js';
import ReportA4 from './ReportA4';

const TODAY = new Date().toISOString().slice(0, 10);
const MONTH_START = `${TODAY.slice(0, 7)}-01`;
const EMPTY_REAL_DATA = { sales: [], losses: [], expenses: [], otherRevenues: [], clients: [], stockRows: [], documents: [] };

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
  'resumo-executivo': {
    columns: [
      { key: 'metrica', label: 'Indicador' },
      { key: 'valor', label: 'Valor' },
    ],
  },
  'relatorio-diario': {
    columns: [
      { key: 'data', label: 'Data' },
      { key: 'facturas', label: 'Facturas', type: 'number' },
      { key: 'clientes', label: 'Clientes', type: 'number' },
      { key: 'unidades_vendidas', label: 'Unidades', type: 'number' },
      { key: 'descontos', label: 'Descontos (KZ)', type: 'money' },
      { key: 'total_vendas', label: 'Total vendas (KZ)', type: 'money' },
    ],
  },
  'vendas-detalhadas': {
    columns: [
      { key: 'numero', label: 'Nº Factura' },
      { key: 'data', label: 'Data' },
      { key: 'cliente', label: 'Cliente' },
      { key: 'produto', label: 'Produto' },
      { key: 'categoria', label: 'Categoria' },
      { key: 'quantidade', label: 'Qtd.', type: 'number' },
      { key: 'preco_unitario', label: 'Preço unit. (KZ)', type: 'money' },
      { key: 'subtotal', label: 'Subtotal (KZ)', type: 'money' },
      { key: 'pagamento', label: 'Pagamento' },
    ],
  },
  'demonstrativo-financeiro': {
    columns: [
      { key: 'data', label: 'Data' },
      { key: 'facturas', label: 'Facturas', type: 'number' },
      { key: 'receita_bruta', label: 'Receita bruta (KZ)', type: 'money' },
      { key: 'descontos', label: 'Descontos (KZ)', type: 'money' },
      { key: 'receita_liquida', label: 'Receita líquida (KZ)', type: 'money' },
    ],
  },
  'stock-baixo': {
    columns: [
      { key: 'produto', label: 'Produto' },
      { key: 'categoria', label: 'Categoria' },
      { key: 'codigo', label: 'Código' },
      { key: 'stock_atual', label: 'Stock actual', type: 'number' },
      { key: 'estoque_minimo', label: 'Mínimo', type: 'number' },
      { key: 'diferenca', label: 'Em falta', type: 'number' },
      { key: 'situacao', label: 'Situação' },
    ],
  },
  'clientes-credito-aberto': {
    columns: [
      { key: 'cliente', label: 'Cliente' },
      { key: 'nif', label: 'NIF' },
      { key: 'telefone', label: 'Telefone' },
      { key: 'limite_credito', label: 'Limite crédito (KZ)', type: 'money' },
      { key: 'total_compras', label: 'Compras', type: 'number' },
      { key: 'total_gasto', label: 'Total gasto (KZ)', type: 'money' },
      { key: 'ultima_compra', label: 'Última compra' },
    ],
  },
  'documentos-emitidos': {
    columns: [
      { key: 'numero', label: 'Nº Documento' },
      { key: 'tipo', label: 'Tipo' },
      { key: 'data', label: 'Data' },
      { key: 'cliente', label: 'Cliente' },
      { key: 'pagamento', label: 'Pagamento' },
      { key: 'desconto', label: 'Desconto (KZ)', type: 'money' },
      { key: 'total', label: 'Total (KZ)', type: 'money' },
      { key: 'status', label: 'Estado' },
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
  if (reportId === 'relatorio-diario') {
    const totalVendas = rows.reduce((s, r) => s + Number(r.total_vendas || 0), 0);
    const totalFacturas = rows.reduce((s, r) => s + Number(r.facturas || 0), 0);
    return [
      { label: 'Dias com vendas', value: rows.length },
      { label: 'Facturas emitidas', value: totalFacturas },
      { label: 'Total vendas', value: formatKwanza(totalVendas) },
    ];
  }
  if (reportId === 'vendas-detalhadas') {
    const total = rows.reduce((s, r) => s + Number(r.subtotal || 0), 0);
    return [
      { label: 'Linhas de venda', value: rows.length },
      { label: 'Total vendido (KZ)', value: formatKwanza(total) },
    ];
  }
  if (reportId === 'demonstrativo-financeiro') {
    const receita = rows.reduce((s, r) => s + Number(r.receita_bruta || 0), 0);
    const liquida = rows.reduce((s, r) => s + Number(r.receita_liquida || 0), 0);
    return [
      { label: 'Receita bruta', value: formatKwanza(receita) },
      { label: 'Receita líquida', value: formatKwanza(liquida) },
    ];
  }
  if (reportId === 'stock-baixo') {
    const semStock = rows.filter((r) => r.stock_atual === 0).length;
    return [
      { label: 'Produtos com alerta', value: rows.length },
      { label: 'Sem stock', value: semStock },
    ];
  }
  if (reportId === 'clientes-credito-aberto') {
    const totalGasto = rows.reduce((s, r) => s + Number(r.total_gasto || 0), 0);
    return [
      { label: 'Clientes activos', value: rows.length },
      { label: 'Total em compras', value: formatKwanza(totalGasto) },
    ];
  }
  if (reportId === 'documentos-emitidos') {
    const total = rows.reduce((s, r) => s + Number(r.total || 0), 0);
    return [
      { label: 'Documentos emitidos', value: rows.length },
      { label: 'Valor total', value: formatKwanza(total) },
    ];
  }
  return [];
}

const REPORT_PAGE_SIZE = 50;

function buildPaginationRange(current, total) {
  if (total <= 9) return Array.from({ length: total }, (_, i) => i + 1);
  const delta = 2;
  const range = new Set([1, total]);
  for (let i = Math.max(2, current - delta); i <= Math.min(total - 1, current + delta); i++) range.add(i);
  const sorted = Array.from(range).sort((a, b) => a - b);
  const result = [];
  let prev = 0;
  for (const page of sorted) {
    if (page - prev > 1) result.push('…');
    result.push(page);
    prev = page;
  }
  return result;
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
  const [reportPage, setReportPage] = useState(1);
  const [reportPageSize, setReportPageSize] = useState(50);

  // Backend advanced reports
  const [backendRows, setBackendRows] = useState(null);
  const [backendLoading, setBackendLoading] = useState(false);
  const [backendError, setBackendError] = useState('');

  // Real data for local (non-backend) reports
  const [realData, setRealData] = useState(EMPTY_REAL_DATA);
  const [rawDataLoading, setRawDataLoading] = useState(false);

  const selectedDefinition = findReportDefinition(selectedReportId);
  const isBackendReport = Boolean(selectedDefinition?.backend);

  const loadRawData = useCallback(async (startDate, endDate) => {
    setRawDataLoading(true);
    try {
      const data = await request('relatorio.rawData', { startDate, endDate });
      setRealData(data);
    } catch (err) {
      console.error('Erro ao carregar dados do relatório:', err);
    } finally {
      setRawDataLoading(false);
    }
  }, []);

  const reportInputData = useMemo(() => ({
    ...realData,
    operationState: operation,
  }), [realData, operation]);

  const localReport = useMemo(
    () => isBackendReport ? null : buildReportData(selectedReportId, reportInputData, filters),
    [selectedReportId, reportInputData, filters, isBackendReport],
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
      generatedAt: new Date().toLocaleString('pt-AO'),
    };
  }, [isBackendReport, backendRows, selectedReportId, filters, selectedDefinition, backendMeta]);

  const report = isBackendReport ? backendReport : localReport;

  function loadBackendReport() {
    if (!isBackendReport) return;
    setBackendLoading(true);
    setBackendError('');
    setReportPage(1);
    request('relatorio.data', { reportId: selectedReportId, filters })
      .then((rows) => setBackendRows(rows))
      .catch((e) => setBackendError(e.message || 'Erro ao carregar relatório.'))
      .finally(() => setBackendLoading(false));
  }

  useEffect(() => {
    if (!isBackendReport) { setBackendRows(null); return; }
    loadBackendReport();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedReportId, isBackendReport, filters.startDate, filters.endDate, filters.daysAhead, filters.limit, filters.orderStatus]);

  useEffect(() => {
    if (isBackendReport) { setRealData(EMPTY_REAL_DATA); return; }
    loadRawData(filters.startDate, filters.endDate);
  }, [isBackendReport, filters.startDate, filters.endDate, loadRawData]);

  function updateFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  function exportXlsx() {
    const target = report;
    if (!target) return;
    const headers = target.columns.map((c) => c.label);
    const rows = target.rows.map((row) =>
      target.columns.map((c) => {
        const val = row[c.key];
        return val === null || val === undefined ? '' : val;
      }),
    );
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, (target.title || 'Relatorio').slice(0, 31));
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${selectedReportId}-${TODAY}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice('Relatório exportado (XLSX).');
  }

  const extraFilters = selectedDefinition?.extraFilters || [];
  const showDateRange = !isBackendReport || extraFilters.includes('dateRange');

  return (
    <section className="standard-screen reports-screen report-center">
      {notice ? <p className="form-success documents-notice" role="status">{notice}</p> : null}

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
                    setReportPage(1);
                    setReportPageSize(50);
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
                ) : null}
                <button type="button" className="soft-button" onClick={() => setPreviewOpen(true)} disabled={!report || backendLoading}>
                  <FileBarChart size={17} /> Visualizar
                </button>
                {canExport ? (
                  <>
                    <button type="button" className="icon-button" aria-label="Exportar XLSX" title="Exportar XLSX" onClick={exportXlsx} disabled={!report}>
                      <Download size={19} />
                    </button>
                    <button type="button" className="icon-button" aria-label="Salvar PDF" title="Salvar PDF" disabled={!report || backendLoading}
                      onClick={() => { setPreviewOpen(true); window.setTimeout(() => window.print(), 0); }}>
                      <FileDown size={19} />
                    </button>
                    <button type="button" className="icon-button" aria-label="Imprimir" title="Imprimir" disabled={!report || backendLoading}
                      onClick={() => { setPreviewOpen(true); window.setTimeout(() => window.print(), 0); }}>
                      <Printer size={19} />
                    </button>
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
          {(backendLoading || rawDataLoading) ? (
            <div className="empty-state"><Loader2 size={28} className="spin" /><strong>A carregar dados…</strong></div>
          ) : (() => {
            const allRows = report?.rows || [];
            const totalPages = Math.max(1, Math.ceil(allRows.length / reportPageSize));
            const safePage = Math.min(reportPage, totalPages);
            const pageRows = allRows.slice((safePage - 1) * reportPageSize, safePage * reportPageSize);
            const paginationRange = buildPaginationRange(safePage, totalPages);
            const showPagination = totalPages > 1;
            return (
              <div className="panel table-panel report-table-panel">
                <table>
                  <thead>
                    <tr>
                      {(report?.columns || []).map((column) => <th key={column.key}>{column.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((row, index) => (
                      <tr key={`${selectedReportId}-${(safePage - 1) * reportPageSize + index}`}>
                        {(report?.columns || []).map((column) => (
                          <td key={column.key}>{formatReportCell(row[column.key], column.type)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!allRows.length ? (
                  <div className="empty-state">
                    <FileBarChart size={28} />
                    <strong>Sem dados para os filtros seleccionados</strong>
                  </div>
                ) : null}
                <div className="report-table-footer">
                  {allRows.length > 0 ? (
                    <span className="report-row-count">{allRows.length} resultado{allRows.length !== 1 ? 's' : ''}</span>
                  ) : null}
                  <label className="report-pagesize-label">
                    Mostrar
                    <select
                      value={reportPageSize}
                      onChange={(e) => { setReportPageSize(Number(e.target.value)); setReportPage(1); }}
                    >
                      {[25, 50, 100, 200].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                    por página
                  </label>
                  {showPagination ? (
                    <div className="pagination report-pagination">
                      <button onClick={() => setReportPage((p) => Math.max(1, p - 1))} disabled={safePage === 1}>‹</button>
                      {paginationRange.map((item, i) =>
                        item === '…'
                          ? <span key={`ellipsis-${i}`} className="pagination-ellipsis">…</span>
                          : <button key={item} className={item === safePage ? 'active' : ''} onClick={() => setReportPage(item)}>{item}</button>,
                      )}
                      <button onClick={() => setReportPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}>›</button>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })()}
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
