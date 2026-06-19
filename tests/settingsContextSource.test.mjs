import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  CATALOG_KEYS,
  createSafeDefaultSnapshot,
  filterCatalogOptions,
} from '../src/configuration/catalogKeys.mjs';
import { loadSettingsSnapshot } from '../src/configuration/settingsLifecycle.mjs';

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
    ['cash', 'card', 'old'],
  );
  assert.deepEqual(
    filterCatalogOptions(snapshot, 'payment_methods', { includeInactive: true }).map(({ code }) => code),
    ['cash', 'card', 'old', 'other-old'],
  );
  assert.deepEqual(filterCatalogOptions(null, 'payment_methods'), []);
});

test('catalog filtering supports empty choices, name sort and caller comparators', () => {
  const snapshot = {
    catalogs: {
      payment_methods: [
        { code: 'cash', name: 'Dinheiro', order: 2, active: true },
        { code: 'card', name: 'Cartao', order: 1, active: true },
      ],
    },
  };

  const withEmpty = filterCatalogOptions(snapshot, 'payment_methods', {
    includeEmpty: true,
    emptyLabel: 'Sem forma definida',
  });
  assert.deepEqual(withEmpty.map(({ code }) => code), ['', 'card', 'cash']);
  assert.equal(withEmpty[0].name, 'Sem forma definida');
  assert.deepEqual(
    filterCatalogOptions(snapshot, 'payment_methods', { sort: 'name' }).map(({ code }) => code),
    ['card', 'cash'],
  );
  assert.deepEqual(
    filterCatalogOptions(snapshot, 'payment_methods', {
      sort: (left, right) => right.code.localeCompare(left.code),
    }).map(({ code }) => code),
    ['cash', 'card'],
  );
});

test('settings lifecycle never reads legacy storage for completed or read-only snapshots', async () => {
  for (const { pending, canEdit } of [
    { pending: false, canEdit: true },
    { pending: true, canEdit: false },
  ]) {
    const calls = [];
    const snapshot = { settings: {}, catalogs: {}, migrations: { legacyLocalStoragePending: pending } };
    const result = await loadSettingsSnapshot({
      loadSnapshot: async () => { calls.push('snapshot'); return snapshot; },
      importLegacy: async () => { calls.push('import'); },
      readLegacy: () => { calls.push('legacy'); return {}; },
      canEdit,
    });
    assert.equal(result.snapshot, snapshot);
    assert.deepEqual(calls, ['snapshot']);
    assert.equal(result.readOnly, !canEdit);
  }
});

test('settings lifecycle imports pending legacy data then recalls SQLite snapshot', async () => {
  const calls = [];
  const initial = { settings: {}, catalogs: {}, migrations: { legacyLocalStoragePending: true } };
  const migrated = { settings: { company: {} }, catalogs: {}, migrations: { legacyLocalStoragePending: false } };
  let snapshotCall = 0;
  const result = await loadSettingsSnapshot({
    loadSnapshot: async () => {
      calls.push('snapshot');
      snapshotCall += 1;
      return snapshotCall === 1 ? initial : migrated;
    },
    importLegacy: async (payload) => { calls.push(['import', payload]); return { applied: true }; },
    readLegacy: () => { calls.push('legacy'); return { branding: { pharmacyName: 'ESAYOS' } }; },
    canEdit: true,
    migrationVersion: 1,
  });

  assert.equal(result.snapshot, migrated);
  assert.deepEqual(calls, [
    'snapshot',
    'legacy',
    ['import', { migrationVersion: 1, data: { branding: { pharmacyName: 'ESAYOS' } } }],
    'snapshot',
  ]);
  assert.equal(result.error, '');
  assert.equal(result.readOnly, false);
});

test('settings lifecycle preserves loaded snapshot when legacy import fails', async () => {
  const snapshot = { settings: {}, catalogs: {}, migrations: { legacyLocalStoragePending: true } };
  const result = await loadSettingsSnapshot({
    loadSnapshot: async () => snapshot,
    importLegacy: async () => { throw new Error('permission denied internals'); },
    readLegacy: () => ({}),
    canEdit: true,
  });

  assert.equal(result.snapshot, snapshot);
  assert.equal(result.readOnly, true);
  assert.match(result.error, /migra/i);
  assert.doesNotMatch(result.error, /permission denied/);
});

test('SettingsContext gates migration, protects async state and exposes hooks', async () => {
  const source = await readFile('src/configuration/SettingsContext.jsx', 'utf8');

  assert.match(source, /request\('configuration\.snapshot'/);
  assert.match(source, /readLegacySettings/);
  assert.match(source, /configuration\.importLegacy/);
  assert.match(source, /migrationVersion:\s*LEGACY_MIGRATION_VERSION/);
  assert.match(source, /requestGenerationRef/);
  assert.match(source, /inFlightLoadRef/);
  assert.match(source, /setState\(\{[\s\S]*snapshot:\s*null/);
  assert.match(source, /export function useCatalog/);
  assert.match(source, /includeInactive/);
  assert.match(source, /selectedCode/);
  assert.match(source, /includeEmpty/);
  assert.match(source, /emptyLabel/);
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
