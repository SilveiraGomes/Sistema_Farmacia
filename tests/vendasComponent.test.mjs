import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('invoice quantity steppers are wired through parent callbacks', async () => {
  const source = await readFile(new URL('../src/components/Vendas.jsx', import.meta.url), 'utf8');
  const invoiceDetailsStart = source.indexOf('function InvoiceDetails');
  const heldSalesStart = source.indexOf('function HeldSalesTable');
  const invoiceDetailsSource = source.slice(invoiceDetailsStart, heldSalesStart);

  assert.match(source, /onChangeQuantity=\{\(itemId,\s*direction\) =>/);
  assert.match(invoiceDetailsSource, /function InvoiceDetails\(\{[^}]*onChangeQuantity/s);
  assert.doesNotMatch(invoiceDetailsSource, /\bsetCart\b/);
  assert.match(invoiceDetailsSource, /onChangeQuantity\(item\.id,\s*1\)/);
  assert.match(invoiceDetailsSource, /onChangeQuantity\(item\.id,\s*-1\)/);
});

test('invoice quantity stepper buttons show pointer cursor', async () => {
  const source = await readFile(new URL('../src/assets/tailwind.css', import.meta.url), 'utf8');
  const stepperButtonRule = source.match(/\.quantity-stepper button\s*\{[^}]+\}/)?.[0] ?? '';

  assert.match(stepperButtonRule, /cursor:\s*pointer;/);
});
