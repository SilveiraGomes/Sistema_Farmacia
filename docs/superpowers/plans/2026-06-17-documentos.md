# Documentos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Documentos module as a central screen for facturas, recibos, proformas, notas, guias, second copies, conversion, and controlled annulment.

**Architecture:** Start with a focused frontend/domain implementation using pure functions in `src/data/documents.mjs`, then wire it into navigation, permissions, and UI. Annulment is state-based, never destructive, and is allowed only for Administrador and management profiles such as Gestor de Stock.

**Tech Stack:** React 19, Vite, lucide-react, Node test runner, existing permission catalog, existing CSS in `src/assets/tailwind.css`.

---

## File Structure

- Create `src/data/documents.mjs`: document seed data and pure helpers for filtering, metrics, annulment, second-copy preparation, and proforma conversion.
- Create `src/components/Documentos.jsx`: Documentos screen, filters, table, details modal, annulment modal, and print/export actions.
- Modify `src/backend/services/permissionCatalog.js`: add `documentos.*` permissions and default profile assignments. `documentos.anular` must only be assigned to Administrador and Gestor de Stock in the current default profiles.
- Modify `src/App.jsx`: add `documentos` title, permission mapping, import, and screen switch.
- Modify `src/components/Navbar.jsx`: add Documentos menu item before Configuracoes and Usuarios.
- Modify `src/assets/tailwind.css`: add focused styles for document filters, detail grid, and print preview blocks. Rebuild `src/assets/output.css`.
- Create `tests/documents.test.mjs`: pure behavior coverage for document functions.
- Modify `tests/permissionCatalog.test.mjs`: assert document permission keys and management-only annulment defaults.

The project root is not currently a Git repository, so commit steps are intentionally omitted from execution commands.

---

### Task 1: Document Domain Helpers

**Files:**
- Create: `src/data/documents.mjs`
- Test: `tests/documents.test.mjs`

- [ ] **Step 1: Write failing tests for filters and metrics**

Create `tests/documents.test.mjs` with:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DOCUMENT_STATUSES,
  DOCUMENT_TYPES,
  annulDocument,
  buildDocumentMetrics,
  convertProformaToInvoice,
  documents,
  filterDocuments,
  prepareSecondCopy,
} from '../src/data/documents.mjs';

test('filterDocuments filters by type, status, client, number and period', () => {
  const result = filterDocuments(documents, {
    type: DOCUMENT_TYPES.INVOICE,
    status: DOCUMENT_STATUSES.ISSUED,
    query: 'maria',
    dateFrom: '2026-06-01',
    dateTo: '2026-06-30',
  });

  assert.deepEqual(result.map((document) => document.number), ['FAT027/26']);
});

test('buildDocumentMetrics counts visible documents and totals the period', () => {
  const metrics = buildDocumentMetrics(documents, {
    dateFrom: '2026-06-01',
    dateTo: '2026-06-30',
  });

  assert.equal(metrics.issuedDocuments > 0, true);
  assert.equal(metrics.cancelledInvoices, 1);
  assert.equal(metrics.pendingProformas, 1);
  assert.equal(metrics.periodTotal > 0, true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests\documents.test.mjs`

Expected: FAIL with module not found for `src/data/documents.mjs`.

- [ ] **Step 3: Implement document constants, seed data, filters and metrics**

Create `src/data/documents.mjs`:

```js
export const DOCUMENT_TYPES = Object.freeze({
  INVOICE: 'FACTURA',
  RECEIPT: 'RECIBO',
  PROFORMA: 'PROFORMA',
  CREDIT_NOTE: 'NOTA_CREDITO',
  DEBIT_NOTE: 'NOTA_DEBITO',
  GUIDE: 'GUIA',
});

export const DOCUMENT_STATUSES = Object.freeze({
  DRAFT: 'RASCUNHO',
  ISSUED: 'EMITIDO',
  PAID: 'PAGO',
  PENDING: 'PENDENTE',
  CONVERTED: 'CONVERTIDO',
  CANCELLED: 'ANULADO',
});

export const documentTypeLabels = Object.freeze({
  [DOCUMENT_TYPES.INVOICE]: 'Factura',
  [DOCUMENT_TYPES.RECEIPT]: 'Recibo',
  [DOCUMENT_TYPES.PROFORMA]: 'Proforma',
  [DOCUMENT_TYPES.CREDIT_NOTE]: 'Nota de credito',
  [DOCUMENT_TYPES.DEBIT_NOTE]: 'Nota de debito',
  [DOCUMENT_TYPES.GUIDE]: 'Guia',
});

export const documentStatusLabels = Object.freeze({
  [DOCUMENT_STATUSES.DRAFT]: 'Rascunho',
  [DOCUMENT_STATUSES.ISSUED]: 'Emitido',
  [DOCUMENT_STATUSES.PAID]: 'Pago',
  [DOCUMENT_STATUSES.PENDING]: 'Pendente',
  [DOCUMENT_STATUSES.CONVERTED]: 'Convertido',
  [DOCUMENT_STATUSES.CANCELLED]: 'Anulado',
});

export const documents = Object.freeze([
  {
    id: 'doc-1',
    number: 'FAT027/26',
    type: DOCUMENT_TYPES.INVOICE,
    status: DOCUMENT_STATUSES.ISSUED,
    clientName: 'Maria Lopes',
    userName: 'Administrador',
    issueDate: '2026-06-17',
    total: 5040.7,
    saleId: 'sale-27',
    originDocumentId: null,
    cancellationReason: '',
    cancelledBy: '',
    cancelledAt: '',
    paymentMethod: 'Dinheiro',
    items: [
      { productId: '#0001', description: 'Aspirina', quantity: 2, unitPrice: 1000, total: 2000 },
      { productId: '#0011', description: 'Vitamina C', quantity: 1, unitPrice: 3040.7, total: 3040.7 },
    ],
    events: [
      { action: 'EMITIDO', userName: 'Administrador', date: '2026-06-17T14:38:00', details: 'Documento emitido' },
    ],
  },
  {
    id: 'doc-2',
    number: 'REC011/26',
    type: DOCUMENT_TYPES.RECEIPT,
    status: DOCUMENT_STATUSES.PAID,
    clientName: 'Consumidor final',
    userName: 'Florentino',
    issueDate: '2026-06-16',
    total: 15860.9,
    saleId: 'sale-26',
    originDocumentId: 'doc-4',
    cancellationReason: '',
    cancelledBy: '',
    cancelledAt: '',
    paymentMethod: 'TPA',
    items: [
      { productId: '#0005', description: 'Luvas Clinicas', quantity: 3, unitPrice: 5286.97, total: 15860.9 },
    ],
    events: [
      { action: 'PAGO', userName: 'Florentino', date: '2026-06-16T20:02:00', details: 'Pagamento registado' },
    ],
  },
  {
    id: 'doc-3',
    number: 'FAT025/26',
    type: DOCUMENT_TYPES.INVOICE,
    status: DOCUMENT_STATUSES.CANCELLED,
    clientName: 'Joao de Almeida',
    userName: 'Administrador',
    issueDate: '2026-06-12',
    total: 7950,
    saleId: 'sale-25',
    originDocumentId: null,
    cancellationReason: 'Cliente solicitou cancelamento antes da entrega.',
    cancelledBy: 'Administrador',
    cancelledAt: '2026-06-12T16:12:00',
    paymentMethod: 'Transferencia',
    items: [
      { productId: '#0007', description: 'Gel Dermico', quantity: 1, unitPrice: 7950, total: 7950 },
    ],
    events: [
      { action: 'EMITIDO', userName: 'Administrador', date: '2026-06-12T15:30:00', details: 'Documento emitido' },
      { action: 'ANULADO', userName: 'Administrador', date: '2026-06-12T16:12:00', details: 'Cliente solicitou cancelamento antes da entrega.' },
    ],
  },
  {
    id: 'doc-4',
    number: 'PRO009/26',
    type: DOCUMENT_TYPES.PROFORMA,
    status: DOCUMENT_STATUSES.PENDING,
    clientName: 'Clinica Esperanca',
    userName: 'Florentino',
    issueDate: '2026-06-15',
    total: 42300,
    saleId: null,
    originDocumentId: null,
    cancellationReason: '',
    cancelledBy: '',
    cancelledAt: '',
    paymentMethod: '',
    items: [
      { productId: '#0010', description: 'Soro Fisiologico', quantity: 10, unitPrice: 4230, total: 42300 },
    ],
    events: [
      { action: 'PENDENTE', userName: 'Florentino', date: '2026-06-15T10:05:00', details: 'Proforma criada' },
    ],
  },
  {
    id: 'doc-5',
    number: 'NC003/26',
    type: DOCUMENT_TYPES.CREDIT_NOTE,
    status: DOCUMENT_STATUSES.ISSUED,
    clientName: 'Clinica Esperanca',
    userName: 'Administrador',
    issueDate: '2026-06-14',
    total: 2500,
    saleId: null,
    originDocumentId: 'doc-3',
    cancellationReason: '',
    cancelledBy: '',
    cancelledAt: '',
    paymentMethod: '',
    items: [
      { productId: '#0007', description: 'Credito por correcao', quantity: 1, unitPrice: 2500, total: 2500 },
    ],
    events: [
      { action: 'EMITIDO', userName: 'Administrador', date: '2026-06-14T11:10:00', details: 'Nota de credito emitida' },
    ],
  },
  {
    id: 'doc-6',
    number: 'GR004/26',
    type: DOCUMENT_TYPES.GUIDE,
    status: DOCUMENT_STATUSES.ISSUED,
    clientName: 'Deposito Interno',
    userName: 'Administrador',
    issueDate: '2026-06-13',
    total: 0,
    saleId: null,
    originDocumentId: null,
    cancellationReason: '',
    cancelledBy: '',
    cancelledAt: '',
    paymentMethod: '',
    items: [
      { productId: '#0012', description: 'Transferencia de lote', quantity: 4, unitPrice: 0, total: 0 },
    ],
    events: [
      { action: 'EMITIDO', userName: 'Administrador', date: '2026-06-13T08:30:00', details: 'Guia emitida' },
    ],
  },
]);

function normalize(value) {
  return String(value ?? '').trim().toLowerCase();
}

function isInsidePeriod(document, dateFrom, dateTo) {
  if (dateFrom && document.issueDate < dateFrom) {
    return false;
  }

  if (dateTo && document.issueDate > dateTo) {
    return false;
  }

  return true;
}

export function filterDocuments(documentRows, filters = {}) {
  const query = normalize(filters.query);

  return documentRows.filter((document) => {
    const matchesType = !filters.type || document.type === filters.type;
    const matchesStatus = !filters.status || document.status === filters.status;
    const matchesPeriod = isInsidePeriod(document, filters.dateFrom, filters.dateTo);
    const matchesQuery = !query || [
      document.number,
      document.clientName,
      document.userName,
      documentTypeLabels[document.type],
    ].some((value) => normalize(value).includes(query));

    return matchesType && matchesStatus && matchesPeriod && matchesQuery;
  });
}

export function buildDocumentMetrics(documentRows, filters = {}) {
  const visibleRows = filterDocuments(documentRows, {
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
  });

  return {
    issuedDocuments: visibleRows.filter((document) => document.status !== DOCUMENT_STATUSES.CANCELLED).length,
    cancelledInvoices: visibleRows.filter((document) => (
      document.type === DOCUMENT_TYPES.INVOICE &&
      document.status === DOCUMENT_STATUSES.CANCELLED
    )).length,
    pendingProformas: visibleRows.filter((document) => (
      document.type === DOCUMENT_TYPES.PROFORMA &&
      document.status === DOCUMENT_STATUSES.PENDING
    )).length,
    periodTotal: visibleRows.reduce((total, document) => (
      document.status === DOCUMENT_STATUSES.CANCELLED ? total : total + Number(document.total || 0)
    ), 0),
  };
}
```

- [ ] **Step 4: Run tests to verify first behavior passes**

Run: `node --test tests\documents.test.mjs`

Expected: PASS for the first two tests.

- [ ] **Step 5: Add failing tests for annulment, second copy and conversion**

Append to `tests/documents.test.mjs`:

```js
test('annulDocument records cancellation without deleting the document', () => {
  const result = annulDocument(documents, 'doc-1', {
    reason: 'Erro de lancamento',
    userName: 'Gestor de Stock',
    date: '2026-06-17T15:00:00',
  });
  const cancelled = result.find((document) => document.id === 'doc-1');

  assert.equal(result.length, documents.length);
  assert.equal(cancelled.status, DOCUMENT_STATUSES.CANCELLED);
  assert.equal(cancelled.cancellationReason, 'Erro de lancamento');
  assert.equal(cancelled.cancelledBy, 'Gestor de Stock');
  assert.equal(cancelled.events.at(-1).action, 'ANULADO');
});

test('annulDocument rejects missing reason and already cancelled documents', () => {
  assert.throws(
    () => annulDocument(documents, 'doc-1', { reason: ' ', userName: 'Gestor de Stock' }),
    /Informe o motivo da anulacao/
  );
  assert.throws(
    () => annulDocument(documents, 'doc-3', { reason: 'Duplicado', userName: 'Gestor de Stock' }),
    /Documento ja anulado/
  );
});

test('prepareSecondCopy returns immutable print data with second-copy label', () => {
  const copy = prepareSecondCopy(documents, 'doc-1');

  assert.equal(copy.number, 'FAT027/26');
  assert.equal(copy.copyLabel, '2a VIA');
  assert.equal(copy.items.length, 2);
  assert.notEqual(copy.items, documents[0].items);
});

test('convertProformaToInvoice creates an invoice and marks source as converted', () => {
  const result = convertProformaToInvoice(documents, 'doc-4', {
    invoiceNumber: 'FAT028/26',
    userName: 'Administrador',
    date: '2026-06-17T15:20:00',
  });
  const source = result.find((document) => document.id === 'doc-4');
  const invoice = result.find((document) => document.number === 'FAT028/26');

  assert.equal(source.status, DOCUMENT_STATUSES.CONVERTED);
  assert.equal(invoice.type, DOCUMENT_TYPES.INVOICE);
  assert.equal(invoice.originDocumentId, 'doc-4');
  assert.equal(invoice.status, DOCUMENT_STATUSES.ISSUED);
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `node --test tests\documents.test.mjs`

Expected: FAIL with `annulDocument is not a function`, `prepareSecondCopy is not a function`, or `convertProformaToInvoice is not a function`.

- [ ] **Step 7: Implement annulment, second copy and conversion**

Append to `src/data/documents.mjs`:

```js
function findDocument(documentRows, documentId) {
  const document = documentRows.find((row) => row.id === documentId);
  if (!document) {
    throw new Error('Documento nao encontrado.');
  }

  return document;
}

function cloneDocument(document) {
  return {
    ...document,
    items: document.items.map((item) => ({ ...item })),
    events: document.events.map((event) => ({ ...event })),
  };
}

export function annulDocument(documentRows, documentId, options = {}) {
  const reason = String(options.reason ?? '').trim();
  if (!reason) {
    throw new Error('Informe o motivo da anulacao.');
  }

  const currentDocument = findDocument(documentRows, documentId);
  if (currentDocument.status === DOCUMENT_STATUSES.CANCELLED) {
    throw new Error('Documento ja anulado.');
  }

  const date = options.date || new Date().toISOString();
  const userName = options.userName || 'Usuario';

  return documentRows.map((document) => {
    if (document.id !== documentId) {
      return document;
    }

    return {
      ...cloneDocument(document),
      status: DOCUMENT_STATUSES.CANCELLED,
      cancellationReason: reason,
      cancelledBy: userName,
      cancelledAt: date,
      events: [
        ...document.events.map((event) => ({ ...event })),
        { action: 'ANULADO', userName, date, details: reason },
      ],
    };
  });
}

export function prepareSecondCopy(documentRows, documentId) {
  const document = cloneDocument(findDocument(documentRows, documentId));

  return {
    ...document,
    copyLabel: '2a VIA',
  };
}

export function convertProformaToInvoice(documentRows, documentId, options = {}) {
  const source = findDocument(documentRows, documentId);
  if (source.type !== DOCUMENT_TYPES.PROFORMA) {
    throw new Error('Documento nao pode ser convertido.');
  }

  if (source.status === DOCUMENT_STATUSES.CONVERTED) {
    throw new Error('Documento ja convertido.');
  }

  if (source.status === DOCUMENT_STATUSES.CANCELLED) {
    throw new Error('Documento anulado nao pode ser convertido.');
  }

  const date = options.date || new Date().toISOString();
  const issueDate = date.slice(0, 10);
  const userName = options.userName || 'Usuario';
  const invoiceNumber = options.invoiceNumber || `FAT${String(documentRows.length + 1).padStart(3, '0')}/26`;
  const invoiceId = `doc-${documentRows.length + 1}`;

  const convertedRows = documentRows.map((document) => {
    if (document.id !== documentId) {
      return document;
    }

    return {
      ...cloneDocument(document),
      status: DOCUMENT_STATUSES.CONVERTED,
      events: [
        ...document.events.map((event) => ({ ...event })),
        { action: 'CONVERTIDO', userName, date, details: `Convertido em ${invoiceNumber}` },
      ],
    };
  });

  return [
    {
      ...cloneDocument(source),
      id: invoiceId,
      number: invoiceNumber,
      type: DOCUMENT_TYPES.INVOICE,
      status: DOCUMENT_STATUSES.ISSUED,
      issueDate,
      userName,
      originDocumentId: source.id,
      events: [
        { action: 'EMITIDO', userName, date, details: `Factura gerada a partir de ${source.number}` },
      ],
    },
    ...convertedRows,
  ];
}
```

- [ ] **Step 8: Run document tests**

Run: `node --test tests\documents.test.mjs`

Expected: PASS.

---

### Task 2: Permission Catalog

**Files:**
- Modify: `src/backend/services/permissionCatalog.js`
- Modify: `tests/permissionCatalog.test.mjs`

- [ ] **Step 1: Write failing permission tests**

Append to `tests/permissionCatalog.test.mjs`:

```js
test('document permission catalog includes all document actions', () => {
  const keys = getPermissionKeys();

  assert.ok(keys.includes('documentos.ver'));
  assert.ok(keys.includes('documentos.imprimir'));
  assert.ok(keys.includes('documentos.anular'));
  assert.ok(keys.includes('documentos.exportar'));
  assert.ok(keys.includes('documentos.converter'));
});

test('document annulment is restricted to administrator and management profiles by default', () => {
  const admin = DEFAULT_PROFILES.find((profile) => profile.nome === 'Administrador');
  const pharmacist = DEFAULT_PROFILES.find((profile) => profile.nome === 'Farmaceutico');
  const cashier = DEFAULT_PROFILES.find((profile) => profile.nome === 'Caixa');
  const stockManager = DEFAULT_PROFILES.find((profile) => profile.nome === 'Gestor de Stock');

  assert.equal(admin.permissoes.includes('documentos.anular'), true);
  assert.equal(stockManager.permissoes.includes('documentos.anular'), true);
  assert.equal(pharmacist.permissoes.includes('documentos.anular'), false);
  assert.equal(cashier.permissoes.includes('documentos.anular'), false);
});
```

- [ ] **Step 2: Run permission tests to verify failure**

Run: `node --test tests\permissionCatalog.test.mjs`

Expected: FAIL because `documentos.*` permission keys are missing.

- [ ] **Step 3: Add document permissions**

In `src/backend/services/permissionCatalog.js`, add these entries after the Vendas permissions and before Estoque:

```js
  { chave: 'documentos.ver', modulo: 'Documentos', acao: 'ver', descricao: 'Ver documentos' },
  { chave: 'documentos.imprimir', modulo: 'Documentos', acao: 'imprimir', descricao: 'Imprimir segunda via de documentos' },
  { chave: 'documentos.anular', modulo: 'Documentos', acao: 'anular', descricao: 'Anular documentos' },
  { chave: 'documentos.exportar', modulo: 'Documentos', acao: 'exportar', descricao: 'Exportar documentos' },
  { chave: 'documentos.converter', modulo: 'Documentos', acao: 'converter', descricao: 'Converter documentos' },
```

Update `DEFAULT_PROFILES`:

```js
// Administrador already receives ALL_PERMISSION_KEYS.
```

For `Farmaceutico`, add only:

```js
      'documentos.ver',
      'documentos.imprimir',
      'documentos.exportar',
```

For `Caixa`, add only:

```js
      'documentos.ver',
      'documentos.imprimir',
```

For `Gestor de Stock`, add:

```js
      'documentos.ver',
      'documentos.imprimir',
      'documentos.anular',
      'documentos.exportar',
      'documentos.converter',
```

- [ ] **Step 4: Run permission tests**

Run: `node --test tests\permissionCatalog.test.mjs`

Expected: PASS.

---

### Task 3: Navigation Wiring

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/Navbar.jsx`
- Create: `src/components/Documentos.jsx`

- [ ] **Step 1: Create temporary Documentos component**

Create `src/components/Documentos.jsx`:

```jsx
import React from 'react';

function Documentos() {
  return (
    <section className="standard-screen documents-screen">
      <div className="panel">
        <h2>Documentos</h2>
      </div>
    </section>
  );
}

export default Documentos;
```

- [ ] **Step 2: Wire route in App**

Modify `src/App.jsx`:

```jsx
import Documentos from './components/Documentos';
```

Add title:

```js
  documentos: 'Documentos',
```

Add permission:

```js
  documentos: 'documentos.ver',
```

Add switch case before Configuracoes:

```jsx
      case 'documentos':
        return <Documentos />;
```

- [ ] **Step 3: Wire menu item**

Modify `src/components/Navbar.jsx` imports:

```jsx
  FileText,
```

Add menu item after `relatorios` and before `configuracoes`:

```js
  { id: 'documentos', label: 'Documentos', icon: FileText, permission: 'documentos.ver' },
```

- [ ] **Step 4: Run build**

Run: `npm run build`

Expected: PASS.

---

### Task 4: Documentos Screen

**Files:**
- Modify: `src/components/Documentos.jsx`
- Modify: `src/assets/tailwind.css`
- Generated: `src/assets/output.css`

- [ ] **Step 1: Replace temporary component with full screen**

Replace `src/components/Documentos.jsx` with:

```jsx
import React, { useMemo, useState } from 'react';
import {
  Ban,
  Download,
  Eye,
  FileText,
  Printer,
  RefreshCcw,
  Repeat2,
  Search,
} from 'lucide-react';
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
import { useAuth } from '../auth/AuthContext.jsx';
import { confirmSensitiveAction } from '../utils/confirmations.mjs';
import { formatKwanza } from '../data/pharmacyData.mjs';

const EMPTY_FILTERS = {
  query: '',
  type: '',
  status: '',
  dateFrom: '2026-06-01',
  dateTo: '2026-06-30',
};

function Documentos() {
  const { hasPermission, user } = useAuth();
  const canPrint = hasPermission('documentos.imprimir');
  const canExport = hasPermission('documentos.exportar');
  const canAnnul = hasPermission('documentos.anular');
  const canConvert = hasPermission('documentos.converter');
  const [rows, setRows] = useState(initialDocuments);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [selectedDocumentId, setSelectedDocumentId] = useState(null);
  const [annulTargetId, setAnnulTargetId] = useState(null);
  const [annulReason, setAnnulReason] = useState('');
  const [message, setMessage] = useState('');

  const visibleRows = useMemo(() => filterDocuments(rows, filters), [filters, rows]);
  const metrics = useMemo(() => buildDocumentMetrics(rows, filters), [filters, rows]);
  const selectedDocument = rows.find((document) => document.id === selectedDocumentId);
  const annulTarget = rows.find((document) => document.id === annulTargetId);

  function updateFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  function resetFilters() {
    setFilters(EMPTY_FILTERS);
  }

  function printSecondCopy(document) {
    const copy = prepareSecondCopy(rows, document.id);
    setSelectedDocumentId(copy.id);
    setMessage(`${copy.copyLabel} preparada para ${copy.number}. Use a impressao do navegador.`);
    window.setTimeout(() => window.print(), 0);
  }

  function exportDocument(document) {
    setMessage(`Documento ${document.number} preparado para exportacao.`);
  }

  function openAnnulModal(document) {
    setMessage('');
    setAnnulReason('');
    setAnnulTargetId(document.id);
  }

  function confirmAnnulment() {
    if (!annulTarget || !annulReason.trim()) {
      setMessage('Informe o motivo da anulacao.');
      return;
    }

    if (!confirmSensitiveAction(`Deseja realmente anular ${annulTarget.number}?`)) {
      return;
    }

    setRows((current) => annulDocument(current, annulTarget.id, {
      reason: annulReason,
      userName: user?.nome_completo || user?.nome_usuario || 'Usuario',
    }));
    setAnnulTargetId(null);
    setAnnulReason('');
    setMessage(`${annulTarget.number} foi anulado.`);
  }

  function convertDocument(document) {
    if (!confirmSensitiveAction(`Deseja converter ${document.number} em factura?`)) {
      return;
    }

    setRows((current) => convertProformaToInvoice(current, document.id, {
      userName: user?.nome_completo || user?.nome_usuario || 'Usuario',
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
          {Object.values(DOCUMENT_TYPES).map((type) => (
            <option key={type} value={type}>{documentTypeLabels[type]}</option>
          ))}
        </select>
        <select value={filters.status} onChange={(event) => updateFilter('status', event.target.value)} aria-label="Estado do documento">
          <option value="">Todos os estados</option>
          {Object.values(DOCUMENT_STATUSES).map((status) => (
            <option key={status} value={status}>{documentStatusLabels[status]}</option>
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
                <td><span className={document.status === DOCUMENT_STATUSES.CANCELLED ? 'status waiting' : 'status paid'}>{documentStatusLabels[document.status]}</span></td>
                <td>{document.userName}</td>
                <td className="options-cell">
                  <button className="icon-button" type="button" aria-label="Ver detalhes" onClick={() => setSelectedDocumentId(document.id)}><Eye size={16} /></button>
                  {canPrint ? <button className="icon-button" type="button" aria-label="Imprimir segunda via" onClick={() => printSecondCopy(document)}><Printer size={16} /></button> : null}
                  {canExport ? <button className="icon-button" type="button" aria-label="Exportar documento" onClick={() => exportDocument(document)}><Download size={16} /></button> : null}
                  {canConvert && document.type === DOCUMENT_TYPES.PROFORMA && document.status === DOCUMENT_STATUSES.PENDING ? (
                    <button className="icon-button" type="button" aria-label="Converter em factura" onClick={() => convertDocument(document)}><Repeat2 size={16} /></button>
                  ) : null}
                  {canAnnul && document.status !== DOCUMENT_STATUSES.CANCELLED ? (
                    <button className="icon-button danger" type="button" aria-label="Anular documento" onClick={() => openAnnulModal(document)}><Ban size={16} /></button>
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
        <DocumentDetails document={selectedDocument} onClose={() => setSelectedDocumentId(null)} />
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

function DocumentDetails({ document, onClose }) {
  return (
    <div className="modal-backdrop documents-print-scope" role="dialog" aria-modal="true">
      <div className="modal-card wide document-detail-modal">
        <div className="modal-title-row">
          <h2>{document.number}</h2>
          <button type="button" onClick={onClose}>x</button>
        </div>
        <div className="document-detail-grid">
          <span><strong>Tipo</strong>{documentTypeLabels[document.type]}</span>
          <span><strong>Estado</strong>{documentStatusLabels[document.status]}</span>
          <span><strong>Cliente</strong>{document.clientName}</span>
          <span><strong>Data</strong>{document.issueDate}</span>
          <span><strong>Total</strong>{formatKwanza(document.total)}</span>
          <span><strong>Pagamento</strong>{document.paymentMethod || '-'}</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Produto</th>
              <th>Qtd.</th>
              <th>Preco</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {document.items.map((item) => (
              <tr key={`${document.id}-${item.productId}`}>
                <td>{item.description}</td>
                <td>{item.quantity}</td>
                <td>{formatKwanza(item.unitPrice)}</td>
                <td>{formatKwanza(item.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {document.cancellationReason ? (
          <div className="document-audit-note">
            <strong>Motivo de anulacao</strong>
            <span>{document.cancellationReason}</span>
          </div>
        ) : null}
        <div className="document-events">
          {document.events.map((event) => (
            <span key={`${event.action}-${event.date}`}>
              <strong>{event.action}</strong>
              {event.userName} - {event.date} - {event.details}
            </span>
          ))}
        </div>
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
```

- [ ] **Step 2: Add styles**

Append to `src/assets/tailwind.css`:

```css
.documents-filter-panel {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) repeat(4, minmax(130px, 180px)) auto;
  gap: 10px;
  align-items: center;
  padding: 12px;
  margin-bottom: 12px;
}

.documents-search {
  width: 100%;
}

.documents-count {
  color: var(--muted);
  font-size: 14px;
}

.documents-notice {
  margin-bottom: 10px;
}

.document-detail-modal {
  display: grid;
  gap: 14px;
}

.document-detail-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.document-detail-grid span,
.document-audit-note,
.document-events span {
  display: grid;
  gap: 3px;
  padding: 10px;
  border: 1px solid #d8e3d8;
  border-radius: 8px;
  background: white;
}

.document-detail-grid strong,
.document-audit-note strong,
.document-events strong {
  color: var(--brand-dark);
  font-size: 13px;
}

.document-events {
  display: grid;
  gap: 8px;
}

@media print {
  body * {
    visibility: hidden;
  }

  .documents-print-scope,
  .documents-print-scope * {
    visibility: visible;
  }

  .documents-print-scope {
    position: absolute;
    inset: 0;
    background: white;
  }

  .documents-print-scope .modal-card {
    width: 100%;
    box-shadow: none;
  }
}

@media (max-width: 1180px) {
  .documents-filter-panel {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .document-detail-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 820px) {
  .documents-filter-panel,
  .document-detail-grid {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 3: Rebuild CSS**

Run: `npm run build:tailwind`

Expected: `src/assets/output.css` is regenerated without errors.

- [ ] **Step 4: Run build**

Run: `npm run build`

Expected: PASS.

---

### Task 5: Test and Integration Verification

**Files:**
- Test: `tests/documents.test.mjs`
- Test: `tests/permissionCatalog.test.mjs`
- Build output: `dist/*`

- [ ] **Step 1: Run focused tests**

Run: `node --test tests\documents.test.mjs tests\permissionCatalog.test.mjs`

Expected: PASS.

- [ ] **Step 2: Run full test suite**

Run: `npm test`

Expected: PASS with all tests passing.

- [ ] **Step 3: Run production build**

Run: `npm run build`

Expected: Vite build exits with code 0 and writes `dist/index.html`.

- [ ] **Step 4: Manual UI check**

Run: `npm run dev -- --port 5173`

Open `http://127.0.0.1:5173`.

Check:

- Login as an Administrador user.
- Menu shows Documentos.
- Documentos table lists all document types.
- Filters change visible rows.
- Details modal opens.
- Second-copy button opens print flow.
- Proforma conversion changes source status and creates a new factura.
- Anular opens reason modal and requires reason.
- With a non-management profile, annulment action is not available because `documentos.anular` is absent.

---

## Self-Review

Spec coverage:

- Central list, filters, metrics, details, second copy, export notice behavior, conversion, annulment, and permission restrictions are covered.
- The plan implements the approved restriction that Farmaceutico, Caixa, and future Vendedor profiles do not receive `documentos.anular`.
- Persisted backend document tables are not included because the spec allows the first implementation to use structured mock data while the app still uses in-memory sales data.

Placeholder scan:

- No `TBD`, `TODO`, or undefined task references remain.

Type consistency:

- Document status/type constants are reused by tests and UI.
- `annulDocument`, `prepareSecondCopy`, `convertProformaToInvoice`, `filterDocuments`, and `buildDocumentMetrics` are defined before UI usage.
