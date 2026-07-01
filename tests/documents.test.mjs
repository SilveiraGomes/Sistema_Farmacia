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
