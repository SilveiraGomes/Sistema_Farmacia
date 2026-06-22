import React, { useMemo, useState } from 'react';
import {
  Ban,
  Download,
  Eye,
  FileDown,
  FileText,
  Printer,
  RefreshCcw,
  Repeat2,
  Search,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import {
  DOCUMENT_STATUSES,
  DOCUMENT_TYPES,
  annulDocument,
  buildDocumentMetrics,
  convertProformaToInvoice,
  documentStatusLabels,
  documentTypeLabels,
  documents as initialDocuments,
  filterDocuments,
  prepareSecondCopy,
} from '../data/documents.mjs';
import { buildDocumentSettingsFromSnapshot, buildInvoiceA4ViewModel } from '../data/invoiceA4.mjs';
import { CATALOG_KEYS } from '../configuration/catalogKeys.mjs';
import { useCatalog, useSettings } from '../configuration/SettingsContext';
import { formatKwanza } from '../data/pharmacyData.mjs';
import { confirmSensitiveAction } from '../utils/confirmations.mjs';
import InvoiceA4 from './InvoiceA4';

const EMPTY_FILTERS = {
  query: '',
  type: '',
  status: '',
  dateFrom: '2026-06-01',
  dateTo: '2026-06-30',
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
  const [rows, setRows] = useState(initialDocuments);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [annulTargetId, setAnnulTargetId] = useState(null);
  const [annulReason, setAnnulReason] = useState('');
  const [message, setMessage] = useState('');

  const visibleRows = useMemo(() => filterDocuments(rows, filters), [filters, rows]);
  const metrics = useMemo(() => buildDocumentMetrics(rows, filters), [filters, rows]);
  const annulTarget = rows.find((document) => document.id === annulTargetId);

  function updateFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  function resetFilters() {
    setFilters(EMPTY_FILTERS);
  }

  function openDocument(document) {
    setSelectedDocument(document);
  }

  function printSecondCopy(document) {
    const copy = prepareSecondCopy(rows, document.id);

    setSelectedDocument(copy);
    setMessage(`${copy.copyLabel} preparada para ${copy.number}.`);
  }

  function exportDocument(document) {
    setMessage(`Documento ${document.number} preparado para exportacao.`);
  }

  function openAnnulModal(document) {
    setMessage('');
    setAnnulReason('');
    setAnnulTargetId(document.id);
  }

  async function confirmAnnulment() {
    if (!annulTarget || !annulReason.trim()) {
      setMessage('Informe o motivo da anulacao.');
      return;
    }

    if (!(await confirmSensitiveAction(`Deseja realmente anular ${annulTarget.number}?`, undefined, {
      title: 'Confirmar anulacao',
      confirmLabel: 'Anular documento',
      tone: 'warning',
    }))) {
      return;
    }

    setRows((current) => annulDocument(current, annulTarget.id, {
      reason: annulReason,
      userName: getDisplayUserName(user),
    }));
    setAnnulTargetId(null);
    setAnnulReason('');
    setMessage(`${annulTarget.number} foi anulado.`);
  }

  async function convertDocument(document) {
    if (!(await confirmSensitiveAction(`Deseja converter ${document.number} em factura?`, undefined, {
      title: 'Confirmar conversao',
      confirmLabel: 'Converter',
      tone: 'success',
    }))) {
      return;
    }

    setRows((current) => convertProformaToInvoice(current, document.id, {
      userName: getDisplayUserName(user),
    }));
    setMessage(`${document.number} foi convertido em factura.`);
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
                  <span className={document.status === DOCUMENT_STATUSES.CANCELLED ? 'status waiting' : 'status paid'}>
                    {documentStatusLabels[document.status]}
                  </span>
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
                  {canAnnul && document.status !== DOCUMENT_STATUSES.CANCELLED ? (
                    <button className="icon-button danger" type="button" aria-label="Anular documento" onClick={() => openAnnulModal(document)}>
                      <Ban size={16} />
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

      {annulTarget ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-title-row">
              <h2>Anular {annulTarget.number}</h2>
              <button type="button" onClick={() => setAnnulTargetId(null)}>x</button>
            </div>
            <textarea
              placeholder="Motivo da anulacao"
              value={annulReason}
              onChange={(event) => setAnnulReason(event.target.value)}
            />
            <div className="modal-actions">
              <button type="button" className="soft-button" onClick={() => setAnnulTargetId(null)}>Cancelar</button>
              <button type="button" className="primary-button" onClick={confirmAnnulment} disabled={!annulReason.trim()}>
                Confirmar anulacao
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function DocumentDetails({ document, snapshot, onClose }) {
  const documentSettings = buildDocumentSettingsFromSnapshot(snapshot);
  const viewModel = buildInvoiceA4ViewModel({
    document,
    ...documentSettings,
    printedBy: document.userName || 'Usuario',
  });

  function handlePrintA4() {
    window.setTimeout(() => window.print(), 0);
  }

  function handleSavePdf() {
    window.setTimeout(() => window.print(), 0);
  }

  return (
    <div className="modal-backdrop documents-print-scope invoice-a4-print-scope" role="dialog" aria-modal="true">
      <div className="modal-card wide document-detail-modal">
        <div className="modal-title-row">
          <div>
            <h2>{document.number}</h2>
            {document.copyLabel ? <span className="copy-label">{document.copyLabel}</span> : null}
          </div>
          <div className="invoice-a4-actions">
            <button type="button" className="icon-button" aria-label="Salvar PDF" title="Salvar PDF" onClick={handleSavePdf}>
              <FileDown size={20} />
            </button>
            <button type="button" className="icon-button" aria-label="Imprimir factura" title="Imprimir" onClick={handlePrintA4}>
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
