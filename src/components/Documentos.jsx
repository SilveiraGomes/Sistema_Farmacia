import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Ban,
  Download,
  Eye,
  FileDown,
  FileText,
  Printer,
  RefreshCcw,
  Repeat2,
  RotateCcw,
  Search,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import {
  canCancelDocument,
  DOCUMENT_STATUSES,
  DOCUMENT_TYPES,
  buildDocumentMetrics,
  documentStatusLabels,
  documentTypeLabels,
  filterDocuments,
  prepareSecondCopy,
} from '../data/documents.mjs';
import CancellationModal from './CancellationModal';
import { buildDocumentSettingsFromSnapshot, buildInvoiceA4ViewModel } from '../data/invoiceA4.mjs';
import { CATALOG_KEYS } from '../configuration/catalogKeys.mjs';
import { useCatalog, useSettings } from '../configuration/SettingsContext';
import { formatKwanza } from '../data/pharmacyData.mjs';
import { confirmSensitiveAction } from '../utils/confirmations.mjs';
import { request } from '../services/ipcClient.js';
import InvoiceA4 from './InvoiceA4';

function currentMonthRange() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
  return { dateFrom: `${y}-${m}-01`, dateTo: `${y}-${m}-${lastDay}` };
}

const EMPTY_FILTERS = {
  query: '',
  type: '',
  status: '',
  ...currentMonthRange(),
};

function getDisplayUserName(user) {
  return user?.nome_completo || user?.nome_usuario || 'Usuario';
}

function Documentos() {
  const { snapshot } = useSettings();
  const documentTypes = useCatalog(CATALOG_KEYS.DOCUMENT_TYPES);
  const documentStatuses = useCatalog(CATALOG_KEYS.DOCUMENT_STATUSES);
  const { hasPermission, user } = useAuth();
  const canPrint = hasPermission('documentos.imprimir');
  const canExport = hasPermission('documentos.exportar');
  const canAnnul = hasPermission('documentos.anular');
  const canConvert = hasPermission('documentos.converter');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [message, setMessage] = useState('');

  const loadDocuments = useCallback(async (dateFrom, dateTo) => {
    setLoading(true);
    try {
      const data = await request('vendas.listDocuments', { dateFrom, dateTo });
      setRows(data);
    } catch (err) {
      console.error('Erro ao carregar documentos:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const { dateFrom, dateTo } = currentMonthRange();
    loadDocuments(dateFrom, dateTo);
  }, [loadDocuments]);

  const visibleRows = useMemo(() => filterDocuments(rows, filters), [filters, rows]);
  const metrics = useMemo(() => buildDocumentMetrics(rows, filters), [filters, rows]);

  function updateFilter(field, value) {
    setFilters((current) => {
      const next = { ...current, [field]: value };
      if (field === 'dateFrom' || field === 'dateTo') {
        loadDocuments(next.dateFrom, next.dateTo);
      }
      return next;
    });
  }

  function resetFilters() {
    const range = currentMonthRange();
    setFilters({ ...EMPTY_FILTERS, ...range });
    loadDocuments(range.dateFrom, range.dateTo);
  }

  function openDocument(document) {
    setSelectedDocument(document);
  }

  function printSecondCopy(document) {
    setSelectedDocument({ ...document, copyLabel: '2a VIA' });
    setMessage(`2a VIA preparada para ${document.number}.`);
  }

  function exportDocument(document) {
    setMessage(`Documento ${document.number} preparado para exportacao.`);
  }

  async function handleCancelDocument(reason) {
    const document = cancelTarget;
    if (!document || !canCancelDocument(document)) return;

    try {
      const ncCount = rows.filter((d) => d.type === 'NOTA_CREDITO').length + 1;
      const year = String(new Date().getFullYear()).slice(-2);
      const fallbackNc = `NC${String(ncCount).padStart(3, '0')}/${year}`;
      const reservedNc = await request('configuration.document.reserveNumber', { documentType: 'nota_credito' }).catch(() => fallbackNc);

      const { cancelledDoc, creditNote } = await request('vendas.cancelDocument', {
        venda_id: document.vendaId,
        reason,
        creditNoteNumber: reservedNc,
      });

      setRows((current) => [
        creditNote,
        ...current.map((d) => d.vendaId === cancelledDoc.vendaId
          ? { ...d, status: 'ANULADO', cancelledAt: cancelledDoc.cancelledAt, cancelledBy: cancelledDoc.cancelledBy, cancellationReason: cancelledDoc.cancellationReason }
          : d),
      ]);
      setCancelTarget(null);
      setMessage(`${document.number} anulado. Nota de Crédito ${reservedNc} gerada.`);
    } catch (err) {
      setMessage(err?.message || 'Erro ao anular documento.');
      setCancelTarget(null);
    }
  }

  async function convertDocument(document) {
    if (!(await confirmSensitiveAction(`Deseja converter ${document.number} em factura?`, undefined, {
      title: 'Confirmar conversao',
      confirmLabel: 'Converter',
      tone: 'success',
    }))) return;

    try {
      const invoiceNumber = await request('configuration.document.reserveNumber', { documentType: 'factura' });
      const updated = await request('vendas.convertProforma', {
        venda_id: document.vendaId,
        invoiceNumber,
      });
      setRows((current) => current.map((d) => d.vendaId === document.vendaId ? updated : d));
      setMessage(`${document.number} convertido em Factura ${invoiceNumber}.`);
    } catch (err) {
      setMessage(err?.message || 'Erro ao converter proforma.');
    }
  }

  return (
    <section className="standard-screen documents-screen">
      <div className="standard-metrics">
        <Metric title="Documentos Emitidos" value={metrics.issuedDocuments} icon={FileText} />
        <Metric title="Facturas Anuladas" value={metrics.cancelledInvoices} icon={Ban} />
        <Metric title="Proformas Pendentes" value={metrics.pendingProformas} icon={Repeat2} />
        <Metric title="Total Documentado" value={formatKwanza(metrics.periodTotal)} icon={Download} />
      </div>

      {message ? <p className="form-error documents-notice" role="status">{message}</p> : null}

      <div className="panel documents-filter-panel">
        <label className="compact-search documents-search">
          <Search size={17} />
          <input
            aria-label="Pesquisar documentos"
            placeholder="Numero, cliente, usuario ou tipo"
            value={filters.query}
            onChange={(event) => updateFilter('query', event.target.value)}
          />
        </label>
        <select value={filters.type} onChange={(event) => updateFilter('type', event.target.value)} aria-label="Tipo de documento">
          <option value="">Todos os tipos</option>
          {documentTypes.map((type) => (
            <option key={type.code} value={type.code.replaceAll('-', '_').toUpperCase()}>{type.name}</option>
          ))}
        </select>
        <select value={filters.status} onChange={(event) => updateFilter('status', event.target.value)} aria-label="Estado do documento">
          <option value="">Todos os estados</option>
          {documentStatuses.map((status) => (
            <option key={status.code} value={status.code.replaceAll('-', '_').toUpperCase()}>{status.name}</option>
          ))}
        </select>
        <input type="date" value={filters.dateFrom} onChange={(event) => updateFilter('dateFrom', event.target.value)} aria-label="Data inicial" />
        <input type="date" value={filters.dateTo} onChange={(event) => updateFilter('dateTo', event.target.value)} aria-label="Data final" />
        <button type="button" className="soft-button" onClick={resetFilters}>
          <RefreshCcw size={17} /> Limpar
        </button>
      </div>

      <div className="panel table-panel">
        <div className="panel-title-row">
          <h2>Central de Documentos</h2>
          <span className="documents-count">{visibleRows.length} documentos</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Numero</th>
              <th>Tipo</th>
              <th>Cliente</th>
              <th>Data</th>
              <th>Total</th>
              <th>Estado</th>
              <th>Usuario</th>
              <th>Opcoes</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((document) => (
              <tr key={document.id}>
                <td>{document.number}</td>
                <td>{documentTypeLabels[document.type]}</td>
                <td>{document.clientName}</td>
                <td>{document.issueDate}</td>
                <td>{formatKwanza(document.total)}</td>
                <td>
                  <DocumentStatusBadge status={document.status} />
                </td>
                <td>{document.userName}</td>
                <td className="options-cell">
                  <button className="icon-button" type="button" aria-label="Ver detalhes" onClick={() => openDocument(document)}>
                    <Eye size={16} />
                  </button>
                  {canPrint ? (
                    <button className="icon-button" type="button" aria-label="Imprimir segunda via" onClick={() => printSecondCopy(document)}>
                      <Printer size={16} />
                    </button>
                  ) : null}
                  {canExport ? (
                    <button className="icon-button" type="button" aria-label="Exportar documento" onClick={() => exportDocument(document)}>
                      <Download size={16} />
                    </button>
                  ) : null}
                  {canConvert && document.type === DOCUMENT_TYPES.PROFORMA && document.status === DOCUMENT_STATUSES.PENDING ? (
                    <button className="icon-button" type="button" aria-label="Converter em factura" onClick={() => convertDocument(document)}>
                      <Repeat2 size={16} />
                    </button>
                  ) : null}
                  {canAnnul && canCancelDocument(document) ? (
                    <button className="icon-button danger" type="button" aria-label="Anular documento" onClick={() => { setMessage(''); setCancelTarget(document); }}>
                      <RotateCcw size={16} />
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!visibleRows.length ? (
          <div className="empty-state">
            <FileText size={28} />
            <strong>Nenhum documento encontrado</strong>
          </div>
        ) : null}
      </div>

      {selectedDocument ? (
        <DocumentDetails document={selectedDocument} snapshot={snapshot} onClose={() => setSelectedDocument(null)} />
      ) : null}

      {cancelTarget ? (
        <CancellationModal
          document={cancelTarget}
          onConfirm={handleCancelDocument}
          onClose={() => setCancelTarget(null)}
        />
      ) : null}
    </section>
  );
}

function DocumentDetails({ document, snapshot, onClose }) {
  const [printBusy, setPrintBusy] = React.useState(false);
  const documentSettings = buildDocumentSettingsFromSnapshot(snapshot);
  const viewModel = buildInvoiceA4ViewModel({
    document,
    ...documentSettings,
    printedBy: document.userName || 'Usuario',
  });

  async function handlePrintA4() {
    if (printBusy) return;
    setPrintBusy(true);
    try { await request('invoice.print', { viewModel }); } finally { setPrintBusy(false); }
  }

  async function handleSavePdf() {
    if (printBusy) return;
    setPrintBusy(true);
    try { await request('invoice.savePDF', { viewModel }); } finally { setPrintBusy(false); }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card wide document-detail-modal">
        <div className="modal-title-row">
          <div>
            <h2>{document.number}</h2>
            {document.copyLabel ? <span className="copy-label">{document.copyLabel}</span> : null}
          </div>
          <div className="invoice-a4-actions">
            <button type="button" className="icon-button" aria-label="Salvar PDF" title="Salvar PDF" onClick={handleSavePdf} disabled={printBusy}>
              <FileDown size={20} />
            </button>
            <button type="button" className="icon-button" aria-label="Imprimir factura" title="Imprimir" onClick={handlePrintA4} disabled={printBusy}>
              <Printer size={20} />
            </button>
            <button type="button" className="icon-button" aria-label="Fechar visualizacao" onClick={onClose}>x</button>
          </div>
        </div>
        <InvoiceA4 viewModel={viewModel} />
      </div>
    </div>
  );
}

const DOC_STATUS_CLASS = {
  [DOCUMENT_STATUSES.PAID]: 'paid',
  [DOCUMENT_STATUSES.ISSUED]: 'issued',
  [DOCUMENT_STATUSES.CANCELLED]: 'cancelled',
  [DOCUMENT_STATUSES.PENDING]: 'waiting',
  [DOCUMENT_STATUSES.DRAFT]: 'waiting',
  [DOCUMENT_STATUSES.CONVERTED]: 'issued',
};

function DocumentStatusBadge({ status }) {
  const cls = DOC_STATUS_CLASS[status] || 'issued';
  return <span className={`status ${cls}`}>{documentStatusLabels[status] || status}</span>;
}

function Metric({ title, value, icon: Icon }) {
  return (
    <div className="standard-metric blue">
      <span><Icon size={32} /></span>
      <div>
        <h2>{title}</h2>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

export default Documentos;
