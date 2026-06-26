import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addCartItem,
  cancelHeldSale,
  removeCartItem,
  changeCartQuantity,
  createHeldSale,
  filterClientsForPicker,
  filterProductsForSale,
  findProductByExactBarcode,
  resumeHeldSale,
  calculateCheckout,
  appendReceivedDigit,
  buildRecentSaleDocuments,
  DEFAULT_SALE_CLIENT,
  resolveReceivedForPaymentMode,
  buildFinalizedSaleDocument,
} from '../src/data/salesWorkflow.mjs';
import { DOCUMENT_STATUSES, DOCUMENT_TYPES } from '../src/data/documents.mjs';

const aspirin = { id: 1, name: 'Aspirina', price: 1000 };
const gel = { id: 2, name: 'Gel Dermico', price: 1500 };

test('cart helpers add, change and remove selected items', () => {
  const cart = addCartItem([{ ...aspirin, quantity: 1 }], aspirin);
  assert.equal(cart[0].quantity, 2);

  const changed = changeCartQuantity(cart, aspirin.id, -1);
  assert.equal(changed[0].quantity, 1);

  const removed = removeCartItem(changed, aspirin.id);
  assert.deepEqual(removed, []);
});

test('held sale returns to invoice details with original items', () => {
  const currentCart = [
    { ...aspirin, quantity: 2 },
    { ...gel, quantity: 1 },
  ];

  const held = createHeldSale({
    cart: currentCart,
    currentHeldSales: [],
    clientName: 'Cliente Balcao',
    invoiceNumber: 'FAT030/26',
  });

  assert.equal(held[0].status, 'EM ESPERA');
  assert.equal(held[0].items, 'Aspirina (2), Gel Dermico (1)');

  const resumed = resumeHeldSale(held, 'FAT030/26');
  assert.equal(resumed.heldSales.length, 0);
  assert.deepEqual(resumed.cart, currentCart);

  assert.deepEqual(cancelHeldSale(held, 'FAT030/26'), []);
});

test('calculateCheckout returns total, received value and change', () => {
  const checkout = calculateCheckout({
    cart: [{ ...aspirin, quantity: 2 }],
    discount: 250,
    taxRate: 0.1,
    received: 3000,
  });

  assert.equal(checkout.subtotal, 2000);
  assert.equal(checkout.tax, 200);
  assert.equal(checkout.total, 1950);
  assert.equal(checkout.received, 3000);
  assert.equal(checkout.change, 1050);
  assert.equal(checkout.canFinalize, true);
});

test('filterProductsForSale searches all products when a query is typed', () => {
  const products = [
    { id: 1, name: 'Aspirina', category: 'Medicamentos', price: 1000, stock: 10, barcode: '78910001' },
    { id: 2, name: 'Luvas Clinicas', category: 'Material Clinico', price: 700, stock: 20, barcode: '311' },
  ];

  assert.deepEqual(filterProductsForSale(products, null, '').map((item) => item.name), ['Aspirina', 'Luvas Clinicas']);
  assert.deepEqual(filterProductsForSale(products, 'Medicamentos', '').map((item) => item.name), ['Aspirina']);
  assert.deepEqual(filterProductsForSale(products, 'Medicamentos', 'luvas').map((item) => item.name), ['Luvas Clinicas']);
  assert.deepEqual(filterProductsForSale(products, 'Medicamentos', '311').map((item) => item.name), ['Luvas Clinicas']);
});

test('findProductByExactBarcode selects only exact 13 digit barcodes', () => {
  const products = [
    { id: 1, name: 'Aspirina', barcode: '5601234567890' },
    { id: 2, name: 'Luvas Clinicas', codigo_barras: '7891234567895' },
  ];

  assert.equal(findProductByExactBarcode(products, '5601234567890')?.name, 'Aspirina');
  assert.equal(findProductByExactBarcode(products, ' 7891234567895 ')?.name, 'Luvas Clinicas');
  assert.equal(findProductByExactBarcode(products, '560123456789'), null);
  assert.equal(findProductByExactBarcode(products, '5601234567899'), null);
  assert.equal(findProductByExactBarcode(products, 'ABC1234567890'), null);
});

test('filterClientsForPicker searches clients by name, NIF or phone', () => {
  const clientRows = [
    { id: 'CL001', name: 'Joao de Almeida', nif: '5001234567', phone: '+244 923 100 200' },
    { id: 'CL002', name: 'Margarida Albuquerque', nif: '5009876543', phone: '+244 924 330 440' },
    { id: 'CL003', name: 'Ana Luisa', nif: '5012340099', phone: '+244 929 444 118' },
  ];

  assert.deepEqual(filterClientsForPicker(clientRows, '').map((client) => client.name), [
    'Joao de Almeida',
    'Margarida Albuquerque',
    'Ana Luisa',
  ]);
  assert.deepEqual(filterClientsForPicker(clientRows, 'margarida').map((client) => client.name), ['Margarida Albuquerque']);
  assert.deepEqual(filterClientsForPicker(clientRows, '500123').map((client) => client.name), ['Joao de Almeida']);
  assert.deepEqual(filterClientsForPicker(clientRows, '929 444').map((client) => client.name), ['Ana Luisa']);
});

test('resolveReceivedForPaymentMode fills total for non-cash payments', () => {
  assert.equal(resolveReceivedForPaymentMode('Dinheiro', 1950, ''), '');
  assert.equal(resolveReceivedForPaymentMode('TPA', 1950, ''), '1950');
});

test('buildFinalizedSaleDocument prepares an invoice document from checkout data', () => {
  const document = buildFinalizedSaleDocument({
    cart: [{ ...aspirin, quantity: 2 }],
    client: { name: 'Cliente Teste', nif: '5001234567', phone: '+244 923 000 000' },
    checkout: {
      subtotal: 2000,
      discount: 250,
      tax: 0,
      total: 1750,
    },
    invoiceNumber: 'FAT099/26',
    paymentMethod: 'Dinheiro',
    issueDate: '2026-06-18',
    userName: 'Operador',
  });

  assert.equal(document.type, DOCUMENT_TYPES.INVOICE);
  assert.equal(document.status, DOCUMENT_STATUSES.ISSUED);
  assert.equal(document.number, 'FAT099/26');
  assert.equal(document.clientName, 'Cliente Teste');
  assert.equal(document.clientTaxId, '5001234567');
  assert.equal(document.clientPhone, '+244 923 000 000');
  assert.equal(document.paymentMethod, 'Dinheiro');
  assert.equal(document.items[0].productId, '0001');
  assert.equal(document.items[0].description, 'Aspirina');
  assert.equal(document.items[0].quantity, 2);
  assert.equal(document.items[0].unitPrice, 1000);
  assert.equal(document.items[0].total, 2000);
  assert.equal(document.total, 1750);
});

test('buildFinalizedSaleDocument uses final consumer when no client is selected', () => {
  const document = buildFinalizedSaleDocument({
    cart: [{ ...aspirin, quantity: 1 }],
    client: null,
    checkout: {
      subtotal: 1000,
      discount: 0,
      tax: 0,
      total: 1000,
    },
    invoiceNumber: 'FAT100/26',
    paymentMethod: 'Dinheiro',
    issueDate: '2026-06-18',
  });

  assert.equal(DEFAULT_SALE_CLIENT.name, 'Consumidor Final');
  assert.equal(DEFAULT_SALE_CLIENT.nif, '9999999999');
  assert.equal(document.clientName, 'Consumidor Final');
  assert.equal(document.clientTaxId, '9999999999');
});

test('buildRecentSaleDocuments returns the latest five invoices and receipts', () => {
  const rows = [
    { id: '1', type: DOCUMENT_TYPES.PROFORMA, number: 'PRO001/26', issueDate: '2026-06-18', total: 100 },
    { id: '2', type: DOCUMENT_TYPES.INVOICE, number: 'FAT001/26', issueDate: '2026-06-10', total: 200 },
    { id: '3', type: DOCUMENT_TYPES.RECEIPT, number: 'REC001/26', issueDate: '2026-06-11', total: 300 },
    { id: '4', type: DOCUMENT_TYPES.CREDIT_NOTE, number: 'NC001/26', issueDate: '2026-06-17', total: 400 },
    { id: '5', type: DOCUMENT_TYPES.INVOICE, number: 'FAT002/26', issueDate: '2026-06-12', total: 500 },
    { id: '6', type: DOCUMENT_TYPES.INVOICE, number: 'FAT003/26', issueDate: '2026-06-13', total: 600 },
    { id: '7', type: DOCUMENT_TYPES.RECEIPT, number: 'REC002/26', issueDate: '2026-06-14', total: 700 },
    { id: '8', type: DOCUMENT_TYPES.INVOICE, number: 'FAT004/26', issueDate: '2026-06-15', total: 800 },
    { id: '9', type: DOCUMENT_TYPES.RECEIPT, number: 'REC003/26', issueDate: '2026-06-16', total: 900 },
  ];

  // CREDIT_NOTE is now included alongside invoices/receipts
  assert.deepEqual(
    buildRecentSaleDocuments(rows).map((document) => document.number),
    ['NC001/26', 'REC003/26', 'FAT004/26', 'REC002/26', 'FAT003/26'],
  );
});

test('appendReceivedDigit builds and edits cash received values from keypad input', () => {
  assert.equal(appendReceivedDigit('', '5'), '5');
  assert.equal(appendReceivedDigit('5', '0'), '50');
  assert.equal(appendReceivedDigit('50', '00'), '5000');
  assert.equal(appendReceivedDigit('5000', 'backspace'), '500');
  assert.equal(appendReceivedDigit('500', 'clear'), '');
});
