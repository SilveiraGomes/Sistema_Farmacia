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
