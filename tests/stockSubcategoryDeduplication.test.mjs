import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  deduplicateSubcategories,
  getProductSubcategoryName,
  getSubcategoryCategoryName,
  normalizeSubcategoryKey,
} = require('../src/backend/services/estoqueService.js');

test('deduplicates repeated subcategories inside the same category', () => {
  const rows = [
    { id: 1, categoria_id: 10, nome: 'Analgésico', ativo: true },
    { id: 2, categoria_id: 10, nome: ' analgesico ', ativo: true },
    { id: 3, categoria_id: 11, nome: 'Analgésico', ativo: true },
  ];

  assert.deepEqual(
    deduplicateSubcategories(rows).map(({ id }) => id),
    [1, 3],
  );
});

test('normalizes accents, whitespace and letter case for duplicate detection', () => {
  assert.equal(
    normalizeSubcategoryKey(10, ' Anti-inflamatório  e  Antipirético '),
    normalizeSubcategoryKey(10, 'anti-inflamatorio e antipiretico'),
  );
});

test('reads Sequelize generated association aliases when serializing stock data', () => {
  assert.equal(
    getProductSubcategoryName({
      Subcategorium: { nome: 'Analgésico' },
    }),
    'Analgésico',
  );
  assert.equal(
    getSubcategoryCategoryName({
      Categorium: { nome: 'Medicamento' },
    }),
    'Medicamento',
  );
});
