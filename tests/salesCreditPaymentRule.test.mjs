import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const vendaService = require('../src/backend/services/vendaService.js');

test('payment method credito is valid only for credito documents', () => {
  assert.equal(typeof vendaService.validateDocumentPaymentRule, 'function');

  assert.doesNotThrow(() => {
    vendaService.validateDocumentPaymentRule({ docType: 'credito', paymentMethod: 'credito' });
  });

  assert.throws(
    () => vendaService.validateDocumentPaymentRule({ docType: 'factura_recibo', paymentMethod: 'credito' }),
    /Crédito só é permitido quando o tipo de documento for Crédito\./,
  );

  assert.throws(
    () => vendaService.validateDocumentPaymentRule({ docType: 'credito', paymentMethod: 'dinheiro' }),
    /Documento do tipo Crédito deve usar pagamento Crédito\./,
  );
});

test('Vendas disables payment methods that do not match the selected document type', async () => {
  const source = await readFile(new URL('../src/components/Vendas.jsx', import.meta.url), 'utf8');

  assert.match(source, /function isPaymentMethodAllowedForDocument/);
  assert.match(source, /DOCUMENT_TYPES\.CREDIT/);
  assert.match(source, /disabled=\{!canOperate \|\| !cart\.length \|\| !isPaymentMethodAllowedForDocument\(docType, method\.id\)\}/);
});
