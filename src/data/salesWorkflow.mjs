import { calculateCartSummary } from './pharmacyData.mjs';
import { DOCUMENT_STATUSES, DOCUMENT_TYPES } from './documents.mjs';

export const DEFAULT_SALE_CLIENT = Object.freeze({
  id: 'FINAL_CONSUMER',
  name: 'Consumidor Final',
  nif: '9999999999',
  phone: '',
});

export function addCartItem(cart, product) {
  const existing = cart.find((item) => item.id === product.id);

  if (existing) {
    return cart.map((item) =>
      item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item,
    );
  }

  return [...cart, { ...product, quantity: 1 }];
}

export function removeCartItem(cart, productId) {
  return cart.filter((item) => item.id !== productId);
}

export function changeCartQuantity(cart, productId, direction) {
  return cart
    .map((item) =>
      item.id === productId
        ? { ...item, quantity: item.quantity + direction }
        : item,
    )
    .filter((item) => item.quantity > 0);
}

export function createHeldSale({ cart, currentHeldSales, clientName, invoiceNumber }) {
  if (!cart.length) {
    return currentHeldSales;
  }

  const summary = calculateCartSummary(cart);

  return [
    {
      number: invoiceNumber,
      items: cart.map((item) => `${item.name} (${item.quantity})`).join(', '),
      value: summary.total,
      status: 'EM ESPERA',
      client: clientName,
      cartItems: cart.map((item) => ({ ...item })),
    },
    ...currentHeldSales,
  ];
}

export function resumeHeldSale(heldSales, invoiceNumber) {
  const invoice = heldSales.find((sale) => sale.number === invoiceNumber);

  return {
    invoice,
    cart: invoice?.cartItems?.map((item) => ({ ...item })) ?? [],
    heldSales: heldSales.filter((sale) => sale.number !== invoiceNumber),
  };
}

export function cancelHeldSale(heldSales, invoiceNumber) {
  return heldSales.filter((sale) => sale.number !== invoiceNumber);
}

export function calculateCheckout({ cart, discount = 0, taxRate = 0, received = 0 }) {
  const summary = calculateCartSummary(cart, discount, taxRate);
  const receivedValue = Number(received) || 0;

  return {
    ...summary,
    received: receivedValue,
    change: roundMoney(Math.max(receivedValue - summary.total, 0)),
    canFinalize: cart.length > 0 && receivedValue >= summary.total,
  };
}

export function buildFinalizedSaleDocument({
  cart,
  client,
  checkout,
  invoiceNumber,
  paymentMethod,
  issueDate,
  userName = 'Usuario',
}) {
  return {
    id: `sale-${invoiceNumber}`,
    type: DOCUMENT_TYPES.INVOICE,
    status: DOCUMENT_STATUSES.ISSUED,
    number: invoiceNumber,
    issueDate,
    dueDate: issueDate,
    clientName: client?.name || DEFAULT_SALE_CLIENT.name,
    clientTaxId: client?.nif || DEFAULT_SALE_CLIENT.nif,
    clientPhone: client?.phone || '',
    paymentMethod,
    userName,
    items: cart.map((item) => ({
      productId: String(item.id).padStart(4, '0'),
      description: item.name,
      quantity: Number(item.quantity) || 0,
      unitPrice: Number(item.price) || 0,
      discount: 0,
      taxRate: 0,
      taxValue: 0,
      total: roundMoney((Number(item.price) || 0) * (Number(item.quantity) || 0)),
    })),
    subtotal: checkout.subtotal,
    discount: checkout.discount,
    tax: checkout.tax,
    retention: 0,
    total: checkout.total,
  };
}

export function buildRecentSaleDocuments(documentRows, limit = 5) {
  const saleTypes = new Set([
    DOCUMENT_TYPES.INVOICE, DOCUMENT_TYPES.INVOICE_RECEIPT,
    DOCUMENT_TYPES.RECEIPT, DOCUMENT_TYPES.CREDIT, DOCUMENT_TYPES.CREDIT_NOTE,
  ]);

  return documentRows
    .map((document, index) => ({ document, index }))
    .filter(({ document }) => saleTypes.has(document.type))
    .sort((first, second) => (
      String(second.document.issueDate || '').localeCompare(String(first.document.issueDate || '')) ||
      first.index - second.index
    ))
    .slice(0, limit)
    .map(({ document }) => document);
}

export function filterProductsForSale(products, activeCategory, query = '') {
  const normalizedQuery = query.trim().toLowerCase();

  return products.filter((product) => {
    const isInCategory = !activeCategory || normalizedQuery ? true : product.category === activeCategory;
    const matchesQuery = !normalizedQuery ||
      [product.name, product.category, String(product.price), String(product.stock)]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery);

    return isInCategory && matchesQuery;
  });
}

export function filterClientsForPicker(clientRows, query = '') {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return clientRows;
  }

  return clientRows.filter((client) =>
    [client.name, client.nif, client.phone]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(normalizedQuery),
  );
}

export function resolveReceivedForPaymentMode(mode, total, currentValue = '') {
  return mode === 'Dinheiro' ? currentValue : String(total);
}

export function appendReceivedDigit(currentValue, key) {
  if (key === 'clear') return '';
  if (key === 'backspace') return String(currentValue).slice(0, -1);

  return `${currentValue}${key}`;
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}
