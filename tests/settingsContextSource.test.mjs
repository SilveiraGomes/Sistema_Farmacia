import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  CATALOG_KEYS,
  createSafeDefaultSnapshot,
  filterCatalogOptions,
} from '../src/configuration/catalogKeys.mjs';

test('catalog keys are complete, canonical and frozen', () => {
  assert.equal(Object.isFrozen(CATALOG_KEYS), true);
  assert.deepEqual(Object.values(CATALOG_KEYS), [
    'payment_methods',
    'operation_shifts',
    'expense_categories',
    'revenue_categories',
    'loss_reasons',
    'stock_units',
    'stock_locations',
    'client_statuses',
    'document_types',
    'document_statuses',
    'financial_entry_types',
    'financial_statuses',
    'operation_statuses',
  ]);
});

test('safe snapshot is structurally complete and isolated per call', () => {
  const first = createSafeDefaultSnapshot();
  const second = createSafeDefaultSnapshot();

  assert.equal(first.settings.company.identity.value.pharmacyName, 'Sistema de Farmacia');
  assert.equal(first.settings.documents.currency.value, 'AKZ');
  assert.equal(first.settings.sales.defaultPaymentMethod.value, 'dinheiro');
  assert.equal(first.settings.migration.legacyLocalStorageVersion.value, 0);
  assert.deepEqual(Object.keys(first.catalogs).sort(), Object.values(CATALOG_KEYS).sort());
  assert.equal(first.definitions.catalogs.payment_methods.editable, true);
  assert.equal(first.definitions.catalogs.document_statuses.editable, false);
  assert.equal(first.migrations.legacyLocalStoragePending, true);

  first.settings.company.identity.value.pharmacyName = 'Mutated';
  assert.equal(second.settings.company.identity.value.pharmacyName, 'Sistema de Farmacia');
});

test('catalog filtering is deterministic and preserves only selected inactive option', () => {
  const snapshot = {
    catalogs: {
      payment_methods: [
        { id: 4, code: 'old', name: 'Antigo', order: 1, active: false },
        { id: 3, code: 'card', name: 'Cartao', order: 1, active: true },
        { id: 2, code: 'cash', name: 'Dinheiro', order: 0, active: true },
        { id: 5, code: 'other-old', name: 'Outro antigo', order: 2, active: false },
        { id: 6, code: 'old', name: 'Duplicado', order: 3, active: false },
      ],
    },
  };

  assert.deepEqual(
    filterCatalogOptions(snapshot, 'payment_methods').map(({ code }) => code),
    ['cash', 'card'],
  );
  assert.deepEqual(
    filterCatalogOptions(snapshot, 'payment_methods', { selectedCode: 'old' }).map(({ code }) => code),
    ['cash', 'old', 'card'],
  );
  assert.deepEqual(
    filterCatalogOptions(snapshot, 'payment_methods', { includeInactive: true }).map(({ code }) => code),
    ['cash', 'old', 'card', 'other-old'],
  );
  assert.deepEqual(filterCatalogOptions(null, 'payment_methods'), []);
});

test('SettingsContext gates migration, protects async state and exposes hooks', async () => {
  const source = await readFile('src/configuration/SettingsContext.jsx', 'utf8');

  assert.match(source, /request\('configuration\.snapshot'/);
  assert.match(source, /legacyLocalStoragePending/);
  assert.match(source, /readLegacySettings/);
  assert.match(source, /configuration\.importLegacy/);
  assert.match(source, /migrationVersion:\s*LEGACY_MIGRATION_VERSION/);
  assert.match(source, /requestGenerationRef/);
  assert.match(source, /export function useCatalog/);
  assert.match(source, /includeInactive/);
  assert.match(source, /selectedCode/);
  assert.match(source, /export function useSetting/);
});

test('App wraps only authenticated modules with settings then operation providers', async () => {
  const appSource = await readFile('src/App.jsx', 'utf8');
  const indexSource = await readFile('src/index.jsx', 'utf8');

  assert.match(appSource, /if \(!user\)[\s\S]*return <Login \/>/);
  assert.match(appSource, /<SettingsProvider>[\s\S]*<OperationProvider>[\s\S]*className=.*app-shell/);
  assert.doesNotMatch(indexSource, /OperationProvider/);
  assert.match(indexSource, /<AuthProvider>/);
});
